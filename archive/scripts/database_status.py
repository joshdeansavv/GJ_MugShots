#!/usr/bin/env python3
"""
GJ MugShots Database Status Report
Shows current database statistics and health
"""

import pymysql
import os
from datetime import datetime

# Database configuration - Import from config.py for security
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

def get_database_stats():
    """Get comprehensive database statistics"""
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
        
        stats = {}
        
        # Total records
        cursor.execute("SELECT COUNT(*) FROM jail_records")
        stats['total_records'] = cursor.fetchone()[0]
        
        # Records with images
        cursor.execute("SELECT COUNT(*) FROM jail_records WHERE image_path IS NOT NULL AND image_path != ''")
        stats['records_with_images'] = cursor.fetchone()[0]
        
        # Records without images
        stats['records_without_images'] = stats['total_records'] - stats['records_with_images']
        
        # Unique PDFs processed
        cursor.execute("SELECT COUNT(DISTINCT source_pdf) FROM jail_records")
        stats['unique_pdfs'] = cursor.fetchone()[0]
        
        # Date range
        cursor.execute("SELECT MIN(booking_date), MAX(booking_date) FROM jail_records")
        date_range = cursor.fetchone()
        stats['date_range'] = f"{date_range[0]} to {date_range[1]}" if date_range[0] else "No dates"
        
        # Recent records (last 7 days)
        cursor.execute("SELECT COUNT(*) FROM jail_records WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
        stats['recent_records'] = cursor.fetchone()[0]
        
        # Most common charges
        cursor.execute("""
            SELECT charges, COUNT(*) as count 
            FROM jail_records 
            WHERE charges IS NOT NULL AND charges != '' AND charges != 'No charges listed'
            GROUP BY charges 
            ORDER BY count DESC 
            LIMIT 5
        """)
        stats['top_charges'] = cursor.fetchall()
        
        # Gender distribution
        cursor.execute("SELECT gender, COUNT(*) FROM jail_records GROUP BY gender")
        stats['gender_distribution'] = cursor.fetchall()
        
        conn.close()
        return stats
        
    except Exception as e:
        print(f"Error getting database stats: {e}")
        return None

def get_file_stats():
    """Get file system statistics"""
    stats = {}
    
    # Image files
    images_dir = "images"
    if os.path.exists(images_dir):
        image_files = [f for f in os.listdir(images_dir) if f.endswith('.png')]
        stats['image_files'] = len(image_files)
        
        # Calculate total size
        total_size = 0
        for filename in image_files:
            filepath = os.path.join(images_dir, filename)
            total_size += os.path.getsize(filepath)
        stats['images_size_mb'] = round(total_size / (1024 * 1024), 2)
    else:
        stats['image_files'] = 0
        stats['images_size_mb'] = 0
    
    # PDF files in new directory
    new_dir = "new"
    if os.path.exists(new_dir):
        pdf_files = [f for f in os.listdir(new_dir) if f.endswith('.pdf')]
        stats['new_pdfs'] = len(pdf_files)
    else:
        stats['new_pdfs'] = 0
    
    # PDF files in archive directory
    archive_dir = "archive"
    if os.path.exists(archive_dir):
        pdf_files = [f for f in os.listdir(archive_dir) if f.endswith('.pdf')]
        stats['archived_pdfs'] = len(pdf_files)
    else:
        stats['archived_pdfs'] = 0
    
    return stats

def main():
    """Generate and display database status report"""
    print("=" * 60)
    print("GJ MUGSHOTS DATABASE STATUS REPORT")
    print("=" * 60)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Database statistics
    db_stats = get_database_stats()
    if db_stats:
        print("📊 DATABASE STATISTICS")
        print("-" * 30)
        print(f"Total Records: {db_stats['total_records']:,}")
        print(f"Records with Images: {db_stats['records_with_images']:,}")
        print(f"Records without Images: {db_stats['records_without_images']:,}")
        print(f"Image Coverage: {(db_stats['records_with_images']/db_stats['total_records']*100):.1f}%")
        print(f"Unique PDFs Processed: {db_stats['unique_pdfs']}")
        print(f"Date Range: {db_stats['date_range']}")
        print(f"Recent Records (7 days): {db_stats['recent_records']}")
        print()
        
        # Gender distribution
        print("👥 GENDER DISTRIBUTION")
        print("-" * 30)
        for gender, count in db_stats['gender_distribution']:
            if gender:
                print(f"{gender}: {count:,}")
        print()
        
        # Top charges
        if db_stats['top_charges']:
            print("⚖️  TOP CHARGES")
            print("-" * 30)
            for charge, count in db_stats['top_charges']:
                charge_short = charge[:50] + "..." if len(charge) > 50 else charge
                print(f"{charge_short}: {count}")
            print()
    
    # File system statistics
    file_stats = get_file_stats()
    print("📁 FILE SYSTEM STATISTICS")
    print("-" * 30)
    print(f"Image Files: {file_stats['image_files']:,}")
    print(f"Images Size: {file_stats['images_size_mb']} MB")
    print(f"New PDFs (pending): {file_stats['new_pdfs']}")
    print(f"Archived PDFs: {file_stats['archived_pdfs']}")
    print()
    
    # Health check
    print("🔍 HEALTH CHECK")
    print("-" * 30)
    
    if db_stats and file_stats:
        # Check for orphaned images
        if file_stats['image_files'] > db_stats['records_with_images']:
            orphaned = file_stats['image_files'] - db_stats['records_with_images']
            print(f"⚠️  {orphaned} orphaned image files detected")
        else:
            print("✅ No orphaned image files")
        
        # Check for pending PDFs
        if file_stats['new_pdfs'] > 0:
            print(f"📄 {file_stats['new_pdfs']} PDFs pending processing")
        else:
            print("✅ No pending PDFs")
        
        # Check recent activity
        if db_stats['recent_records'] > 0:
            print(f"🔄 {db_stats['recent_records']} records added in last 7 days")
        else:
            print("⚠️  No recent activity")
    
    print()
    print("=" * 60)

if __name__ == "__main__":
    main()
