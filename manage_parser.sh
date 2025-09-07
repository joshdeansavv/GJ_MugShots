#!/bin/bash

# GJ MugShots Parser Management Script
# This script provides easy control over the automated data parser

SERVICE_NAME="gjmugshots-parser"
TIMER_NAME="gjmugshots-parser.timer"
LOG_DIR="/var/log/gjmugshots"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Function to show help
show_help() {
    echo "GJ MugShots Parser Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start       Start the automated parser timer"
    echo "  stop        Stop the automated parser timer"
    echo "  restart     Restart the automated parser timer"
    echo "  status      Show status of parser service and timer"
    echo "  run         Run the parser once manually"
    echo "  dbstatus    Show database and system status"
    echo "  logs        Show recent parser logs"
    echo "  next        Show when the parser will run next"
    echo "  schedule    Show the current schedule"
    echo "  enable      Enable the parser to start on boot"
    echo "  disable     Disable the parser from starting on boot"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start     # Start automated parsing"
    echo "  $0 run       # Run parser once now"
    echo "  $0 logs      # View recent logs"
    echo "  $0 status    # Check current status"
}

# Function to check if running as root for certain operations
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This operation requires sudo privileges"
        exit 1
    fi
}

# Function to start the timer
start_parser() {
    check_root
    print_header "Starting GJ MugShots Parser"
    sudo systemctl start "$TIMER_NAME"
    if [ $? -eq 0 ]; then
        print_status "Parser timer started successfully"
    else
        print_error "Failed to start parser timer"
        exit 1
    fi
}

# Function to stop the timer
stop_parser() {
    check_root
    print_header "Stopping GJ MugShots Parser"
    sudo systemctl stop "$TIMER_NAME"
    if [ $? -eq 0 ]; then
        print_status "Parser timer stopped successfully"
    else
        print_error "Failed to stop parser timer"
        exit 1
    fi
}

# Function to restart the timer
restart_parser() {
    check_root
    print_header "Restarting GJ MugShots Parser"
    sudo systemctl restart "$TIMER_NAME"
    if [ $? -eq 0 ]; then
        print_status "Parser timer restarted successfully"
    else
        print_error "Failed to restart parser timer"
        exit 1
    fi
}

# Function to show status
show_status() {
    print_header "GJ MugShots Parser Status"
    echo ""
    echo "Timer Status:"
    sudo systemctl status "$TIMER_NAME" --no-pager -l
    echo ""
    echo "Service Status:"
    sudo systemctl status "$SERVICE_NAME" --no-pager -l
    echo ""
    echo "Recent Logs:"
    if [ -f "$LOG_DIR/parse.log" ]; then
        tail -10 "$LOG_DIR/parse.log"
    else
        print_warning "No log file found at $LOG_DIR/parse.log"
    fi
}

# Function to run parser once
run_parser() {
    print_header "Running GJ MugShots Parser Once"
    
    # Run the consolidated script directly
    cd /home/joshua/GJ_MugShots
    if python3 gjmugshots.py run; then
        print_status "Parser executed successfully"
    else
        print_error "Parser execution failed"
        exit 1
    fi
}

# Function to show logs
show_logs() {
    print_header "GJ MugShots Parser Logs"
    echo ""
    if [ -f "$LOG_DIR/parse.log" ]; then
        echo "=== Parse Log ==="
        tail -50 "$LOG_DIR/parse.log"
        echo ""
    fi
    
    if [ -f "$LOG_DIR/parse_error.log" ]; then
        echo "=== Error Log ==="
        tail -20 "$LOG_DIR/parse_error.log"
        echo ""
    fi
    
    echo "=== System Journal ==="
    sudo journalctl -u "$SERVICE_NAME" --no-pager -n 30
}

# Function to show next run time
show_next() {
    print_header "Next Parser Run"
    sudo systemctl list-timers "$TIMER_NAME" --no-pager
}

# Function to show schedule
show_schedule() {
    print_header "Parser Schedule"
    echo "The parser is configured to run:"
    echo "  • 10:05 AM daily (5 minutes after new PDFs are generated at 10:00 AM)"
    echo ""
    echo "With randomized delay of up to 2 minutes to avoid system load spikes"
    echo ""
    show_next
}

# Function to show database status
show_dbstatus() {
    print_header "Database and System Status"
    cd /home/joshua/GJ_MugShots
    python3 gjmugshots.py status
}

# Function to enable parser
enable_parser() {
    check_root
    print_header "Enabling GJ MugShots Parser"
    sudo systemctl enable "$TIMER_NAME"
    if [ $? -eq 0 ]; then
        print_status "Parser enabled to start on boot"
    else
        print_error "Failed to enable parser"
        exit 1
    fi
}

# Function to disable parser
disable_parser() {
    check_root
    print_header "Disabling GJ MugShots Parser"
    sudo systemctl disable "$TIMER_NAME"
    if [ $? -eq 0 ]; then
        print_status "Parser disabled from starting on boot"
    else
        print_error "Failed to disable parser"
        exit 1
    fi
}

# Main script logic
case "${1:-help}" in
    start)
        start_parser
        ;;
    stop)
        stop_parser
        ;;
    restart)
        restart_parser
        ;;
    status)
        show_status
        ;;
    run)
        run_parser
        ;;
    dbstatus)
        show_dbstatus
        ;;
    logs)
        show_logs
        ;;
    next)
        show_next
        ;;
    schedule)
        show_schedule
        ;;
    enable)
        enable_parser
        ;;
    disable)
        disable_parser
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
