#!/bin/bash

echo "Stopping playit..."
pkill -f playit

echo "Stopping server..."
pkill -f "node ."

echo "Both playit and server have been stopped."