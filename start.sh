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
echo "Starting the server..."
nohup node . &> server.log &

echo "server has been started."