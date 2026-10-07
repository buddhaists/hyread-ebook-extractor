@echo off
chcp 65001 >nul
title HyRead 電子書本機儲存伺服器
cd /d "%~dp0"
echo ========================================================
echo   HyRead 電子書圖片接收伺服器 (Skill 版本)
echo   圖片將直接儲存至桌面「HyRead_電子書圖片」資料夾
echo ========================================================
"C:\Program Files\nodejs\node.exe" server.js
if %ERRORLEVEL% NEQ 0 (
    node server.js
)
pause
