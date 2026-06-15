@echo off
echo ===================================================
echo LocalFlow Installer Build System
echo ===================================================

echo.
echo [0/4] Compiling main LocalFlow application...
set PATH=%CD%\lib\dll;%PATH%
wails build

echo.
echo [1/4] Preparing payload directories...
if exist temp_payload rmdir /s /q temp_payload
mkdir temp_payload

echo.
echo [2/4] Copying files to payload...
copy "build\bin\LocalFlow.exe" "temp_payload\"
copy "lib\dll\*.dll" "temp_payload\"
mkdir "temp_payload\lib"
powershell -Command "Get-ChildItem -Path 'lib' -File | Copy-Item -Destination 'temp_payload\lib\'"

echo [2.5/4] Copying GCC runtime DLL dependencies...
copy "C:\Enviornment\MinGW\x86_64-w64-mingw32\lib\gcc\x86_64-w64-mingw32\15.2.0\libstdc++-6-x64.dll" "temp_payload\"
copy "C:\Enviornment\MinGW\x86_64-w64-mingw32\lib\gcc\x86_64-w64-mingw32\15.2.0\libstdc++-6-x64.dll" "temp_payload\lib\"
copy "C:\Enviornment\MinGW\bin\libgcc_s_seh-1.dll" "temp_payload\"
copy "C:\Enviornment\MinGW\bin\libgcc_s_seh-1.dll" "temp_payload\lib\"
copy "C:\Enviornment\MinGW\bin\libwinpthread-1.dll" "temp_payload\"
copy "C:\Enviornment\MinGW\bin\libwinpthread-1.dll" "temp_payload\lib\"

echo.
echo Waiting for file locks to release...
powershell -Command "Start-Sleep -s 4"

echo.
echo [3/4] Zipping payload using PowerShell...
if exist "installer\payload.zip" del "installer\payload.zip"
powershell -Command "Compress-Archive -Path 'temp_payload\*' -DestinationPath 'installer\payload.zip' -Force"
rmdir /s /q temp_payload
echo Payload compressed successfully!

echo.
echo [4/4] Building Installer Wails app...
cd installer
wails build
cd ..

echo.
echo ===================================================
echo Build complete! Installer available at:
echo installer\build\bin\LocalFlowSetup.exe
echo ===================================================
