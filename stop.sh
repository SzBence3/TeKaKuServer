#!/bin/bash

PID_FILE="server.pid"

echo "Stopping server..."

if [[ ! -f "$PID_FILE" ]]; then
	echo "No PID file found. Server may already be stopped."
	exit 0
fi

SERVER_PID=$(cat "$PID_FILE" 2>/dev/null)

if [[ -z "$SERVER_PID" ]]; then
	echo "PID file is empty. Removing stale file."
	rm -f "$PID_FILE"
	exit 1
fi

if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
	echo "No running process with PID $SERVER_PID. Removing stale PID file."
	rm -f "$PID_FILE"
	exit 0
fi

kill "$SERVER_PID"

for attempt in 1 2 3 4 5; do
	if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
		break
	fi
	sleep 1
done

if ps -p "$SERVER_PID" > /dev/null 2>&1; then
	echo "Process $SERVER_PID did not exit after SIGTERM. Sending SIGKILL..."
	kill -9 "$SERVER_PID"
fi

rm -f "$PID_FILE"

echo "Server has been stopped."