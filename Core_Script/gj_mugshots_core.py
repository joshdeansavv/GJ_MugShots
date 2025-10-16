#!/usr/bin/env python3
"""
GJ MugShots Core - Single script for gathering, parsing, and storing mugshot data
Based on the logic from https://github.com/joshdeansavv/gjmugshots.com.git
"""

import os
import io
import re
import time
import requests
import pymysql
import fitz
import pdfplumber
from PIL import Image
from datetime import datetime
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
from contextlib import contextmanager

# Configuration
BASE_URL = "https://apps.mesacounty.us/so-blotter-reports/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
SRC_DIR = "new"
ARCHIVE_DIR = "archive"
IMAGES_DIR = "images"

# Regex pattern for parsing jail records - gender is now optional
# Pattern 1: With gender (most common)
NAME_ROW_PATTERN_WITH_GENDER = re.compile(
    r"^(?P<name>[A-Z ,'\-]+)\s+(?P<booked>\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)\s+"
    r"(?P<dob>\d{1,2}/\d{1,2}/\d{4})\s+(?P<gender>[A-Z\-]+)\s+(?P<brought>.+)$"
)

# Pattern 2: Without gender (fallback - sets gender to UNKNOWN)
NAME_ROW_PATTERN_NO_GENDER = re.compile(
    r"^(?P<name>[A-Z ,'\-]+)\s+(?P<booked>\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)\s+"
    r"(?P<dob>\d{1,2}/\d{1,2}/\d{4})\s+(?P<brought>.+)$"
)

# Keep old name for backwards compatibility
NAME_ROW_PATTERN = NAME_ROW_PATTERN_WITH_GENDER

# Database connection pool (simple implementation)
_db_connection = None

@contextmanager
def get_db_connection():
    """Context manager for database connections with connection reuse"""
    global _db_connection
    try:
        if _db_connection is None or not _db_connection.open:
            _db_connection = pymysql.connect(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                charset='utf8mb4',
                autocommit=False
            )
        yield _db_connection
    except Exception as e:
        if _db_connection:
            _db_connection.close()
            _db_connection = None
        raise e

def ensure_database_indexes():
    """Create database indexes for better query performance"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Create indexes for frequently queried columns
            indexes = [
                ("idx_bookings_raw_name", "CREATE INDEX idx_bookings_raw_name ON bookings(raw_name)"),
                ("idx_bookings_booking_date", "CREATE INDEX idx_bookings_booking_date ON bookings(booking_date)"),
                ("idx_bookings_booking_time", "CREATE INDEX idx_bookings_booking_time ON bookings(booking_time)"),
                ("idx_bookings_source_pdf", "CREATE INDEX idx_bookings_source_pdf ON bookings(source_pdf)"),
                ("idx_bookings_duplicate_check", "CREATE INDEX idx_bookings_duplicate_check ON bookings(raw_name, booking_date, booking_time, source_pdf)"),
                ("idx_bookings_last_name", "CREATE INDEX idx_bookings_last_name ON bookings(last_name)"),
                ("idx_bookings_first_name", "CREATE INDEX idx_bookings_first_name ON bookings(first_name)")
            ]
            
            for index_name, index_sql in indexes:
                try:
                    cursor.execute(index_sql)
                    print(f"Created index: {index_name}")
                except Exception as e:
                    # Index might already exist, which is fine
                    if "Duplicate key name" in str(e) or "already exists" in str(e):
                        print(f"Index {index_name} already exists")
                    else:
                        print(f"Index creation warning for {index_name}: {e}")
            
            conn.commit()
            print("Database indexes ensured")
            
    except Exception as e:
        print(f"Error creating database indexes: {e}")

def ensure_directories():
    """Create necessary directories"""
    for directory in [SRC_DIR, ARCHIVE_DIR, IMAGES_DIR]:
        if not os.path.exists(directory):
            os.makedirs(directory)
            print(f"Created directory: {directory}")

def gather_new_pdfs():
    """Download new PDFs from Mesa County website"""
    print("=== Gathering New PDFs ===")
    
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(BASE_URL, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Get existing files to avoid duplicates
        existing_files = set()
        existing_dates = set()
        
        for folder in [SRC_DIR, ARCHIVE_DIR]:
            if os.path.exists(folder):
                for file in os.listdir(folder):
                    if file.lower().endswith('.pdf'):
                        existing_files.add(file)
                        # Extract date from filename for comparison
                        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', file)
                        if date_match:
                            existing_dates.add(date_match.group(1))
        
        # Find all PDF links using multiple patterns
        pdf_links = []
        content = response.text
        
        # Pattern 1: Look for any PDF links with href
        pdf_pattern = r'href=["\']([^"\']*\.pdf[^"\']*)["\']'
        matches = re.findall(pdf_pattern, content, re.IGNORECASE)
        
        for href in matches:
            # Filter for BOOKING REPORTS only (not daily resumes)
            if any(keyword in href.lower() for keyword in ['booking', 'jail', 'records']) and 'resume' not in href.lower():
                # Convert to absolute URL
                if href.startswith('//'):
                    full_url = f"https:{href}"
                elif href.startswith('http'):
                    full_url = href
                else:
                    full_url = f"{BASE_URL}{href}"
                
                filename = os.path.basename(href.split('?')[0])
                filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
                if not filename.lower().endswith('.pdf'):
                    filename += '.pdf'
                
                pdf_links.append((full_url, filename))
        
        if not pdf_links:
            print("No PDF links found")
            return 0
        
        print(f"Found {len(pdf_links)} PDF links")
        
        downloaded_count = 0
        skipped_count = 0
        
        for url, filename in pdf_links:
            # Skip if we already have this exact file
            if filename in existing_files:
                print(f"Skipping existing file: {filename}")
                skipped_count += 1
                continue
            
            # Skip if we already have a file for this date (even with different number)
            date_match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
            if date_match:
                file_date = date_match.group(1)
                if file_date in existing_dates:
                    print(f"Skipping {filename} (date {file_date} already exists)")
                    skipped_count += 1
                    continue
            
            # Download the PDF
            try:
                print(f"Downloading: {filename}")
                response = requests.get(url, headers=headers, timeout=60, stream=True)
                response.raise_for_status()
                
                filepath = os.path.join(SRC_DIR, filename)
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                print(f"✓ Downloaded: {filename}")
                downloaded_count += 1
                time.sleep(1)  # Be respectful to server
                
            except Exception as e:
                print(f"✗ Failed to download {filename}: {e}")
                skipped_count += 1
        
        print(f"Download complete: {downloaded_count} new, {skipped_count} skipped")
        return downloaded_count
        
    except Exception as e:
        print(f"Error gathering PDFs: {e}")
        return 0

def parse_name(full_name):
    """Parse full name into first, middle, last name components
    Handles format: "LAST, FIRST MIDDLE" -> first, middle, last
    """
    if not full_name:
        return "", "", ""
    
    # Handle "LAST, FIRST MIDDLE" format
    if ',' in full_name:
        parts = full_name.split(',', 1)
        if len(parts) == 2:
            last_name = parts[0].strip()
            first_middle_part = parts[1].strip()
            first_middle_parts = first_middle_part.split()
            
            if len(first_middle_parts) == 0:
                return "", "", last_name
            elif len(first_middle_parts) == 1:
                return first_middle_parts[0], "", last_name
            else:
                # First name, middle names, last name
                first_name = first_middle_parts[0]
                middle_name = " ".join(first_middle_parts[1:])
                return first_name, middle_name, last_name
    
    # Fallback: treat as space-separated "FIRST MIDDLE LAST"
    clean_name = full_name.strip()
    name_parts = clean_name.split()
    
    if len(name_parts) == 1:
        return name_parts[0], "", ""
    elif len(name_parts) == 2:
        return name_parts[0], "", name_parts[1]
    else:
        # First name, middle names, last name
        return name_parts[0], " ".join(name_parts[1:-1]), name_parts[-1]

def save_image_to_disk(image_bytes, record_name, pdf_filename, booking_date):
    """Save image to disk with validation and unique naming for multiple arrests"""
    if not image_bytes or len(image_bytes) < 100:
        return None
    
    # Validate image data
    try:
        test_img = Image.open(io.BytesIO(image_bytes))
        test_img.verify()
    except Exception:
        return None
    
    # Create clean filename with date to handle multiple arrests
    clean_name = re.sub(r'[^\w\s-]', '', record_name).strip()
    clean_name = re.sub(r'[-\s]+', '_', clean_name)
    pdf_base = os.path.splitext(pdf_filename)[0]
    
    # Include booking date in filename to handle multiple arrests of same person
    date_str = booking_date.strftime('%Y%m%d') if booking_date else 'unknown'
    filename = f"{clean_name}_{date_str}_{pdf_base}.png"
    filepath = os.path.join(IMAGES_DIR, filename)
    
    if os.path.exists(filepath):
        return filepath
    
    try:
        with open(filepath, 'wb') as f:
            f.write(image_bytes)
        return filepath
    except Exception:
        return None

def extract_records_from_pdf(pdf_path):
    """Extract records and images from PDF"""
    records_with_images = []
    
    with pdfplumber.open(pdf_path) as pp, fitz.open(pdf_path) as doc:
        for pidx, page_pp in enumerate(pp.pages):
            # Extract text lines
            words = page_pp.extract_words()
            lines = []
            if words:
                cur_top = None
                bucket = []
                for w in words:
                    if cur_top is None:
                        cur_top = w['top']
                    if abs(w['top'] - cur_top) <= 3:
                        bucket.append(w)
                    else:
                        lines.append((" ".join(x['text'] for x in bucket).strip(), cur_top))
                        bucket = [w]
                        cur_top = w['top']
                if bucket:
                    lines.append((" ".join(x['text'] for x in bucket).strip(), cur_top))
            else:
                raw = page_pp.extract_text() or ""
                lines = [(l, 0) for l in raw.splitlines()]

            # Extract images
            page_img_regions = []
            full_img = None
            try:
                full_pix = doc[pidx].get_pixmap(matrix=fitz.Matrix(2,2))
                full_img = Image.open(io.BytesIO(full_pix.tobytes("png")))
            except Exception:
                full_img = None

            for im in (page_pp.images or []):
                try:
                    x0 = int(im.get("x0", 0))
                    top = int(im.get("top", 0))
                    x1 = int(im.get("x1", 0))
                    bottom = int(im.get("bottom", 0))
                    if full_img and x1 > x0 and bottom > top:
                        sx = full_img.width / page_pp.width if page_pp.width else 1.0
                        sy = full_img.height / page_pp.height if page_pp.height else 1.0
                        
                        img_height = (bottom - top) * sy
                        img_width = (x1 - x0) * sx
                        
                        # Skip small images (logos/headers)
                        if img_height < 50 or img_width < 50:
                            continue
                        if top * sy < 100:
                            continue
                            
                        crop = full_img.crop((int(x0 * sx), int(top * sy), int(x1 * sx), int(bottom * sy)))
                        buf = io.BytesIO()
                        crop.save(buf, "PNG")
                        buf.seek(0)
                        img_bytes = buf.getvalue()
                        
                        if img_bytes and len(img_bytes) > 100:
                            try:
                                test_img = Image.open(io.BytesIO(img_bytes))
                                test_img.verify()
                                page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": img_bytes})
                            except Exception:
                                page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": None})
                        else:
                            page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": None})
                except Exception:
                    continue

            # Fallback image extraction
            if not page_img_regions:
                imgs = doc[pidx].get_images(full=True) or []
                for im in imgs:
                    try:
                        xref = im[0]
                        pix = fitz.Pixmap(doc, xref)
                        if pix.n - pix.alpha < 4:
                            imgbytes = pix.tobytes("png")
                        else:
                            pix = fitz.Pixmap(fitz.csRGB, pix)
                            imgbytes = pix.tobytes("png")
                        if imgbytes and len(imgbytes) > 100:
                            try:
                                test_img = Image.open(io.BytesIO(imgbytes))
                                test_img.verify()
                                page_img_regions.append({"mid_y": None, "bytes": imgbytes})
                            except Exception:
                                continue
                    except Exception:
                        continue

            # Parse name entries
            name_entries = []
            for idx, (text, top) in enumerate(lines):
                # Try pattern with gender first
                m = NAME_ROW_PATTERN_WITH_GENDER.match(text)
                if not m:
                    # Try pattern without gender as fallback
                    m = NAME_ROW_PATTERN_NO_GENDER.match(text)
                    if m:
                        # Add UNKNOWN gender if missing
                        rec = m.groupdict()
                        rec['gender'] = 'UNKNOWN'
                    else:
                        continue
                else:
                    rec = m.groupdict()
                
                if m:
                    rec['charges'] = []
                    rec['address'] = ""
                    
                    # Look for address on the next line after booking info
                    if idx + 1 < len(lines):
                        next_line = lines[idx + 1][0].strip()
                        # Check if next line looks like an address (contains street, city, state, zip)
                        if (next_line and 
                            not next_line.startswith("Charge") and 
                            not next_line.startswith("State") and
                            not NAME_ROW_PATTERN_WITH_GENDER.match(next_line) and
                            not NAME_ROW_PATTERN_NO_GENDER.match(next_line) and
                            ("," in next_line or "RD" in next_line or "ST" in next_line or "AVE" in next_line or "DR" in next_line)):
                            rec['address'] = next_line
                    
                    j = idx + 1
                    while j < len(lines) and not NAME_ROW_PATTERN_WITH_GENDER.match(lines[j][0]) and not NAME_ROW_PATTERN_NO_GENDER.match(lines[j][0]):
                        ln = lines[j][0].strip()
                        if ln and ln.startswith("State "):
                            rec['charges'].append(ln)
                        # Check for Marshal/Federal holds
                        elif ln and ("MARSHAL HOLD" in ln.upper() or "MARSHALL HOLD" in ln.upper() or ("FEDERAL" in ln.upper() and "HOLD" in ln.upper())):
                            rec['charges'].append("MARSHAL HOLD")
                        # Check for other federal holds
                        elif ln and ("US MARSHAL" in ln.upper() or "U.S. MARSHAL" in ln.upper() or "FBI" in ln.upper()) and ("HOLD" in ln.upper() or "FEDERAL" in ln.upper()):
                            rec['charges'].append("MARSHAL HOLD")
                        j += 1
                    name_entries.append({"rec": rec, "top": top})

            if not name_entries:
                continue

            # Match images to names
            name_entries.sort(key=lambda x: x["top"])
            page_img_regions.sort(key=lambda x: x["mid_y"] if x["mid_y"] is not None else float('inf'))
            
            distances = []
            for i, ne in enumerate(name_entries):
                for j, img_region in enumerate(page_img_regions):
                    if img_region["mid_y"] is not None:
                        distance = abs(img_region["mid_y"] - ne["top"])
                    else:
                        distance = float('inf')
                    distances.append((distance, i, j))
            
            distances.sort()
            assigned_names = set()
            assigned_images = set()
            
            for distance, name_idx, img_idx in distances:
                if name_idx not in assigned_names and img_idx not in assigned_images:
                    if distance < 200:
                        assigned_names.add(name_idx)
                        assigned_images.add(img_idx)
            
            for i, ne in enumerate(name_entries):
                if i in assigned_names:
                    for distance, name_idx, img_idx in distances:
                        if name_idx == i and img_idx in assigned_images:
                            img_bytes = page_img_regions[img_idx]["bytes"]
                            break
                    else:
                        img_bytes = None
                else:
                    img_bytes = None
                
                records_with_images.append((ne["rec"], img_bytes))
    
    return records_with_images

def save_records_to_database(records_with_images, pdf_filename):
    """Save all records from a PDF to MySQL database - Optimized version"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Check if this PDF is from before June 26th (no mugshots expected)
            pdf_date_match = re.search(r'(\d{4}-\d{2}-\d{2})', pdf_filename)
            is_pre_june_26 = False
            if pdf_date_match:
                pdf_date_str = pdf_date_match.group(1)
                pdf_date = datetime.strptime(pdf_date_str, '%Y-%m-%d').date()
                june_26_2025 = datetime.strptime('2025-06-26', '%Y-%m-%d').date()
                is_pre_june_26 = pdf_date < june_26_2025
            
            # Prepare all records data first
            records_to_insert = []
            records_to_check = []
            
            for record, image_bytes in records_with_images:
                # Parse name components
                raw_name = record['name'].strip() if record['name'] else ""
                first_name, middle_name, last_name = parse_name(raw_name)
                
                # Prepare data
                charges_text = "; ".join(record['charges']) if record['charges'] else "No charges listed"
                booking_datetime = record['booked'].strip() if record['booked'] else ""
                dob = record['dob'].strip() if record['dob'] else ""
                gender = record['gender'].strip() if record['gender'] else ""
                raw_arrestor = record['brought'].strip() if record['brought'] else ""
                address = record.get('address', '').strip() if record.get('address') else ""
                
                # Parse booking date and time with robust error handling
                try:
                    if not booking_datetime or not booking_datetime.strip():
                        booking_date = None
                        booking_time = None
                    else:
                        # Split the datetime string properly
                        parts = booking_datetime.strip().split(' ')
                        if len(parts) < 3:
                            print(f"Warning: Invalid booking datetime format: '{booking_datetime}'")
                            booking_date = None
                            booking_time = None
                        else:
                            date_part = parts[0]
                            time_part = ' '.join(parts[-2:])  # Last two parts should be time and AM/PM
                            
                            # Parse date
                            booking_date = datetime.strptime(date_part, '%m/%d/%Y').date()
                            
                            # Parse time - ensure it's a proper time object
                            booking_time = datetime.strptime(time_part, '%I:%M:%S %p').time()
                            
                            # Time object is valid from strptime
                            pass
                                
                except ValueError as e:
                    print(f"Warning: Date/time parsing error for '{booking_datetime}': {e}")
                    booking_date = None
                    booking_time = None
                except Exception as e:
                    print(f"Warning: Unexpected error parsing datetime '{booking_datetime}': {e}")
                    booking_date = None
                    booking_time = None
                
                # Save image (only if not pre-June 26th)
                image_path = None
                if not is_pre_june_26 and image_bytes:
                    image_path = save_image_to_disk(image_bytes, record['name'], pdf_filename, booking_date)
                elif is_pre_june_26:
                    print(f"  Skipping image for {raw_name} (pre-June 26th file)")
                
                # Data validation is handled by datetime.strptime() above
                
                # Collect record data for batch processing
                record_data = (raw_name, first_name, middle_name, last_name, address, booking_date, booking_time,
                              dob, gender, raw_arrestor, charges_text, pdf_filename, image_path)
                records_to_insert.append(record_data)
                records_to_check.append((raw_name, booking_date, booking_time, pdf_filename))
            
            if not records_to_insert:
                return
            
            # Batch check for existing records - much more efficient than individual queries
            existing_records = set()
            if records_to_check:
                # Create a single query to check all records at once
                placeholders = ','.join(['(%s,%s,%s,%s)'] * len(records_to_check))
                check_query = f'''
                    SELECT raw_name, booking_date, booking_time, source_pdf 
                    FROM bookings 
                    WHERE (raw_name, booking_date, booking_time, source_pdf) IN ({placeholders})
                '''
                
                # Flatten the records_to_check list for the query
                flat_check_data = []
                for record in records_to_check:
                    flat_check_data.extend(record)
                
                cursor.execute(check_query, flat_check_data)
                existing_records = set(cursor.fetchall())
            
            # Filter out existing records and prepare batch insert
            new_records = []
            skipped_count = 0
            
            for i, record_data in enumerate(records_to_insert):
                check_key = records_to_check[i]
                if check_key in existing_records:
                    skipped_count += 1
                else:
                    new_records.append(record_data)
            
            # Batch insert all new records at once - much more efficient
            if new_records:
                insert_query = '''
                    INSERT INTO bookings
                    (raw_name, first_name, middle_name, last_name, address, booking_date, booking_time, 
                     date_of_birth, gender, raw_arrestor, charges, source_pdf, image_path)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                '''
                cursor.executemany(insert_query, new_records)
            
            conn.commit()
            saved_count = len(new_records)
            print(f"Saved {saved_count} new records, skipped {skipped_count} duplicates from {pdf_filename}")
        
    except Exception as e:
        print(f"Error saving records: {e}")
        # Connection will be automatically closed by context manager

def process_pdf_files():
    """Process all PDF files in the new directory, starting with oldest first"""
    if not os.path.isdir(SRC_DIR):
        print(f"Missing {SRC_DIR} directory")
        return
    
    files = [f for f in os.listdir(SRC_DIR) if f.lower().endswith(".pdf")]
    if not files:
        print(f"No PDFs in {SRC_DIR}")
        return
    
    # Sort files by date (oldest first)
    def extract_date_from_filename(filename):
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
        if date_match:
            return datetime.strptime(date_match.group(1), '%Y-%m-%d')
        return datetime.min
    
    files.sort(key=extract_date_from_filename)
    
    print(f"\n=== Processing {len(files)} PDF files (oldest first) ===")
    
    for f in files:
        path = os.path.join(SRC_DIR, f)
        print(f"\nProcessing: {f}")
        try:
            records = extract_records_from_pdf(path)
            print(f"Extracted {len(records)} records")
            if records:
                save_records_to_database(records, f)
        except Exception as e:
            print(f"FAILED {f}: {e}")
        
        # Move processed file to archive
        try:
            import shutil
            shutil.move(path, os.path.join(ARCHIVE_DIR, f))
            print(f"Archived: {f}")
        except Exception as e:
            print(f"Archive move failed {f}: {e}")

def main():
    """Main function - gather, parse, and store mugshot data"""
    print("=== GJ MugShots Core ===")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Ensure directories exist
    ensure_directories()
    
    # Ensure database indexes exist for optimal performance
    ensure_database_indexes()
    
    # Step 1: Gather new PDFs
    gather_new_pdfs()
    
    # Step 2: Process PDFs and extract data
    process_pdf_files()
    
    print("Processing complete!")

def check_and_remove_duplicates():
    """Check for and remove exact duplicate records while preserving multiple arrests"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Find exact duplicates (same person, same date/time, same source)
            cursor.execute('''
                SELECT raw_name, booking_date, booking_time, source_pdf, COUNT(*) as count,
                       GROUP_CONCAT(id) as all_ids, GROUP_CONCAT(charges SEPARATOR '|||') as all_charges
                FROM bookings 
                GROUP BY raw_name, booking_date, booking_time, source_pdf
                HAVING COUNT(*) > 1
            ''')
            
            duplicates = cursor.fetchall()
            if not duplicates:
                print("No exact duplicates found")
                return 0
            
            removed_count = 0
            for name, date, time, pdf, count, all_ids, all_charges in duplicates:
                # Smart selection: keep the record with actual charges, not "No charges listed"
                ids_list = [int(id_str) for id_str in all_ids.split(',')]
                charges_list = all_charges.split('|||')
                
                # Find the best record to keep (one with actual charges)
                keep_id = ids_list[0]  # Default to first
                for i, charges in enumerate(charges_list):
                    if charges and charges != "No charges listed" and charges.strip():
                        keep_id = ids_list[i]
                        break
                
                # Delete all others
                ids_to_delete = [id_val for id_val in ids_list if id_val != keep_id]
                
                if ids_to_delete:
                    placeholders = ','.join(['%s'] * len(ids_to_delete))
                    cursor.execute(f'DELETE FROM bookings WHERE id IN ({placeholders})', ids_to_delete)
                    deleted = cursor.rowcount
                    removed_count += deleted
                    print(f"Removed {deleted} duplicate records for {name} on {date} {time}")
            
            conn.commit()
            print(f"Total duplicates removed: {removed_count}")
            return removed_count
            
    except Exception as e:
        print(f"Error checking duplicates: {e}")
        return 0

def cleanup():
    """Cleanup function to close database connections"""
    global _db_connection
    if _db_connection:
        _db_connection.close()
        _db_connection = None

if __name__ == "__main__":
    try:
        main()
    finally:
        cleanup()
