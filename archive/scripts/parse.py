
#!/opt/homebrew/bin/python3
import os, io, shutil, re, time
import pymysql
import fitz, pdfplumber
from PIL import Image

SRC = "new"
DST = "archive"
# Database configuration - Import from config.py for security
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

name_row = re.compile(
    r"^(?P<name>[A-Z ,'\-]+)\s+"
    r"(?P<booked>\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)\s+"
    r"(?P<dob>\d{1,2}/\d{1,2}/\d{4})"
    r"(?:\s+(?P<gender>MALE|FEMALE))?\s+"
    r"(?P<brought>.+)$"
)

def parse_name(full_name):
    """
    Parse full name into first, middle, last name components
    Handles various formats: "Last, First Middle", "First Middle Last", etc.
    """
    if not full_name or not full_name.strip():
        return "", "", ""
    
    # Clean up the name
    full_name = full_name.strip()
    
    # Handle "Last, First Middle" format (most common in jail records)
    if ',' in full_name:
        parts = full_name.split(',', 1)
        last_name = parts[0].strip()
        first_middle = parts[1].strip()
        
        # Handle cases like "O'CONNOR, JOHN" or "SMITH-JONES, MARY"
        # Remove extra spaces and normalize
        last_name = ' '.join(last_name.split())
        first_middle = ' '.join(first_middle.split())
        
        if not first_middle:
            return "", "", last_name
        
        # Split first and middle names
        first_middle_parts = first_middle.split()
        if len(first_middle_parts) == 1:
            return first_middle_parts[0], "", last_name
        elif len(first_middle_parts) == 2:
            return first_middle_parts[0], first_middle_parts[1], last_name
        else:
            # Multiple middle names - join them together
            return first_middle_parts[0], " ".join(first_middle_parts[1:]), last_name
    
    else:
        # No comma - assume "First Middle Last" format
        name_parts = full_name.split()
        name_parts = [part.strip() for part in name_parts if part.strip()]  # Remove empty parts
        
        if len(name_parts) == 0:
            return "", "", ""
        elif len(name_parts) == 1:
            return name_parts[0], "", ""
        elif len(name_parts) == 2:
            return name_parts[0], "", name_parts[1]
        else:
            # First name, middle names, last name
            # Last part is always last name, first part is first name, rest are middle
            return name_parts[0], " ".join(name_parts[1:-1]), name_parts[-1]

def test_database_connection():
    """Test connection to MySQL database"""
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        conn.close()
        print(f"Database connection successful: {DB_HOST}:{DB_PORT}/{DB_NAME}")
        return True
    except Exception as e:
        print(f"Database connection error: {e}")
        return False

def save_image_to_disk(image_bytes, record_name, pdf_filename):
    """Save image to disk and return the file path"""
    if not image_bytes:
        return None
    
    # Create images directory if it doesn't exist
    images_dir = "images"
    os.makedirs(images_dir, exist_ok=True)
    
    # Clean record name for filename
    clean_name = re.sub(r'[^\w\s-]', '', record_name).strip()
    clean_name = re.sub(r'[-\s]+', '_', clean_name)
    
    # Create deterministic filename based on record name and PDF
    # This prevents duplicate images for the same person
    pdf_base = os.path.splitext(pdf_filename)[0]
    filename = f"{clean_name}_{pdf_base}.png"
    filepath = os.path.join(images_dir, filename)
    
    # Check if file already exists to avoid duplicates
    if os.path.exists(filepath):
        return filepath
    
    # Save image
    with open(filepath, 'wb') as f:
        f.write(image_bytes)
    
    return filepath

def save_records_to_database(records_with_images, pdf_filename):
    """Save all records from a PDF to MySQL database"""
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
        
        for record, image_bytes in records_with_images:
            # Store raw name first (before any parsing)
            raw_name = record['name'].strip()
            
            # Parse name components
            first_name, middle_name, last_name = parse_name(raw_name)
            
            # Prepare data
            charges_text = "; ".join(record['charges']) if record['charges'] else "None"
            
            # Clean up data and split booking date/time
            booking_datetime = record['booked'].strip()
            dob = record['dob'].strip()
            gender = record['gender'].strip()
            arrestor = record['brought'].strip()
            
            # Store raw officer information (before any parsing)
            raw_arrestor = arrestor
            
            # Parse booking date and time separately
            try:
                # Extract date part (before the first space)
                date_part = booking_datetime.split(' ')[0]
                # Extract time part (last two parts: time and AM/PM)
                time_parts = booking_datetime.split(' ')
                time_part = ' '.join(time_parts[-2:])  # e.g., "12:32:00 AM"
                
                # Convert to proper date and time formats
                from datetime import datetime
                booking_date = datetime.strptime(date_part, '%m/%d/%Y').date()
                booking_time = datetime.strptime(time_part, '%I:%M:%S %p').time()
            except Exception as e:
                print(f"Warning: Could not parse booking datetime '{booking_datetime}': {e}")
                booking_date = None
                booking_time = None
            
            # Save image to disk and get path
            image_path = save_image_to_disk(image_bytes, record['name'], pdf_filename)
            
            # Check if record already exists (same person, same booking date and time)
            cursor.execute('''
                SELECT id FROM jail_records 
                WHERE raw_name = %s AND booking_date = %s AND booking_time = %s
            ''', (raw_name, booking_date, booking_time))
            
            existing_record = cursor.fetchone()
            
            if existing_record:
                print(f"⏭ Skipping duplicate: {record['name']} (already exists)")
            else:
                # Insert new record into database
                cursor.execute('''
                    INSERT INTO jail_records 
                    (raw_name, first_name, middle_name, last_name, booking_date, booking_time, date_of_birth, 
                     gender, arrestor, raw_arrestor, charges, source_pdf, image_path)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (raw_name, first_name, middle_name, last_name, booking_date, booking_time, dob, 
                      gender, arrestor, raw_arrestor, charges_text, pdf_filename, image_path))
                
                print(f"✓ Saved record: {record['name']}")
        
        conn.commit()
        print(f"Processed {len(records_with_images)} records from {pdf_filename}")
        
    except Exception as e:
        print(f"✗ Error saving records: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

def extract_records(pdf_path):
    out = []
    with pdfplumber.open(pdf_path) as pp, fitz.open(pdf_path) as doc:
        for pidx, page_pp in enumerate(pp.pages):
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

            page_img_regions = []
            full_img = None
            try:
                full_pix = doc[pidx].get_pixmap(matrix=fitz.Matrix(2,2))
                full_img = Image.open(io.BytesIO(full_pix.tobytes("png")))
                scale_y = full_img.height / page_pp.height if page_pp.height else 1.0
            except Exception:
                full_img = None
                scale_y = 1.0

            for im in (page_pp.images or []):
                try:
                    x0 = int(im.get("x0", 0))
                    top = int(im.get("top", 0))
                    x1 = int(im.get("x1", 0))
                    bottom = int(im.get("bottom", 0))
                    if full_img and x1 > x0 and bottom > top:
                        sx = full_img.width / page_pp.width if page_pp.width else 1.0
                        sy = full_img.height / page_pp.height if page_pp.height else 1.0
                        
                        # Skip header images (usually at top of page, small, or logo-like)
                        img_height = (bottom - top) * sy
                        img_width = (x1 - x0) * sx
                        
                        # Skip images that are too small (likely logos/headers)
                        if img_height < 50 or img_width < 50:
                            continue
                            
                        # Skip images at the very top of the page (headers)
                        if top * sy < 100:
                            continue
                            
                        crop = full_img.crop((int(x0 * sx), int(top * sy), int(x1 * sx), int(bottom * sy)))
                        buf = io.BytesIO()
                        crop.save(buf, "PNG")
                        buf.seek(0)
                        img_bytes = buf.getvalue()
                        
                        # Validate the image bytes before adding
                        if img_bytes and len(img_bytes) > 100:  # Basic validation
                            page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": img_bytes})
                        else:
                            # Add placeholder for invalid/broken image
                            page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": None})
                except Exception:
                    continue

            # If no images found with coordinates, try fitz method
            if not page_img_regions:
                imgs = doc[pidx].get_images(full=True) or []
                seq = []
                for im in imgs:
                    try:
                        xref = im[0]
                        pix = fitz.Pixmap(doc, xref)
                        if pix.n - pix.alpha < 4:
                            imgbytes = pix.tobytes("png")
                        else:
                            pix = fitz.Pixmap(fitz.csRGB, pix)
                            imgbytes = pix.tobytes("png")
                        # Validate the image bytes before adding
                        if imgbytes and len(imgbytes) > 100:  # Basic validation
                            seq.append(imgbytes)
                    except Exception:
                        continue
                for b in seq:
                    page_img_regions.append({"mid_y": None, "bytes": b})
            
            # If we still have no images, try extracting all images from the page
            if not page_img_regions:
                try:
                    # Get all images from the page using fitz
                    image_list = doc[pidx].get_images()
                    for img_index, img in enumerate(image_list):
                        try:
                            xref = img[0]
                            pix = fitz.Pixmap(doc, xref)
                            if pix.n - pix.alpha < 4:
                                imgbytes = pix.tobytes("png")
                            else:
                                pix = fitz.Pixmap(fitz.csRGB, pix)
                                imgbytes = pix.tobytes("png")
                            # Validate the image bytes before adding
                            if imgbytes and len(imgbytes) > 100:  # Basic validation
                                page_img_regions.append({"mid_y": None, "bytes": imgbytes})
                        except Exception:
                            continue
                except Exception:
                    pass

            name_entries = []
            for idx, (text, top) in enumerate(lines):
                m = name_row.match(text)
                if m:
                    rec = m.groupdict()
                    rec['charges'] = []
                    j = idx + 1
                    while j < len(lines) and not name_row.match(lines[j][0]):
                        ln = lines[j][0].strip()
                        if ln:
                            # Skip address lines (start with numbers and contain street indicators)
                            if re.match(r'^\d+.*(AVE|ST|RD|DR|BLVD|WAY|CT|PL|LN|CIR)', ln, re.IGNORECASE):
                                j += 1
                                continue
                            # Skip "Charge Description" header
                            if ln.startswith("Charge Description"):
                                j += 1
                                continue
                            # Skip page numbers
                            if ln.startswith("Page ") and " of " in ln:
                                j += 1
                                continue
                            # Skip empty lines or just whitespace
                            if not ln or ln.isspace():
                                j += 1
                                continue
                            # Add actual charge lines (start with "State")
                            if ln.startswith("State "):
                                rec['charges'].append(ln)
                        j += 1
                    name_entries.append({"rec": rec, "top": top})

            if not name_entries:
                continue

            # Use optimal matching - find the best global assignment
            name_entries.sort(key=lambda x: x["top"])
            page_img_regions.sort(key=lambda x: x["mid_y"] if x["mid_y"] is not None else float('inf'))
            
            # Create distance matrix for all name-image pairs
            distances = []
            for i, ne in enumerate(name_entries):
                for j, img_region in enumerate(page_img_regions):
                    if img_region["mid_y"] is not None:
                        distance = abs(img_region["mid_y"] - ne["top"])
                    else:
                        distance = float('inf')
                    distances.append((distance, i, j))
            
            # Sort by distance to get optimal assignments
            distances.sort()
            
            # Track which names and images have been assigned
            assigned_names = set()
            assigned_images = set()
            
            # Assign images to names in order of best distance
            for distance, name_idx, img_idx in distances:
                if name_idx not in assigned_names and img_idx not in assigned_images:
                    if distance < 200:  # Only assign if reasonably close
                        assigned_names.add(name_idx)
                        assigned_images.add(img_idx)
            
            # Create results in original order
            for i, ne in enumerate(name_entries):
                if i in assigned_names:
                    # Find which image was assigned to this name
                    for distance, name_idx, img_idx in distances:
                        if name_idx == i and img_idx in assigned_images:
                            img_bytes = page_img_regions[img_idx]["bytes"]
                            break
                    else:
                        img_bytes = None
                else:
                    img_bytes = None
                
                out.append((ne["rec"], img_bytes))
    return out

def run_gather():
    """Run the gather.py script to download new PDFs"""
    print("=== Running Gather to Download New PDFs ===")
    try:
        import subprocess
        result = subprocess.run(['python3', 'gather.py'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✓ Gather completed successfully")
            print("Gather output:", result.stdout)
        else:
            print("✗ Gather failed:", result.stderr)
    except Exception as e:
        print(f"✗ Error running gather: {e}")

def cleanup_orphaned_images():
    """Remove image files that are not referenced in the database"""
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
        
        # Get all valid image paths from database
        cursor.execute("SELECT image_path FROM jail_records WHERE image_path IS NOT NULL AND image_path != ''")
        valid_paths = {row[0] for row in cursor.fetchall()}
        
        conn.close()
        
        # Find all image files
        images_dir = "images"
        if not os.path.exists(images_dir):
            return
        
        orphaned_count = 0
        for filename in os.listdir(images_dir):
            if filename.endswith('.png'):
                filepath = os.path.join(images_dir, filename)
                if filepath not in valid_paths:
                    os.remove(filepath)
                    orphaned_count += 1
        
        if orphaned_count > 0:
            print(f"✓ Cleaned up {orphaned_count} orphaned image files")
            
    except Exception as e:
        print(f"✗ Error cleaning up orphaned images: {e}")

def main():
    # Run gather first to download new PDFs
    run_gather()
    
    # Test database connection
    if not test_database_connection():
        print("Cannot connect to database. Exiting.")
        return
    
    # Clean up orphaned images before processing
    cleanup_orphaned_images()
    
    if not os.path.isdir(SRC):
        print("Missing", SRC); return
    files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".pdf")])
    if not files:
        print("No PDFs in", SRC); return
    
    print(f"\n=== Processing {len(files)} PDF files ===")
    
    for f in files:
        path = os.path.join(SRC, f)
        print("Process", f)
        try:
            recs = extract_records(path)
            print("Records", len(recs))
            if recs:
                save_records_to_database(recs, f)
        except Exception as e:
            print("FAILED", f, e)
        
        # Move processed file to archive
        try:
            shutil.move(path, os.path.join(DST, f))
            print("Archived", f)
        except Exception as e:
            print("Archive move failed", f, e)
        
        print("Processed", f)

if __name__ == "__main__":
    main()
