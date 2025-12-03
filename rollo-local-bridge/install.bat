@echo off
echo ========================================
echo   Zebra Print Bridge Installer
echo ========================================
echo.

set INSTALL_DIR=%APPDATA%\ZebraPrintBridge
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

echo Installing to: %INSTALL_DIR%
echo.

:: Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy executable
copy /Y "ZebraPrintBridge.exe" "%INSTALL_DIR%\ZebraPrintBridge.exe"
if errorlevel 1 (
    echo ERROR: Could not copy executable. Make sure ZebraPrintBridge.exe is in the same folder as this script.
    pause
    exit /b 1
)

echo Executable copied successfully.
echo.

:: Ask about auto-start
set /p AUTOSTART="Add to Windows startup? (Y/N): "
if /i "%AUTOSTART%"=="Y" (
    :: Create shortcut in startup folder
    echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
    echo sLinkFile = "%STARTUP_DIR%\ZebraPrintBridge.lnk" >> "%TEMP%\CreateShortcut.vbs"
    echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
    echo oLink.TargetPath = "%INSTALL_DIR%\ZebraPrintBridge.exe" >> "%TEMP%\CreateShortcut.vbs"
    echo oLink.WorkingDirectory = "%INSTALL_DIR%" >> "%TEMP%\CreateShortcut.vbs"
    echo oLink.Description = "Zebra Print Bridge" >> "%TEMP%\CreateShortcut.vbs"
    echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"
    cscript /nologo "%TEMP%\CreateShortcut.vbs"
    del "%TEMP%\CreateShortcut.vbs"
    echo Auto-start enabled!
) else (
    echo Skipping auto-start setup.
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo To run now, execute:
echo   "%INSTALL_DIR%\ZebraPrintBridge.exe"
echo.

set /p RUNNOW="Start the bridge now? (Y/N): "
if /i "%RUNNOW%"=="Y" (
    start "" "%INSTALL_DIR%\ZebraPrintBridge.exe"
    echo Bridge started!
)

echo.
pause
