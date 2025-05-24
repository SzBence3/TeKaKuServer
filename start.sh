#!/bin/bash

# Fetch updates from the git repository
echo "Checking for updates in the git repository..."
cd /home/szbence/dev/TeKaKuServer || exit
git fetch
if ! git diff --quiet HEAD origin/main; then
    echo "Updates found. Pulling changes..."
    git pull
else
    echo "No updates found."
fi

# Start the playit application
echo "Starting the playit application..."
nohup playit &> playit.log &

# Start the server
echo "Starting the server..."
nohup node . &> server.log &

echo "Both server and playit application have been started."