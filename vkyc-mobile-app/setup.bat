@echo off
echo ========================================
echo Video KYC Mobile App Setup
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Step 1: Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo Step 2: Checking .env file...
if not exist .env (
    echo WARNING: .env file not found!
    echo Creating .env from template...
    (
        echo # Mobile App Microservice Configuration
        echo.
        echo # Port for mobile app server
        echo MOBILE_APP_PORT=8080
        echo.
        echo # Backend API URL ^(Update this when your IP changes^)
        echo BACKEND_API_URL=http://localhost:5000/v1
        echo.
        echo # Backend Socket URL ^(Update this when your IP changes^)
        echo BACKEND_SOCKET_URL=http://localhost:5000
        echo.
        echo # Environment
        echo NODE_ENV=development
    ) > .env
    echo Created .env file with default values
    echo IMPORTANT: Edit .env and update the IP addresses!
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next Steps:
echo 1. Edit .env file and update IP addresses
echo 2. Run: npm start
echo 3. Access from mobile: http://YOUR_IP:8080
echo.
echo ========================================
pause