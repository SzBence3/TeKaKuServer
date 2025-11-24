#!/bin/bash

# Fetch updates from the git repository
echo "Checking for updates in the git repository..."

cd /home/szbence/dev/TeKaKuServer || cd .
cd /home/gergo/Documents/TeKaKuServer || cd .

git fetch
if ! git diff --quiet HEAD origin/main; then
    echo "Updates found. Pulling changes..."
    git pull
else
    echo "No updates found."
fi

# Start the server
PID_FILE="server.pid"

if [[ -f "$PID_FILE" ]]; then
    EXISTING_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [[ -n "$EXISTING_PID" ]] && ps -p "$EXISTING_PID" > /dev/null 2>&1; then
        echo "Server already appears to be running with PID $EXISTING_PID. Stop it before starting a new instance."
        exit 1
    fi
    rm -f "$PID_FILE"
fi

echo "Starting the server..."
nohup node . &> server.log &
NODE_PID=$!
echo "$NODE_PID" > "$PID_FILE"

echo "server has been started with PID $NODE_PID."