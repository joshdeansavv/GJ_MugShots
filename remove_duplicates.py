#!/usr/bin/env python3
"""
Remove Duplicate Records from GJ MugShots Database
Finds and removes exact duplicates while preserving separate arrest records
"""

import pymysql
from datetime import datetime

# Database configuration - Import from config.py for security
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

def find_duplicates():
    """Find exact duplicate records"""
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
        
        print("🔍 Searching for duplicate records...")
        
        # Find duplicates based on all key fields
        query = """
        SELECT 
            raw_name, booking_date, booking_time, date_of_birth, gender, 
            arrestor, charges, source_pdf, COUNT(*) as count
        FROM jail_records 
        GROUP BY 
            raw_name, booking_date, booking_time, date_of_birth, gender, 
            arrestor, charges, source_pdf
        HAVING count > 1
        ORDER BY count DESC
        """
        
        cursor.execute(query)
        duplicates = cursor.fetchall()
        
        if not duplicates:
            print("✅ No exact duplicates found!")
            return []
        
        print(f"📊 Found {len(duplicates)} sets of duplicate records:")
        
        duplicate_ids = []
        for dup in duplicates:
            raw_name, booking_date, booking_time, date_of_birth, gender, arrestor, charges, source_pdf, count = dup
            print(f"\n👤 {raw_name} - {booking_date} {booking_time} ({count} duplicates)")
            print(f"   DOB: {date_of_birth}, Gender: {gender}")
            print(f"   Arrestor: {arrestor}")
            print(f"   Charges: {charges[:100]}...")
            print(f"   Source: {source_pdf}")
            
            # Get all IDs for this duplicate set
            id_query = """
            SELECT id, created_at, image_path 
            FROM jail_records 
            WHERE raw_name = %s AND booking_date = %s AND booking_time = %s 
            AND date_of_birth = %s AND gender = %s AND arrestor = %s 
            AND charges = %s AND source_pdf = %s
            ORDER BY created_at ASC, id ASC
            """
            
            cursor.execute(id_query, (raw_name, booking_date, booking_time, date_of_birth, gender, arrestor, charges, source_pdf))
            records = cursor.fetchall()
            
            # Keep the first record (oldest), mark others for deletion
            if len(records) > 1:
                print(f"   📋 Records found: {len(records)}")
                for i, (record_id, created_at, image_path) in enumerate(records):
                    status = "KEEP" if i == 0 else "DELETE"
                    print(f"      ID {record_id}: {created_at} - {status}")
                    if i > 0:  # Mark for deletion (skip first one)
                        duplicate_ids.append(record_id)
        
        conn.close()
        return duplicate_ids
        
    except Exception as e:
        print(f"❌ Error finding duplicates: {e}")
        return []

def remove_duplicates(duplicate_ids):
    """Remove duplicate records by ID"""
    if not duplicate_ids:
        print("✅ No duplicates to remove!")
        return
    
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
        
        print(f"\n🗑️  Removing {len(duplicate_ids)} duplicate records...")
        
        # Get details of records to be deleted
        placeholders = ','.join(['%s'] * len(duplicate_ids))
        query = f"SELECT id, raw_name, booking_date, booking_time, image_path FROM jail_records WHERE id IN ({placeholders})"
        cursor.execute(query, duplicate_ids)
        records_to_delete = cursor.fetchall()
        
        print("📋 Records to be deleted:")
        for record_id, raw_name, booking_date, booking_time, image_path in records_to_delete:
            print(f"   ID {record_id}: {raw_name} - {booking_date} {booking_time}")
            if image_path:
                print(f"      Image: {image_path}")
        
        # Confirm deletion
        response = input(f"\n⚠️  Are you sure you want to delete {len(duplicate_ids)} duplicate records? (yes/no): ")
        if response.lower() != 'yes':
            print("❌ Deletion cancelled.")
            return
        
        # Delete the duplicate records
        delete_query = f"DELETE FROM jail_records WHERE id IN ({placeholders})"
        cursor.execute(delete_query, duplicate_ids)
        deleted_count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        print(f"✅ Successfully deleted {deleted_count} duplicate records!")
        
        # Clean up orphaned image files
        print("\n🧹 Cleaning up orphaned image files...")
        cleanup_orphaned_images(records_to_delete)
        
    except Exception as e:
        print(f"❌ Error removing duplicates: {e}")

def cleanup_orphaned_images(deleted_records):
    """Clean up image files for deleted records"""
    import os
    
    orphaned_count = 0
    for record_id, raw_name, booking_date, booking_time, image_path in deleted_records:
        if image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
                print(f"   🗑️  Removed: {image_path}")
                orphaned_count += 1
            except Exception as e:
                print(f"   ⚠️  Could not remove {image_path}: {e}")
    
    if orphaned_count > 0:
        print(f"✅ Cleaned up {orphaned_count} orphaned image files")
    else:
        print("✅ No orphaned image files to clean up")

def show_statistics():
    """Show database statistics before and after"""
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
        
        cursor.execute("SELECT COUNT(*) FROM jail_records")
        total_records = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM jail_records WHERE image_path IS NOT NULL AND image_path != ''")
        records_with_images = cursor.fetchone()[0]
        
        conn.close()
        
        print(f"\n📊 Database Statistics:")
        print(f"   Total Records: {total_records:,}")
        print(f"   Records with Images: {records_with_images:,}")
        print(f"   Image Coverage: {(records_with_images/total_records*100):.1f}%")
        
    except Exception as e:
        print(f"❌ Error getting statistics: {e}")

def main():
    """Main function"""
    print("=" * 60)
    print("GJ MUGSHOTS DUPLICATE REMOVAL TOOL")
    print("=" * 60)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Show initial statistics
    print("📊 Initial Database Statistics:")
    show_statistics()
    
    # Find duplicates
    duplicate_ids = find_duplicates()
    
    if duplicate_ids:
        # Remove duplicates
        remove_duplicates(duplicate_ids)
        
        # Show final statistics
        print("\n📊 Final Database Statistics:")
        show_statistics()
    else:
        print("\n🎉 Database is clean - no duplicates found!")

if __name__ == "__main__":
    main()
