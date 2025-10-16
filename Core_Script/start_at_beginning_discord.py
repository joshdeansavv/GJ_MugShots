#!/usr/bin/env python3
"""
Discord Start From Beginning Script
Sends ALL bookings from the database to Discord (ignores sent records file)
This is a standalone script that can be run independently
"""

import os
import requests
import pymysql
import json
import time
from datetime import datetime
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

# Discord webhook configuration
WEBHOOK = "https://discordapp.com/api/webhooks/1415105095678431332/3XxP-Uef3mcLOPzFUr27tlKZNtUiVefK1UAYWJgjzMXbgg30WgkU9IzQJXldAUQhjDEd"

# Discord rate limits: 30 messages per minute, 50 requests per second
MESSAGES_PER_MINUTE = 30
REQUESTS_PER_SECOND = 50
MIN_DELAY_BETWEEN_MESSAGES = 2  # 2 seconds between messages for production
MIN_DELAY_BETWEEN_REQUESTS = 1 / REQUESTS_PER_SECOND   # 0.02 seconds

# File to track what has been sent to Discord
SENT_RECORDS_FILE = "discord_sent_records.txt"

last_message_time = 0
last_request_time = 0
GREY = 0x1f1f1f

def rate_limit():
    """Ensure we don't exceed Discord's rate limits"""
    global last_message_time, last_request_time
    current_time = time.time()
    
    # Check message rate limit (30 per minute)
    time_since_last_message = current_time - last_message_time
    if time_since_last_message < MIN_DELAY_BETWEEN_MESSAGES:
        sleep_time = MIN_DELAY_BETWEEN_MESSAGES - time_since_last_message
        print(f"Rate limiting: sleeping {sleep_time:.1f}s")
        time.sleep(sleep_time)
    
    # Check request rate limit (50 per second)
    time_since_last_request = current_time - last_request_time
    if time_since_last_request < MIN_DELAY_BETWEEN_REQUESTS:
        sleep_time = MIN_DELAY_BETWEEN_REQUESTS - time_since_last_request
        time.sleep(sleep_time)
    
    last_message_time = time.time()
    last_request_time = time.time()

def load_sent_records():
    """Load the list of record IDs that have already been sent to Discord"""
    sent_records = set()
    if os.path.exists(SENT_RECORDS_FILE):
        try:
            with open(SENT_RECORDS_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and line.isdigit():
                        sent_records.add(int(line))
        except Exception as e:
            print(f"Error loading sent records: {e}")
    return sent_records

def save_sent_record(record_id):
    """Add a record ID to the list of sent records"""
    try:
        with open(SENT_RECORDS_FILE, 'a') as f:
            f.write(f"{record_id}\n")
    except Exception as e:
        print(f"Error saving sent record: {e}")

def get_all_records():
    """Get ALL records from the database (ignores sent records file)"""
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4'
        )
        cursor = conn.cursor()
        
        # Get ALL records from the database, ordered chronologically
        cursor.execute('''
            SELECT id, raw_name, first_name, middle_name, last_name, 
                   booking_date, booking_time, date_of_birth, gender, 
                   arrestor, charges, source_pdf, image_path
            FROM bookings 
            ORDER BY booking_date ASC, booking_time ASC
        ''')
        
        all_records = cursor.fetchall()
        print(f"Found {len(all_records)} total records in database")
        
        conn.close()
        
        return all_records
        
    except Exception as e:
        print(f"Error getting all records: {e}")
        return []

def post_embed(record, image_bytes):
    """Send embed message to Discord webhook"""
    # Apply rate limiting before making the request
    rate_limit()
    
    (id, raw_name, first_name, middle_name, last_name, booking_date, booking_time, 
     dob, gender, arrestor, charges, source_pdf, image_path) = record
    
    # Parse raw_name which is in "LAST, FIRST MIDDLE" format
    # Convert to "FIRST MIDDLE LAST" format
    if raw_name and ',' in raw_name:
        # Split on comma: "MORRISON, JENNIFER ANN" -> ["MORRISON", "JENNIFER ANN"]
        parts = raw_name.split(',', 1)
        if len(parts) == 2:
            last_name_part = parts[0].strip()
            first_middle_part = parts[1].strip()
            # Split first_middle_part: "JENNIFER ANN" -> ["JENNIFER", "ANN"]
            first_middle_parts = first_middle_part.split()
            if len(first_middle_parts) >= 1:
                first_name_part = first_middle_parts[0]
                middle_name_parts = first_middle_parts[1:] if len(first_middle_parts) > 1 else []
                # Combine as "FIRST MIDDLE LAST"
                name_parts = [first_name_part] + middle_name_parts + [last_name_part]
                full_name = " ".join(name_parts).strip().upper()
            else:
                full_name = raw_name.upper()
        else:
            full_name = raw_name.upper()
    else:
        # Fallback to raw_name if no comma found
        full_name = raw_name.upper() if raw_name else "UNKNOWN"
    
    # Format booking datetime
    booking_str = ""
    if booking_date and booking_time:
        # Handle both time and timedelta objects
        if hasattr(booking_time, 'strftime'):
            # Format as "05/31/2025 at 4:10:00 PM"
            time_str = booking_time.strftime('%I:%M:%S %p').lstrip('0').replace(' 0', ' ')
            booking_str = f"{booking_date.strftime('%m/%d/%Y')} at {time_str}"
        else:
            # Convert timedelta to time string
            total_seconds = int(booking_time.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            
            # Format with AM/PM
            if hours == 0:
                time_str = f"12:{minutes:02d}:{seconds:02d} AM"
            elif hours < 12:
                time_str = f"{hours}:{minutes:02d}:{seconds:02d} AM"
            elif hours == 12:
                time_str = f"12:{minutes:02d}:{seconds:02d} PM"
            else:
                time_str = f"{hours-12}:{minutes:02d}:{seconds:02d} PM"
            
            booking_str = f"{booking_date.strftime('%m/%d/%Y')} at {time_str}"
    elif booking_date:
        booking_str = booking_date.strftime('%m/%d/%Y')
    
    # Format DOB and calculate age
    dob_str = dob if dob else "N/A"
    age_str = "N/A"
    if dob and dob != "N/A":
        try:
            from datetime import datetime
            dob_date = datetime.strptime(dob, '%m/%d/%Y')
            today = datetime.now()
            age = today.year - dob_date.year - ((today.month, today.day) < (dob_date.month, dob_date.day))
            age_str = f"{age} years old"
        except:
            age_str = "N/A"
    
    # Format gender
    gender_str = gender.upper() if gender else "N/A"
    
    # Format arrestor
    arrestor_str = arrestor if arrestor else "N/A"
    
    # Format charges in bullet point format
    charges_str = "No charges listed"
    if charges and charges != "No charges listed":
        # Split charges by semicolon and format as bullet points
        charge_list = [charge.strip() for charge in charges.split(';') if charge.strip()]
        if charge_list:
            charges_str = "\n".join([f"• {charge}" for charge in charge_list])
            # Truncate if too long
            if len(charges_str) > 1000:
                charges_str = charges_str[:997] + "..."
    
    # Create description with clean formatting
    desc = f"\n\n**Booked On**\n{booking_str}\n\n**DOB**\n{dob_str}\n\n**Age**\n{age_str}\n\n**Gender**\n{gender_str}\n\n**Arresting Officer**\n{arrestor_str}\n\n**Charges**\n{charges_str}"
    
    # Create embed with large image below description
    embed = {"title": full_name, "description": desc, "color": GREY}
    if image_bytes and image_bytes is not None:
        embed["image"] = {"url": "attachment://mug.png"}
    
    # Send as silent (no notification) for individual mugshot cards
    payload = {"embeds": [embed], "flags": 2}  # flags: 2 = SUPPRESS_NOTIFICATIONS (silent but shows embed)
    data = {"payload_json": json.dumps(payload)}
    files = {}
    if image_bytes and image_bytes is not None:
        files["file"] = ("mug.png", image_bytes, "image/png")
    
    try:
        r = requests.post(WEBHOOK, data=data, files=files or None, timeout=30)
        status_code = getattr(r, "status_code", None)
        print("POST", full_name, status_code)
        
        # Discord returns 204 for successful webhook posts
        success = status_code in [200, 204]
        if not success:
            print(f"  Response: {r.text}")
        return success
    except Exception as e:
        print("POST ERROR", full_name, e)
        return False

def get_image_bytes(image_path):
    """Get image bytes from file path"""
    if image_path and os.path.exists(image_path):
        try:
            with open(image_path, 'rb') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading image {image_path}: {e}")
            return None
    return None

def send_daily_completion_notification(count, date_str):
    """Send a daily completion notification embed (not silent)"""
    rate_limit()
    
    # Convert date string from YYYY-MM-DD to MM/DD/YYYY format
    try:
        from datetime import datetime
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        formatted_date = date_obj.strftime('%m/%d/%Y')
    except:
        formatted_date = date_str
    
    # Create embed with the exact format requested
    embed = {
        "title": f"Bookings for {formatted_date} processed.",
        "color": 0x1f1f1f
    }
    
    payload = {"embeds": [embed]}
    data = {"payload_json": json.dumps(payload)}
    
    try:
        r = requests.post(WEBHOOK, data=data, timeout=30)
        status_code = getattr(r, "status_code", None)
        print(f"DAILY NOTIFICATION: Bookings for {formatted_date} processed. - Status: {status_code}")
        return status_code in [200, 204]
    except Exception as e:
        print(f"DAILY NOTIFICATION ERROR: {e}")
        return False

def main():
    """Send ALL records to Discord from the beginning"""
    print("=== GJ MugShots Discord - START FROM BEGINNING ===")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("⚠️  WARNING: This will send ALL records in the database!")
    
    # Get ALL records from the database
    all_records = get_all_records()
    
    if not all_records:
        print("No records found in database!")
        return
    
    print(f"Starting to send {len(all_records)} TOTAL records...")
    print("Order: Oldest bookings first")
    print("=" * 60)
    
    # Group records by date
    from collections import defaultdict
    records_by_date = defaultdict(list)
    
    for record in all_records:
        booking_date = record[5]  # booking_date is at index 5
        if booking_date:
            date_str = booking_date.strftime('%Y-%m-%d')
            records_by_date[date_str].append(record)
    
    # Sort dates chronologically
    sorted_dates = sorted(records_by_date.keys())
    
    total_successful_sends = 0
    total_failed_sends = 0
    
    # Process each date group
    for date_str in sorted_dates:
        date_records = records_by_date[date_str]
        print(f"\n--- Processing {len(date_records)} records for {date_str} ---")
        
        successful_sends = 0
        failed_sends = 0
        
        # Send all records for this date
        for i, record in enumerate(date_records, 1):
            record_id = record[0]
            print(f"\nProcessing record {i}/{len(date_records)}: {record[1]}")  # raw_name
            
            image_path = record[12]  # image_path
            image_bytes = get_image_bytes(image_path)
            
            success = post_embed(record, image_bytes)
            if success:
                successful_sends += 1
                total_successful_sends += 1
                # Mark this record as sent
                save_sent_record(record_id)
                print(f"✅ Sent record {i}")
            else:
                failed_sends += 1
                total_failed_sends += 1
                print(f"❌ Failed to send record {i}")
        
        # Send daily completion notification immediately after this date's records
        if successful_sends > 0:
            notification_sent = send_daily_completion_notification(successful_sends, date_str)
            if notification_sent:
                print(f"📢 Daily completion notification sent for {date_str}!")
            else:
                print(f"❌ Failed to send daily completion notification for {date_str}")
        else:
            print(f"📭 No successful sends for {date_str}, skipping notification")
    
    print(f"\n=== Complete ===")
    print(f"Total records: {len(all_records)}")
    print(f"Successfully sent: {total_successful_sends}")
    print(f"Failed: {total_failed_sends}")
    print(f"Success rate: {total_successful_sends/len(all_records)*100:.1f}%")
    
    if total_successful_sends > 0:
        print(f"\n✅ {total_successful_sends} bookings sent to Discord!")
    else:
        print(f"\n📭 No bookings to send.")

if __name__ == "__main__":
    main()
