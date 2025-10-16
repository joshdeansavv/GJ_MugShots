#!/usr/bin/env python3
"""
Safe duplicate removal script for GJ MugShots database
Removes true duplicates (same person, same date, same time, same PDF) 
while preserving legitimate different bookings of the same person
"""

import pymysql
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
from datetime import datetime

def remove_duplicates():
    """Remove true duplicates while preserving different bookings"""
    conn = None
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4',
            autocommit=False
        )
        cursor = conn.cursor()
        
        print("=== GJ MugShots Duplicate Removal ===")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # First, let's see what we're working with
        cursor.execute("SELECT COUNT(*) FROM bookings")
        total_before = cursor.fetchone()[0]
        print(f"Total records before cleanup: {total_before}")
        
        # Find duplicates (same person, same date, same time, same PDF)
        cursor.execute("""
            SELECT raw_name, booking_date, booking_time, source_pdf, COUNT(*) as duplicate_count
            FROM bookings 
            GROUP BY raw_name, booking_date, booking_time, source_pdf 
            HAVING COUNT(*) > 1
            ORDER BY duplicate_count DESC
        """)
        
        duplicates = cursor.fetchall()
        print(f"Found {len(duplicates)} sets of duplicates")
        
        if not duplicates:
            print("No duplicates found!")
            return
        
        # Show what we're about to remove
        print("\nDuplicate sets to be cleaned:")
        for dup in duplicates:
            name, date, time, pdf, count = dup
            print(f"  {name} - {date} {time} - {pdf} ({count} copies)")
        
        total_duplicates_to_remove = sum(count - 1 for _, _, _, _, count in duplicates)
        print(f"\nTotal duplicate records to remove: {total_duplicates_to_remove}")
        
        # Confirm before proceeding
        response = input("\nProceed with duplicate removal? (yes/no): ").lower().strip()
        if response != 'yes':
            print("Duplicate removal cancelled.")
            return
        
        # Remove duplicates, keeping the record with the lowest ID (first inserted)
        removed_count = 0
        
        for name, date, time, pdf, count in duplicates:
            # Get all duplicate records for this person/date/time/pdf combination
            cursor.execute("""
                SELECT id FROM bookings 
                WHERE raw_name = %s AND booking_date = %s AND booking_time = %s AND source_pdf = %s
                ORDER BY id ASC
            """, (name, date, time, pdf))
            
            duplicate_ids = [row[0] for row in cursor.fetchall()]
            
            # Keep the first record (lowest ID), remove the rest
            ids_to_remove = duplicate_ids[1:]  # Skip the first one
            
            if ids_to_remove:
                # Remove the duplicate records
                placeholders = ','.join(['%s'] * len(ids_to_remove))
                cursor.execute(f"DELETE FROM bookings WHERE id IN ({placeholders})", ids_to_remove)
                removed_count += len(ids_to_remove)
                print(f"  Removed {len(ids_to_remove)} duplicates for {name} ({date} {time})")
        
        # Commit the changes
        conn.commit()
        
        # Verify the results
        cursor.execute("SELECT COUNT(*) FROM bookings")
        total_after = cursor.fetchone()[0]
        
        print(f"\n=== Cleanup Complete ===")
        print(f"Records before: {total_before}")
        print(f"Records after: {total_after}")
        print(f"Duplicates removed: {removed_count}")
        print(f"Records preserved: {total_after}")
        
        # Verify no duplicates remain
        cursor.execute("""
            SELECT COUNT(*) FROM (
                SELECT raw_name, booking_date, booking_time, source_pdf, COUNT(*) as duplicate_count
                FROM bookings 
                GROUP BY raw_name, booking_date, booking_time, source_pdf 
                HAVING COUNT(*) > 1
            ) as remaining_duplicates
        """)
        remaining_duplicates = cursor.fetchone()[0]
        
        if remaining_duplicates == 0:
            print("✓ No duplicates remain - cleanup successful!")
        else:
            print(f"⚠ Warning: {remaining_duplicates} duplicate sets still remain")
        
    except Exception as e:
        print(f"Error during duplicate removal: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    remove_duplicates()
