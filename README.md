# HyRead 電子書每頁圖片自動擷取工具 (HyRead Ebook Page Extractor)

一套專門為 HyRead 線上電子書閱讀器（`openbook2.jsp`、`reader.jsp`）打造的自動化高解析度圖片擷取與儲存工具。

支援自動逐頁翻頁、原始 Blob/Canvas 影像攔截、串流儲存至桌面資料夾，並打包封裝為 Antigravity AI Agent 專屬技能（Skill）。

---

## 🌟 特色

1. **繞過 DRM 外部驗證失敗問題**：
   HyRead 閱讀器網址受會員 Session 與動態 Token 保護，外部獨立爬蟲會直接回傳 `401 Unauthorized`。本工具直接在瀏覽器已登入的分頁中運行，無痛擷取前端已解密的最高畫質原圖。
2. **自動翻頁與即時儲存**：
   提供前端浮動控制面板，自動模擬翻頁、等待載入、攔截每頁圖片，並透過本機 Node.js 伺服器即時寫入桌面資料夾（如 `桌面/HyRead_電子書圖片` 或 `桌面/書名`）。
3. **支援多種翻頁模式**：
   支援向右翻頁（一般橫排書籍）與向左翻頁（直排書籍、日本漫畫），可自由調節翻頁等待延遲（避免遺漏）。
4. **雙重備用機制**：
   若未啟動本機伺服器，自動無縫切換為瀏覽器原生「桌面資料夾存取授權（File System Access API）」或「一鍵打包下載 ZIP 檔」。
5. **已封裝為 Antigravity Skill**：
   內含完整的 `SKILL.md`，可隨時掛載至 Google Antigravity / Claude Code / Copilot 等 Agent 環境中。

---

## 📁 專案結構

```
├── hyread-capture.js        # 瀏覽器前端控制面板與擷取核心腳本
├── server.js                # 本機 HTTP 圖檔接收伺服器 (Port 45678)
├── skills/
│   └── hyread-ebook-extractor/
│       ├── SKILL.md         # Antigravity 標準技能說明與 SOP
│       └── scripts/
│           ├── server.js
│           ├── hyread-capture.js
│           └── start-server.bat
├── README.md
└── .gitignore
```

---

## 🚀 快速開始

### 步驟 1：啟動本機伺服器
```bash
node server.js
```
伺服器將在 `http://127.0.0.1:45678` 啟動，並在桌面自動建立儲存資料夾。

### 步驟 2：在電子書閱讀器分頁注入腳本
在瀏覽器（Chrome 或 Edge）開啟已借閱的 HyRead 電子書閱讀頁面：
1. 按下鍵盤 **`F12`** 開啟開發者工具（或按右鍵 ➔「檢查」）。
2. 切換到 **`Console`（主控台）** 頁籤。
3. 貼上以下單行指令並按 **`Enter`**：

```javascript
fetch('http://127.0.0.1:45678/hyread-capture.js').then(r=>r.text()).then(eval);
```

### 步驟 3：開始自動擷取
畫面右上角將出現控制面板：
* 確認狀態顯示 `🟢 本機伺服器已連線 (自動存至桌面)`。
* 選擇翻頁方向（👉 往右 或 👈 往左）。
* 點選 **`▶️ 開始自動擷取 (存至桌面)`**，程式即會逐頁翻頁並存檔完成！

---

## 📄 授權條款
僅供個人學習、學術研究與已合法借閱之個人筆記備份用途，請尊重數位版權與各圖書館電子資源使用規範。
