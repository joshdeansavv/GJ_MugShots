#!/bin/bash

# GJ Mugshots Website Startup Script
# This script starts both the API server and web server

cd /home/joshua/GJ_MugShots/Website

echo "🚀 Starting GJ Mugshots servers..."

# Kill any existing processes
pkill -f "node api-server.js" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
sleep 2

# Start API server
echo "📡 Starting API server on port 3001..."
nohup node api-server.js > api-server.log 2>&1 &
API_PID=$!

# Start web server
echo "🌐 Starting web server on port 6023..."
PORT=6023 HOST=0.0.0.0 nohup node server.js > web-server.log 2>&1 &
WEB_PID=$!

# Wait a moment for servers to start
sleep 3

# Check if servers are running
if ps -p $API_PID > /dev/null && ps -p $WEB_PID > /dev/null; then
    echo "✅ Both servers started successfully!"
    echo "📡 API Server PID: $API_PID"
    echo "🌐 Web Server PID: $WEB_PID"
    echo ""
    echo "🌐 Website is available at:"
    echo "   - Local: http://localhost:6023"
    echo "   - Network: http://192.168.1.178:6023"
    echo ""
    echo "📊 API is available at:"
    echo "   - http://192.168.1.178:3001/api/arrestees"
    echo ""
    echo "📝 Logs:"
    echo "   - API Server: /home/joshua/GJ_MugShots/Website/api-server.log"
    echo "   - Web Server: /home/joshua/GJ_MugShots/Website/web-server.log"
    echo ""
    echo "🔄 Monitoring servers... (Press Ctrl+C to stop)"
    
    # Keep the script running and monitor the servers
    while true; do
        sleep 30
        if ! ps -p $API_PID > /dev/null; then
            echo "❌ API Server died! Restarting..."
            pkill -f "api-server.js" 2>/dev/null
            nohup node api-server.js > api-server.log 2>&1 &
            API_PID=$!
        fi
        if ! ps -p $WEB_PID > /dev/null; then
            echo "❌ Web Server died! Restarting..."
            pkill -f "server.js" 2>/dev/null
            PORT=6023 HOST=0.0.0.0 nohup node server.js > web-server.log 2>&1 &
            WEB_PID=$!
        fi
    done
else
    echo "❌ Failed to start servers. Check logs for details."
    exit 1
fi
