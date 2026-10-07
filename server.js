const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const desktopDir = path.join(os.homedir(), 'Desktop', 'HyRead_電子書圖片');
if (!fs.existsSync(desktopDir)) {
    fs.mkdirSync(desktopDir, { recursive: true });
}

const server = http.createServer((req, res) => {
    // 允許跨來源請求 (從 HyRead 網頁發送 fetch)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Page-Num, X-File-Ext, X-Book-Title');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', savePath: desktopDir }));
        return;
    }

    if (req.url === '/hyread-capture.js') {
        const scriptPath = path.join(__dirname, 'hyread-capture.js');
        if (fs.existsSync(scriptPath)) {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(fs.readFileSync(scriptPath));
            return;
        }
    }

    if (req.method === 'POST' && req.url === '/save-page') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const pageNum = req.headers['x-page-num'] || '001';
            const ext = req.headers['x-file-ext'] || 'jpg';
            const bookTitle = req.headers['x-book-title'] ? decodeURIComponent(req.headers['x-book-title']).replace(/[\\/:*?"<>|]/g, '_') : '';

            let targetFolder = desktopDir;
            if (bookTitle) {
                targetFolder = path.join(os.homedir(), 'Desktop', bookTitle);
                if (!fs.existsSync(targetFolder)) {
                    fs.mkdirSync(targetFolder, { recursive: true });
                }
            }

            const buf = Buffer.concat(chunks);
            const isJpeg = buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
            const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
            const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';

            if (!isJpeg && !isPng && !isWebp) {
                console.warn(`[略過非圖片檔案] 接收到非圖檔資料 (${buf.length} bytes)，不予寫入。`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ignored', reason: 'not_an_image' }));
                return;
            }

            const realExt = isJpeg ? 'jpg' : (isPng ? 'png' : 'webp');
            const filename = `page_${String(pageNum).padStart(3, '0')}.${realExt}`;
            const targetPath = path.join(targetFolder, filename);

            fs.writeFileSync(targetPath, buf);
            console.log(`[成功儲存] ${filename} -> ${targetPath} (${Math.round(buf.length / 1024)} KB)`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', filename, path: targetPath }));
        });
        return;
    }

    res.writeHead(404);
    res.end();
});

const PORT = 45678;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`=================================================`);
    console.log(`[HyRead 電子書本機儲存伺服器已啟動]`);
    console.log(`監聽網址: http://127.0.0.1:${PORT}`);
    console.log(`預設桌面儲存目錄: ${desktopDir}`);
    console.log(`=================================================`);
});
