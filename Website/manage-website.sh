#!/bin/bash

# GJ Mugshots Website Management Script
# This script helps you manage the website service

case "$1" in
    start)
        echo "🚀 Starting GJ Mugshots website..."
        sudo systemctl start gj-mugshots.service
        sleep 2
        sudo systemctl status gj-mugshots.service --no-pager
        ;;
    stop)
        echo "🛑 Stopping GJ Mugshots website..."
        sudo systemctl stop gj-mugshots.service
        echo "✅ Website stopped"
        ;;
    restart)
        echo "🔄 Restarting GJ Mugshots website..."
        sudo systemctl restart gj-mugshots.service
        sleep 2
        sudo systemctl status gj-mugshots.service --no-pager
        ;;
    status)
        echo "📊 GJ Mugshots Website Status:"
        sudo systemctl status gj-mugshots.service --no-pager
        echo ""
        echo "🌐 Testing connectivity..."
        if curl -s -I http://192.168.1.178:6023 > /dev/null; then
            echo "✅ Website is accessible at http://192.168.1.178:6023"
        else
            echo "❌ Website is not accessible"
        fi
        if curl -s -I http://192.168.1.178:3001/api/arrestees > /dev/null; then
            echo "✅ API is accessible at http://192.168.1.178:3001"
        else
            echo "❌ API is not accessible"
        fi
        ;;
    logs)
        echo "📝 Showing recent logs (last 50 lines):"
        sudo journalctl -u gj-mugshots.service --no-pager -n 50
        ;;
    enable)
        echo "🔧 Enabling auto-start on boot..."
        sudo systemctl enable gj-mugshots.service
        echo "✅ Website will now start automatically on boot"
        ;;
    disable)
        echo "🔧 Disabling auto-start on boot..."
        sudo systemctl disable gj-mugshots.service
        echo "✅ Website will no longer start automatically on boot"
        ;;
    *)
        echo "GJ Mugshots Website Management"
        echo "=============================="
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|enable|disable}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the website service"
        echo "  stop     - Stop the website service"
        echo "  restart  - Restart the website service"
        echo "  status   - Show service status and test connectivity"
        echo "  logs     - Show recent service logs"
        echo "  enable   - Enable auto-start on boot"
        echo "  disable  - Disable auto-start on boot"
        echo ""
        echo "🌐 Website URLs:"
        echo "  - Local: http://localhost:6023"
        echo "  - Network: http://192.168.1.178:6023"
        echo "  - API: http://192.168.1.178:3001/api/arrestees"
        ;;
esac
