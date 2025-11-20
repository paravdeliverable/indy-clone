@echo off
REM LinkedIn Scraper Backend Startup Script for Windows

echo 🚀 Starting LinkedIn Scraper Backend Server...
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo 🔧 Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/update dependencies
echo 📥 Installing dependencies...
pip install -r requirements.txt

REM Start the server
echo.
echo ✅ Starting server on http://localhost:8000
echo 💡 Press Ctrl+C to stop the server
echo.
python server.py

pause

