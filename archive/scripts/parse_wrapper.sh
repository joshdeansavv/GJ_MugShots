#!/bin/bash

# GJ MugShots Data Parser Wrapper Script
# This script wraps the parse.py script with proper logging and error handling

# Load environment variables
if [ -f "../../.env" ]; then
    export $(cat ../../.env | grep -v '^#' | xargs)
fi

# Configuration
SCRIPT_DIR="/home/joshua/GJ_MugShots"
LOG_DIR="/var/log/gjmugshots"
LOG_FILE="$LOG_DIR/parse.log"
ERROR_LOG="$LOG_DIR/parse_error.log"
PYTHON_PATH="/usr/bin/python3"

# Create log directory if it doesn't exist
sudo mkdir -p "$LOG_DIR"
sudo chown joshua:joshua "$LOG_DIR"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to log errors
log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$ERROR_LOG"
}

# Function to check if script is already running
check_running() {
    if pgrep -f "parse.py" > /dev/null; then
        log_message "Parse script is already running, skipping this execution"
        exit 0
    fi
}

# Function to check system resources
check_resources() {
    # Check available disk space (require at least 1GB free)
    AVAILABLE_SPACE=$(df /home | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 1048576 ]; then  # 1GB in KB
        log_error "Insufficient disk space. Available: ${AVAILABLE_SPACE}KB"
        exit 1
    fi
    
    # Check memory usage (require at least 500MB free)
    FREE_MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [ "$FREE_MEMORY" -lt 500 ]; then
        log_error "Insufficient memory. Available: ${FREE_MEMORY}MB"
        exit 1
    fi
}

# Function to backup database before parsing
backup_database() {
    log_message "Creating database backup before parsing..."
    BACKUP_FILE="$LOG_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    if mysqldump -h localhost -u root -p"$DB_PASSWORD" jail_records > "$BACKUP_FILE" 2>/dev/null; then
        log_message "Database backup created: $BACKUP_FILE"
        # Keep only last 7 days of backups
        find "$LOG_DIR" -name "backup_*.sql" -mtime +7 -delete 2>/dev/null
    else
        log_error "Failed to create database backup"
        # Don't exit, continue with parsing
    fi
}

# Function to send notification (optional - can be configured for email, slack, etc.)
send_notification() {
    local message="$1"
    local status="$2"
    
    # Log the notification
    log_message "NOTIFICATION [$status]: $message"
    
    # You can add email, Slack, or other notification methods here
    # Example for email (requires mailutils):
    # echo "$message" | mail -s "GJ MugShots Parser [$status]" admin@example.com
}

# Main execution function
main() {
    log_message "Starting GJ MugShots data parser..."
    
    # Check if already running
    check_running
    
    # Check system resources
    check_resources
    
    # Change to script directory
    cd "$SCRIPT_DIR" || {
        log_error "Failed to change to script directory: $SCRIPT_DIR"
        exit 1
    }
    
    # Create database backup
    backup_database
    
    # Check if parse.py exists and is executable
    if [ ! -f "parse.py" ]; then
        log_error "parse.py not found in $SCRIPT_DIR"
        exit 1
    fi
    
    # Make sure parse.py is executable
    chmod +x parse.py
    
    # Run the parser
    log_message "Executing parse.py..."
    START_TIME=$(date +%s)
    
    if $PYTHON_PATH parse.py 2>&1 | tee -a "$LOG_FILE"; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        log_message "Parse completed successfully in ${DURATION} seconds"
        send_notification "Data parsing completed successfully in ${DURATION} seconds" "SUCCESS"
    else
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        log_error "Parse failed after ${DURATION} seconds"
        send_notification "Data parsing failed after ${DURATION} seconds" "ERROR"
        exit 1
    fi
    
    # Clean up old logs (keep last 30 days)
    find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null
    
    log_message "GJ MugShots data parser finished"
}

# Handle signals gracefully
trap 'log_message "Parser interrupted by signal"; exit 130' INT TERM

# Run main function
main "$@"
