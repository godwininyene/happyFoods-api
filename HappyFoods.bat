@echo off
title HappyFoods

echo.
echo  =========================================
echo   HappyFoods
echo  =========================================
echo.
echo  Starting application, please wait...
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js is not installed on this computer.
  echo  Please download and install it from https://nodejs.org
  echo  Install it with default settings, then try again.
  echo.
  pause
  exit /b 1
)

:: ── Backend ────────────────────────────────────────────────────────────────
set BACKEND=C:\xampp\htdocs\happyFoods-api

if not exist "%BACKEND%" (
  echo  ERROR: Backend folder not found at:
  echo  %BACKEND%
  echo  Please check the folder path and update this script.
  echo.
  pause
  exit /b 1
)

if not exist "%BACKEND%\node_modules" (
  echo  Installing backend dependencies for the first time...
  echo  This may take a minute, please wait...
  cd /d "%BACKEND%"
  npm install
  echo  Backend dependencies installed.
  echo.
)

:: ── Frontend ───────────────────────────────────────────────────────────────
set FRONTEND=C:\xampp\htdocs\HappyFoods

if not exist "%FRONTEND%" (
  echo  ERROR: Frontend folder not found at:
  echo  %FRONTEND%
  echo  Please check the folder path and update this script.
  echo.
  pause
  exit /b 1
)

if not exist "%FRONTEND%\node_modules" (
  echo  Installing frontend dependencies for the first time...
  echo  This may take a minute, please wait...
  cd /d "%FRONTEND%"
  npm install
  echo  Frontend dependencies installed.
  echo.
)

:: ── Launch both servers ────────────────────────────────────────────────────
echo  Launching backend server...
start "HappyFoods - Backend" cmd /k "cd /d %BACKEND% && npm run dev"

echo  Waiting for backend to connect to database...
timeout /t 4 /nobreak >nul

echo  Launching frontend...
start "HappyFoods - Frontend" cmd /k "cd /d %FRONTEND% && npm run dev"

echo  Waiting for frontend to compile...
timeout /t 6 /nobreak >nul

echo  Opening browser...
start http://localhost:5173

echo.
echo  =========================================
echo   Application is running!
echo  =========================================
echo.
echo  Backend  : http://localhost:5000
echo  Frontend : http://localhost:5173
echo.
echo  IMPORTANT: Do NOT close the two black
echo  terminal windows while using the app.
echo  Close them when you are done.
echo.
pause