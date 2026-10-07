---
name: hyread-ebook-extractor
description: HyRead 電子書每頁圖片自動擷取與儲存工具。當使用者說「擷取電子書」「下載 HyRead 電子書」「HyRead 存成圖片」「HyRead 截圖」「匯出 HyRead 每一頁」或提供 HyRead openbook2.jsp / reader.jsp 連結時載入。包含本機伺服器、瀏覽器自動翻頁擷取腳本與桌面自動存檔流程。
---

# HyRead 電子書每頁圖片自動擷取工具 (HyRead Ebook Page Extractor)

本技能提供一套完整、穩定的自動化擷取流程，能將 HyRead 線上閱讀器（`openbook2.jsp`、`reader.jsp`）中已借閱或購買的電子書，逐頁截取最高解析度原圖並自動儲存至使用者桌面的專屬資料夾。

---

## 為什麼需要瀏覽器內擷取架構？

HyRead 閱讀器網址帶有 AES 加密的臨時授權 Token（如 `openbook2.jsp?data=...`），且受限於使用者的會員登入 Session Cookie。
* 若直接以外部腳本（如 `curl` 或無 Cookie 的 Python/Node 爬蟲）發送 HTTP 請求，伺服器會直接回傳 **`401 Unauthorized (會員驗證失敗!!)`**。
* 最佳解法是：**在使用者已登入並開啟閱讀器的瀏覽器分頁中運行前端擷取腳本**，透過已解密的 DOM / Canvas / Blob 物件提取原圖，並將圖檔串流傳回本機 Node.js 伺服器，直接寫入桌面。

---

## 核心元件與檔案位置

| 元件 | 路徑 | 說明 |
|------|------|------|
| **本機接收伺服器** | `scripts/server.js` | 輕量 Node.js HTTP 伺服器，監聽 `127.0.0.1:45678`，接收前端送來的每頁圖檔並自動存入桌面。 |
| **瀏覽器擷取腳本** | `scripts/hyread-capture.js` | 注入瀏覽器的前端腳本，提供浮動控制面板、自動翻頁、Blob 攔截、Canvas 截圖與防重複機制。 |
| **一鍵啟動腳本** | `scripts/start-server.bat` | Windows 批次檔，雙擊即可啟動本機伺服器。 |
| **桌面捷徑** | `C:\Users\username\Desktop\啟動HyRead儲存伺服器.bat` | 方便使用者在桌面隨時一鍵啟動。 |

---

## 標準操作流程（給 Agent / 使用者執行）

### 步驟 1：啟動本機接收伺服器
在背景啟動 Node.js 伺服器：
```powershell
node "C:\Users\username\.gemini\config\skills\hyread-ebook-extractor\scripts\server.js"
```
* 伺服器會自動建立桌面輸出目錄：`C:\Users\username\Desktop\HyRead_電子書圖片`
* 若前端偵測到書籍標題，會自動以書名作為桌面子目錄名稱（如 `C:\Users\username\Desktop\書名`）。

### 步驟 2：在電子書分頁注入腳本
請使用者在瀏覽器開啟該書閱讀器分頁（例如 Chrome 或 Edge）：
1. 按下 **`F12`** 開啟開發者工具（或按右鍵 ➔ 點選「檢查」）。
2. 切換至 **`Console`（主控台）** 頁籤。
3. 貼上並執行單行載入指令：
```javascript
fetch('http://127.0.0.1:45678/hyread-capture.js').then(r=>r.text()).then(eval);
```

### 步驟 3：在浮動面板設定並開始擷取
電子書畫面右上角會顯示 **【📖 HyRead 電子書圖片擷取】** 面板：
1. **檢查連線**：顯示 `🟢 本機伺服器已連線 (自動存至桌面)`。
2. **翻頁方向**：
   * 橫排中文 / 英文書：選擇「👉 往右翻頁」。
   * 直排中文書 / 日本漫畫：選擇「👈 往左翻頁」。
3. **翻頁間隔**：預設 1.2 秒（若網路載入較慢可拉長至 1.5~2.0 秒）。
4. **單頁模式最佳化（建議）**：建議先在閱讀器設定切換至「單頁模式」，可獲取單頁最高解析度。
5. 點擊 **`▶️ 開始自動擷取 (存至桌面)`**。

### 步驟 4：自動處理與完成驗證
* 腳本會模擬鍵盤翻頁並點擊下一頁按鈕。
* 每一頁自動提取原圖，透過 POST 傳給本機伺服器存成 `page_001.jpg`、`page_002.jpg`...
* 到達書籍末頁（箭頭 disabled）或連續未有新頁面時會自動停止。
* 輸出目錄：`C:\Users\username\Desktop\HyRead_電子書圖片`。

---

## 備用模式（無 Node.js 伺服器時）

若本機伺服器未啟動，前端面板會自動切換為 **瀏覽器原生模式**：
1. **桌面資料夾直接寫入（File System Access API）**：
   點擊按鈕時瀏覽器會彈出 Windows 資料夾選擇器，讓使用者選擇桌面資料夾，腳本便直接將圖檔寫入該資料夾。
2. **ZIP 打包下載**：
   點擊「📦 手動打包下載為 ZIP 檔」，腳本會將所有快取的圖片用 `JSZip` 打包為 `.zip` 檔並自動觸發瀏覽器下載。

---

## 常見問題排解 (Troubleshooting)

1. **埠號 45678 被佔用**：
   ```powershell
   Get-Process -Id (Get-NetTCPConnection -LocalPort 45678).OwningProcess | Stop-Process -Force
   ```
2. **閱讀器翻頁沒有反應**：
   * 請確認閱讀器畫面已取得焦點（可先手動翻一頁）。
   * 檢查翻頁方向（右翻或左翻）是否選對。
3. **圖片有缺頁或重複**：
   * 調大「翻頁等待延遲」（如設為 1.8 秒），讓 HyRead 前端解密圖片有充足的時間載入。
