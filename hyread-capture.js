/**
 * HyRead 電子書每頁圖片自動擷取腳本 (HyRead Ebook Page Capturer)
 * 可在 HyRead 線上閱讀器 (openbook2.jsp / reader.jsp) 瀏覽器主控台 (F12) 直接執行
 */
(function() {
    // 避免重複載入
    if (window.__hyread_capturer_loaded) {
        alert("擷取工具已經在運行中！請看畫面右上角的控制面板。");
        return;
    }
    window.__hyread_capturer_loaded = true;

    // 攔截 URL.createObjectURL 以獲取最原始的高解析度圖片 Blob
    window.__hyread_blobs = window.__hyread_blobs || [];
    const _origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(obj) {
        if (obj instanceof Blob && (obj.type.startsWith('image/') || (obj.type === '' && obj.size > 20000))) {
            const slice = obj.slice(0, 4);
            slice.arrayBuffer().then(buf => {
                const b = new Uint8Array(buf);
                const isImg = (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0x52 && b[1] === 0x49);
                if (isImg) {
                    window.__hyread_blobs.push(obj);
                }
            }).catch(() => {});
        }
        return _origCreateObjectURL.apply(this, arguments);
    };

    // 動態載入 JSZip (供打包下載備用)
    if (!window.JSZip) {
        const jszipScript = document.createElement('script');
        jszipScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.head.appendChild(jszipScript);
    }

    // 狀態變數
    let isRunning = false;
    let isPaused = false;
    let currentPageIndex = 0;
    let savedImagesCount = 0;
    let localServerOnline = false;
    let selectedDirHandle = null;
    let capturedBlobs = [];
    const processedHashes = new Set();

    // 偵測書名
    function getBookTitle() {
        const titleEl = document.querySelector('.title-bar, .book-title, #hyread-epub-reader .title, h1, title');
        let t = (titleEl ? titleEl.innerText : document.title) || 'HyRead_電子書';
        return t.trim().replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    }

    // 檢查本機 Node.js 伺服器
    async function checkLocalServer() {
        try {
            const res = await fetch('http://127.0.0.1:45678/ping', { method: 'GET', signal: AbortSignal.timeout(1000) });
            if (res.ok) {
                const data = await res.json();
                return data.status === 'ready';
            }
        } catch (e) {}
        return false;
    }

    // 建立浮動 UI 面板
    const panel = document.createElement('div');
    panel.id = 'hyread-capturer-panel';
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 330px;
        background: rgba(30, 35, 45, 0.95);
        color: #f0f0f0;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft JhengHei", sans-serif;
        font-size: 13px;
        line-height: 1.5;
        backdrop-filter: blur(10px);
        overflow: hidden;
    `;

    panel.innerHTML = `
        <div style="background: #252d3d; padding: 12px 16px; font-weight: bold; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
            <span>📖 HyRead 電子書圖片擷取</span>
            <button id="hy-close-btn" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 16px;">✖</button>
        </div>
        <div style="padding: 16px;">
            <div id="hy-server-status" style="margin-bottom: 12px; padding: 6px 10px; border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 12px; display: flex; align-items: center; gap: 6px;">
                <span id="hy-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #ffaa00; display: inline-block;"></span>
                <span id="hy-status-text">連線狀態檢測中...</span>
            </div>

            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 4px;">翻頁方向：</label>
                <select id="hy-direction" style="width: 100%; padding: 6px 8px; border-radius: 6px; background: #1a202c; color: white; border: 1px solid #4a5568;">
                    <option value="right">👉 往右翻頁 (一般橫排書籍)</option>
                    <option value="left">👈 往左翻頁 (直排書籍 / 日本漫畫)</option>
                </select>
            </div>

            <div style="margin-bottom: 14px;">
                <label style="display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 4px;">
                    <span>翻頁等待延遲：</span>
                    <span id="hy-delay-val">1.2 秒</span>
                </label>
                <input id="hy-delay" type="range" min="0.5" max="3.0" step="0.1" value="1.2" style="width: 100%;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
                <button id="hy-start-btn" style="background: #2563eb; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                    ▶️ 開始自動擷取 (存至桌面)
                </button>
                <div style="display: flex; gap: 8px;">
                    <button id="hy-pause-btn" disabled style="flex: 1; background: #4b5563; color: white; border: none; padding: 8px; border-radius: 6px; cursor: not-allowed;">
                        ⏸️ 暫停
                    </button>
                    <button id="hy-stop-btn" disabled style="flex: 1; background: #ef4444; color: white; border: none; padding: 8px; border-radius: 6px; cursor: not-allowed;">
                        ⏹️ 停止
                    </button>
                </div>
                <button id="hy-zip-btn" style="background: #059669; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                    📦 手動打包下載為 ZIP 檔
                </button>
            </div>

            <div id="hy-progress-box" style="margin-top: 14px; display: none;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <span id="hy-progress-info">準備擷取...</span>
                    <span id="hy-count-info">0 張</span>
                </div>
                <div style="width: 100%; height: 6px; background: #374151; border-radius: 3px; overflow: hidden;">
                    <div id="hy-progress-bar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.2s;"></div>
                </div>
            </div>
            <div id="hy-log" style="margin-top: 10px; font-size: 11px; color: #9ca3af; max-height: 80px; overflow-y: auto; word-break: break-all; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                點擊「開始自動擷取」即可自動翻頁儲存每一頁圖片。
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // UI 元件
    const closeBtn = panel.querySelector('#hy-close-btn');
    const statusDot = panel.querySelector('#hy-status-dot');
    const statusText = panel.querySelector('#hy-status-text');
    const directionSelect = panel.querySelector('#hy-direction');
    const delaySlider = panel.querySelector('#hy-delay');
    const delayVal = panel.querySelector('#hy-delay-val');
    const startBtn = panel.querySelector('#hy-start-btn');
    const pauseBtn = panel.querySelector('#hy-pause-btn');
    const stopBtn = panel.querySelector('#hy-stop-btn');
    const zipBtn = panel.querySelector('#hy-zip-btn');
    const progressBox = panel.querySelector('#hy-progress-box');
    const progressInfo = panel.querySelector('#hy-progress-info');
    const countInfo = panel.querySelector('#hy-count-info');
    const progressBar = panel.querySelector('#hy-progress-bar');
    const logBox = panel.querySelector('#hy-log');

    function log(msg) {
        logBox.innerHTML = `<div>${msg}</div>` + logBox.innerHTML;
    }

    closeBtn.onclick = () => {
        if (isRunning && !confirm("擷取仍在進行中，確定要關閉面板嗎？")) return;
        isRunning = false;
        panel.remove();
        window.__hyread_capturer_loaded = false;
    };

    delaySlider.oninput = () => {
        delayVal.innerText = delaySlider.value + " 秒";
    };

    // 檢查本機 Node.js 伺服器連線
    async function updateServerStatus() {
        localServerOnline = await checkLocalServer();
        if (localServerOnline) {
            statusDot.style.background = '#10b981';
            statusText.innerText = '🟢 本機伺服器已連線 (自動存至桌面)';
            startBtn.innerText = '▶️ 開始自動擷取 (存至桌面)';
        } else {
            statusDot.style.background = '#60a5fa';
            statusText.innerText = '📁 瀏覽器模式 (選擇桌面資料夾儲存)';
            startBtn.innerText = '▶️ 選擇桌面資料夾並開始擷取';
        }
    }
    updateServerStatus();
    setInterval(updateServerStatus, 5000);

    // 獲取當前頁面所有圖片 / Canvas 的 Blob 物件
    async function getCurrentPageBlobs() {
        const results = [];
        const allDocs = [document];

        // 搜尋所有 iframe (EPUB 閱讀器常用 iframe 載入章節)
        document.querySelectorAll('iframe').forEach(frame => {
            try {
                if (frame.contentDocument) allDocs.push(frame.contentDocument);
            } catch (e) {}
        });

        for (const doc of allDocs) {
            // 1. 抓取 Canvas
            const canvases = doc.querySelectorAll('canvas');
            for (const cvs of canvases) {
                if (cvs.width > 250 && cvs.height > 250) {
                    try {
                        const blob = await new Promise(res => cvs.toBlob(res, 'image/jpeg', 0.95));
                        if (blob && blob.size > 5000) results.push({ blob, width: cvs.width, height: cvs.height });
                    } catch (e) {}
                }
            }

            // 2. 抓取 <img> 標籤 (包含 blob:、data: 與一般圖片)
            const imgs = doc.querySelectorAll('img');
            for (const img of imgs) {
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                // 過濾掉工具列圖示 (只抓大於 250x300 的書頁圖)
                if (w > 250 && h > 300) {
                    let blob = null;
                    if (img.src && img.src.startsWith('blob:')) {
                        try {
                            const res = await fetch(img.src);
                            if (res.ok) blob = await res.blob();
                        } catch (e) {}
                    }
                    if (!blob) {
                        try {
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = w;
                            tempCanvas.height = h;
                            const ctx = tempCanvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            blob = await new Promise(res => tempCanvas.toBlob(res, 'image/jpeg', 0.95));
                        } catch (e) {}
                    }
                    if (blob && blob.size > 5000) {
                        results.push({ blob, width: w, height: h });
                    }
                }
            }

            // 3. 抓取 SVG 內的 <image>
            const svgImages = doc.querySelectorAll('svg image');
            for (const svgImg of svgImages) {
                const href = svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href');
                if (href) {
                    try {
                        const res = await fetch(href);
                        if (res.ok) {
                            const blob = await res.blob();
                            if (blob && blob.size > 5000) results.push({ blob, width: 800, height: 1200 });
                        }
                    } catch (e) {}
                }
            }
        }

        // 如果在 URL.createObjectURL 中有新捕獲的 Blob
        if (window.__hyread_blobs && window.__hyread_blobs.length > 0) {
            while (window.__hyread_blobs.length > 0) {
                const b = window.__hyread_blobs.shift();
                results.push({ blob: b, width: 800, height: 1200 });
            }
        }

        return results;
    }

    // 計算 Blob 簡單特徵碼防重複
    function getBlobSignature(blob) {
        return `${blob.size}_${blob.type}`;
    }

    // 儲存單一圖片 (支援本機 Node 伺服器或 File System Access API)
    async function saveImageBlob(blob, pageIndex) {
        const bookTitle = getBookTitle();
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const fileName = `page_${String(pageIndex).padStart(3, '0')}.${ext}`;

        capturedBlobs.push({ fileName, blob });

        if (localServerOnline) {
            // 透過本機伺服器儲存至桌面
            try {
                const res = await fetch('http://127.0.0.1:45678/save-page', {
                    method: 'POST',
                    headers: {
                        'X-Page-Num': String(pageIndex),
                        'X-File-Ext': ext,
                        'X-Book-Title': encodeURIComponent(bookTitle)
                    },
                    body: blob
                });
                if (res.ok) return true;
            } catch (e) {
                console.error("Local server save failed", e);
            }
        }

        if (selectedDirHandle) {
            // 透過 File System Access API 直接寫入使用者選定的桌面資料夾
            try {
                const fileHandle = await selectedDirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (e) {
                console.error("DirectoryPicker save failed", e);
            }
        }

        return false;
    }

    // 模擬翻頁動作
    function triggerTurnPage(direction) {
        const isRight = (direction === 'right');
        const arrowClass = isRight ? '.pager__arrow--right' : '.pager__arrow--left';
        const keyCode = isRight ? 39 : 37;
        const keyName = isRight ? 'ArrowRight' : 'ArrowLeft';

        // 檢查是否已到最後一頁 (箭頭 disabled)
        const arrowBtn = document.querySelector(arrowClass);
        if (arrowBtn) {
            if (arrowBtn.classList.contains('pager__arrow--disabled') || arrowBtn.disabled) {
                return false; // 到達終點
            }
            arrowBtn.click();
        }

        // 觸發鍵盤事件
        const allTargets = [document, document.body];
        document.querySelectorAll('iframe').forEach(f => {
            try { if (f.contentDocument) allTargets.push(f.contentDocument); } catch (e) {}
        });

        for (const target of allTargets) {
            target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: keyName, code: keyName, keyCode: keyCode, which: keyCode }));
            target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: keyName, code: keyName, keyCode: keyCode, which: keyCode }));
        }

        return true;
    }

    // 檢查是否已達尾頁
    function isAtLastPage(direction) {
        const isRight = (direction === 'right');
        const arrow = document.querySelector(isRight ? '.pager__arrow--right' : '.pager__arrow--left');
        if (arrow && (arrow.classList.contains('pager__arrow--disabled') || arrow.disabled)) {
            return true;
        }
        return false;
    }

    // 擷取流程主迴圈
    async function startCapturing() {
        if (isRunning) return;

        // 如果沒有本機伺服器，讓使用者選擇桌面資料夾
        if (!localServerOnline && !selectedDirHandle) {
            if ('showDirectoryPicker' in window) {
                try {
                    log("請在彈出的視窗中，選擇或新建桌面的儲存資料夾...");
                    selectedDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                } catch (e) {
                    alert("未選擇資料夾，將僅在記憶體中暫存，結束時請點擊「打包下載為 ZIP 檔」。");
                }
            }
        }

        isRunning = true;
        isPaused = false;
        currentPageIndex = 1;
        savedImagesCount = 0;
        processedHashes.clear();
        capturedBlobs = [];

        startBtn.disabled = true;
        startBtn.style.background = '#6b7280';
        pauseBtn.disabled = false;
        pauseBtn.style.background = '#eab308';
        pauseBtn.style.cursor = 'pointer';
        stopBtn.disabled = false;
        stopBtn.style.background = '#ef4444';
        stopBtn.style.cursor = 'pointer';
        progressBox.style.display = 'block';

        const direction = directionSelect.value;
        log(`開始擷取！翻頁方向：${direction === 'right' ? '向右' : '向左'}`);

        let consecutiveNoNewPages = 0;

        while (isRunning) {
            if (isPaused) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }

            progressInfo.innerText = `正在擷取第 ${currentPageIndex} 頁...`;
            log(`📸 正在擷取當前頁面...`);

            // 1. 抓取當前頁面圖片
            const pageBlobs = await getCurrentPageBlobs();
            let hasNewImage = false;

            for (const item of pageBlobs) {
                const sig = getBlobSignature(item.blob);
                if (!processedHashes.has(sig)) {
                    processedHashes.add(sig);
                    savedImagesCount++;
                    await saveImageBlob(item.blob, savedImagesCount);
                    hasNewImage = true;
                    countInfo.innerText = `${savedImagesCount} 張`;
                    log(`已儲存第 ${savedImagesCount} 張圖 (${item.width}x${item.height})`);
                }
            }

            if (!hasNewImage) {
                consecutiveNoNewPages++;
            } else {
                consecutiveNoNewPages = 0;
            }

            // 檢查是否已經到達最後一頁
            if (isAtLastPage(direction) || consecutiveNoNewPages >= 3) {
                log(`🏁 已偵測到底部或翻至最後一頁！`);
                break;
            }

            // 2. 翻頁
            const canTurn = triggerTurnPage(direction);
            if (!canTurn) {
                log(`🏁 翻頁按鈕已到達終點。`);
                break;
            }

            currentPageIndex++;
            const delay = parseFloat(delaySlider.value) * 1000;
            await new Promise(r => setTimeout(r, delay));
        }

        // 結束收尾
        isRunning = false;
        startBtn.disabled = false;
        startBtn.style.background = '#2563eb';
        pauseBtn.disabled = true;
        pauseBtn.style.background = '#4b5563';
        pauseBtn.style.cursor = 'not-allowed';
        stopBtn.disabled = true;
        stopBtn.style.background = '#4b5563';
        stopBtn.style.cursor = 'not-allowed';

        progressInfo.innerText = `擷取完成！`;
        log(`🎉 擷取完成！共儲存 ${savedImagesCount} 張頁面圖片。`);

        if (localServerOnline) {
            alert(`🎉 電子書每頁圖片已成功儲存至桌面！\n共 ${savedImagesCount} 張圖片。`);
        } else if (selectedDirHandle) {
            alert(`🎉 圖片已成功儲存至您選擇的資料夾！\n共 ${savedImagesCount} 張圖片。`);
        } else {
            alert(`🎉 已擷取 ${savedImagesCount} 張圖片！\n請點擊「手動打包下載為 ZIP 檔」儲存到電腦。`);
        }
    }

    // 暫停按鈕
    pauseBtn.onclick = () => {
        isPaused = !isPaused;
        if (isPaused) {
            pauseBtn.innerText = '▶️ 繼續';
            pauseBtn.style.background = '#10b981';
            log('⏸️ 已暫停擷取');
        } else {
            pauseBtn.innerText = '⏸️ 暫停';
            pauseBtn.style.background = '#eab308';
            log('▶️ 繼續擷取');
        }
    };

    // 停止按鈕
    stopBtn.onclick = () => {
        isRunning = false;
        log('⏹️ 已手動停止擷取');
    };

    // 開始按鈕
    startBtn.onclick = () => {
        startCapturing();
    };

    // 打包 ZIP 下載按鈕
    zipBtn.onclick = async () => {
        if (!capturedBlobs.length) {
            alert("目前尚無擷取到的圖片！請先點擊「開始自動擷取」。");
            return;
        }
        if (!window.JSZip) {
            alert("JSZip 套件載入中，請稍候 3 秒後再試！");
            return;
        }
        zipBtn.innerText = '⏳ 正在打包中...';
        zipBtn.disabled = true;
        try {
            const zip = new window.JSZip();
            capturedBlobs.forEach(item => {
                zip.file(item.fileName, item.blob);
            });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const dlLink = document.createElement('a');
            dlLink.href = URL.createObjectURL(zipBlob);
            dlLink.download = `${getBookTitle()}.zip`;
            dlLink.click();
            log(`📦 ZIP 檔案已觸發下載！`);
        } catch (e) {
            alert("打包失敗: " + e.message);
        } finally {
            zipBtn.innerText = '📦 手動打包下載為 ZIP 檔';
            zipBtn.disabled = false;
        }
    };

    log("✅ 控制面板初始化完成！隨時可開始擷取。");
})();
