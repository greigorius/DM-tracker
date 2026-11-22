@echo off
rem Axiom DL Hub - local dev: starts the API server, waits for it, then starts the site and opens the browser.
cd /d "%~dp0"

if not exist node_modules (
  echo Installing packages...
  call npm install || goto :error
)
if not exist .env (
  echo No .env file found. Copy .env.example to .env and add NOTION_TOKEN.
  pause
  exit /b 1
)

rem API on http://localhost:3001 (also syncs the Notion snapshot every 5 minutes)
start "Hub API" cmd /k npm run server

rem Wait until the API answers, so the first page load does not hit a 502
echo Waiting for the Hub API on port 3001...
set /a tries=0
:wait
curl -s -o nul http://localhost:3001/api/health && goto :ready
set /a tries+=1
if %tries% geq 60 (
  echo The API did not start. Check the "Hub API" window for errors.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait

:ready
rem Site on http://localhost:5173 - Vite opens the browser when it is ready
start "Hub Site" cmd /k npm run dev -- --open
exit /b 0

:error
echo npm install failed.
pause
exit /b 1
