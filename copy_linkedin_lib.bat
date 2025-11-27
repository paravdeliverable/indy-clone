@echo off
REM Script to copy linkedin.py to venv location (Windows)
REM Usage: copy_linkedin_lib.bat

REM Get the directory where the script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Source file
set "SOURCE_FILE=linkedin.py"

REM Destination file
set "DEST_FILE=linkedin-extension\backend\venv\lib\python3.9\site-packages\linkedin_api\linkedin.py"

REM Check if source file exists
if not exist "%SOURCE_FILE%" (
    echo ❌ Error: %SOURCE_FILE% not found in current directory
    echo    Please make sure linkedin.py exists in the project root
    exit /b 1
)

REM Check if destination directory exists
set "DEST_DIR=%~dp0linkedin-extension\backend\venv\lib\python3.9\site-packages\linkedin_api"
if not exist "%DEST_DIR%" (
    echo ❌ Error: Destination directory does not exist: %DEST_DIR%
    echo    Please make sure the venv is set up correctly
    exit /b 1
)

REM Create backup of existing file if it exists
if exist "%DEST_FILE%" (
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
    for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
    set "mytime=%mytime: =0%"
    set "BACKUP_FILE=%DEST_FILE%.backup.%mydate%_%mytime%"
    echo 📦 Creating backup of existing file: %BACKUP_FILE%
    copy "%DEST_FILE%" "%BACKUP_FILE%" >nul
)

REM Copy the file
echo 📋 Copying %SOURCE_FILE% to %DEST_FILE%...
copy "%SOURCE_FILE%" "%DEST_FILE%" >nul

REM Check if copy was successful
if %errorlevel% equ 0 (
    echo ✅ Successfully copied linkedin.py to venv location
    echo    Restart your server for changes to take effect
) else (
    echo ❌ Error: Failed to copy file
    exit /b 1
)

