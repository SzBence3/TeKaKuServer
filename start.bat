@echo off

REM Fetch updates from the git repository
echo Checking for updates in the git repository...
cd /d %~dp0
git fetch
git diff --quiet HEAD origin/main
if errorlevel 1 (
    echo Updates found. Pulling changes...
    git pull
) else (
    echo No updates found.
)

REM Start the playit application
echo Starting the playit application...
start "" /b playit > playit.log 2>&1

REM Start the server
echo Starting the server...
start "" /b node . > server.log 2>&1

echo Both server and playit application have been started.