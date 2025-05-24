@echo off

REM Stop playit application
echo Stopping playit...
taskkill /IM playit.exe /F

REM Stop the server
echo Stopping server...
taskkill /IM node.exe /F

echo Both playit and server have been stopped.