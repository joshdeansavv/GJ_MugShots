#!/usr/bin/env python3
"""
Internet Outage Recovery Script for GJ MugShots
Checks internet connectivity and triggers parser if missed during outage
"""

import subprocess
import time
import requests
from datetime import datetime, timedelta
import os

def check_internet_connectivity():
    """Check if internet connection is available"""
    try:
        # Try to reach a reliable external service
        response = requests.get('https://www.google.com', timeout=10)
        return response.status_code == 200
    except:
        try:
            # Fallback to DNS check
            result = subprocess.run(['nslookup', 'google.com'], 
                                  capture_output=True, timeout=5)
            return result.returncode == 0
        except:
            return False

def check_if_parser_ran_today():
    """Check if the parser has already run today"""
    try:
        # Check systemd journal for today's runs
        today = datetime.now().strftime('%Y-%m-%d')
        result = subprocess.run([
            'journalctl', '-u', 'gjmugshots-parser.service', 
            '--since', f'{today} 00:00:00',
            '--no-pager'
        ], capture_output=True, text=True)
        
        # Look for successful completion
        return 'Parse completed successfully' in result.stdout
    except:
        return False

def trigger_parser():
    """Trigger the parser to run"""
    try:
        print(f"🔄 [{datetime.now().strftime('%H:%M:%S')}] Triggering parser due to internet recovery...")
        result = subprocess.run([
            'sudo', 'systemctl', 'start', 'gjmugshots-parser.service'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Parser triggered successfully")
            return True
        else:
            print(f"❌ Failed to trigger parser: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ Error triggering parser: {e}")
        return False

def main():
    """Main recovery function"""
    print("=" * 60)
    print("GJ MUGSHOTS INTERNET RECOVERY MONITOR")
    print("=" * 60)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check internet connectivity
    if not check_internet_connectivity():
        print("❌ No internet connection available")
        return
    
    print("✅ Internet connection restored")
    
    # Check if parser already ran today
    if check_if_parser_ran_today():
        print("✅ Parser already ran today - no action needed")
        return
    
    print("⚠️  Parser has not run today - checking if we should trigger it...")
    
    # Check if it's within reasonable time window (8 AM - 6 PM)
    current_hour = datetime.now().hour
    if 8 <= current_hour <= 18:
        print(f"🕐 Current time ({current_hour}:00) is within processing window")
        trigger_parser()
    else:
        print(f"🕐 Current time ({current_hour}:00) is outside processing window (8 AM - 6 PM)")

if __name__ == "__main__":
    main()
