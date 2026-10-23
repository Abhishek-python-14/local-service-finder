@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js install nahi hai. Pehle https://nodejs.org se install karo. & pause & exit /b)
rem purana server agar port 3000 par atka ho to band karo
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul
echo Server chalu ho raha hai. Is window ko band mat karna.
echo Website: http://localhost:3000   Admin: http://localhost:3000/admin.html  (password: ABHI-112)
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000/admin.html"
node server/server.mjs
pause
