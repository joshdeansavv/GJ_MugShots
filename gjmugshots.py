import os
import sys
import io
import shutil
import re
import time
import json
import requests
import subprocess
from datetime import datetime, timedelta
from PIL import Image
import pymysql
import fitz
import pdfplumber
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
SRC = "new"
DST = "archive"
IMAGES_DIR = "images"
BASE_URL = "https://www.mesacounty.us/sheriff/jail-records/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
name_row = re.compile(
    r"^(?P<name>[A-Z ,'\-]+)\s+"
    r"(?P<booked>\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)\s+"
    r"(?P<dob>\d{1,2}/\d{1,2}/\d{4})"
    r"(?:\s+(?P<gender>MALE|FEMALE))?\s+"
    r"(?P<brought>.+)$"
)
def print_header(title):
    print("=" * 60)
    print(f" {title}")
    print("=" * 60)
def print_status(message, status="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    if status == "SUCCESS":
        print(f"✅ [{timestamp}] {message}")
    elif status == "ERROR":
        print(f"❌ [{timestamp}] {message}")
    elif status == "WARNING":
        print(f"⚠️  [{timestamp}] {message}")
    else:
        print(f"ℹ️  [{timestamp}] {message}")
def ensure_directories():
    for directory in [SRC, DST, IMAGES_DIR]:
        if not os.path.exists(directory):
            os.makedirs(directory)
            print_status(f"Created directory: {directory}")
def test_database_connection():
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4'
        )
        conn.close()
        print_status("Database connection successful", "SUCCESS")
        return True
    except Exception as e:
        print_status(f"Database connection error: {e}", "ERROR")
        return False
def parse_name(full_name):
    if not full_name or not full_name.strip():
        return "", "", ""
    full_name = full_name.strip()
    if ',' in full_name:
        parts = full_name.split(',', 1)
        last_name = parts[0].strip()
        first_middle = parts[1].strip()
        last_name = ' '.join(last_name.split())
        first_middle = ' '.join(first_middle.split())
        if not first_middle:
            return "", "", last_name
        first_middle_parts = first_middle.split()
        if len(first_middle_parts) == 1:
            return first_middle_parts[0], "", last_name
        elif len(first_middle_parts) == 2:
            return first_middle_parts[0], first_middle_parts[1], last_name
        else:
            return first_middle_parts[0], " ".join(first_middle_parts[1:]), last_name
    else:
        name_parts = full_name.split()
        name_parts = [part.strip() for part in name_parts if part.strip()]
        if len(name_parts) == 0:
            return "", "", ""
        elif len(name_parts) == 1:
            return name_parts[0], "", ""
        elif len(name_parts) == 2:
            return name_parts[0], "", name_parts[1]
        else:
            return name_parts[0], " ".join(name_parts[1:-1]), name_parts[-1]
def save_image_to_disk(image_bytes, record_name, pdf_filename):
    if not image_bytes:
        return None
    clean_name = re.sub(r'[^\w\s-]', '', record_name).strip()
    clean_name = re.sub(r'[-\s]+', '_', clean_name)
    pdf_base = os.path.splitext(pdf_filename)[0]
    filename = f"{clean_name}_{pdf_base}.png"
    filepath = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(filepath):
        return filepath
    with open(filepath, 'wb') as f:
        f.write(image_bytes)
    return filepath
def save_records_to_database(records_with_images, pdf_filename):
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
        saved_count = 0
        skipped_count = 0
        for record, image_bytes in records_with_images:
            raw_name = record['name'].strip()
            first_name, middle_name, last_name = parse_name(raw_name)
            charges_text = "; ".join(record['charges']) if record['charges'] else "No charges listed"
            booking_datetime = record['booked'].strip()
            dob = record['dob'].strip()
            gender = record['gender'].strip()
            arrestor = record['brought'].strip()
            try:
                date_part = booking_datetime.split(' ')[0]
                time_parts = booking_datetime.split(' ')
                time_part = ' '.join(time_parts[-2:])
                from datetime import datetime
                booking_date = datetime.strptime(date_part, '%m/%d/%Y').date()
                booking_time = datetime.strptime(time_part, '%I:%M:%S %p').time()
            except Exception as e:
                print_status(f"Warning: Could not parse booking datetime '{booking_datetime}': {e}", "WARNING")
                booking_date = None
                booking_time = None
            image_path = save_image_to_disk(image_bytes, record['name'], pdf_filename)
            cursor.execute('''
                SELECT id FROM jail_records 
                WHERE raw_name = %s AND booking_date = %s AND booking_time = %s
                    INSERT INTO jail_records 
                    (raw_name, first_name, middle_name, last_name, booking_date, booking_time, date_of_birth, 
                     gender, arrestor, raw_arrestor, charges, source_pdf, image_path)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (raw_name, first_name, middle_name, last_name, booking_date, booking_time, dob, 
                      gender, arrestor, arrestor, charges_text, pdf_filename, image_path))
                saved_count += 1
        conn.commit()
        print_status(f"Saved {saved_count} new records, skipped {skipped_count} duplicates from {pdf_filename}", "SUCCESS")
    except Exception as e:
        print_status(f"Error saving records: {e}", "ERROR")
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
                        img_height = (bottom - top) * sy
                        img_width = (x1 - x0) * sx
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
                            page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": img_bytes})
                        else:
                            page_img_regions.append({"mid_y": (top + bottom) * 0.5, "bytes": None})
                except Exception:
                    continue
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
                        if imgbytes and len(imgbytes) > 100:
                            seq.append(imgbytes)
                    except Exception:
                        continue
                for b in seq:
                    page_img_regions.append({"mid_y": None, "bytes": b})
            if not page_img_regions:
                try:
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
                            if imgbytes and len(imgbytes) > 100:
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
                            if re.match(r'^\d+.*(AVE|ST|RD|DR|BLVD|WAY|CT|PL|LN|CIR)', ln, re.IGNORECASE):
                                j += 1
                                continue
                            if ln.startswith("Charge Description"):
                                j += 1
                                continue
                            if ln.startswith("Page ") and " of " in ln:
                                j += 1
                                continue
                            if not ln or ln.isspace():
                                j += 1
                                continue
                            if ln.startswith("State "):
                                rec['charges'].append(ln)
                        j += 1
                    name_entries.append({"rec": rec, "top": top})
            if not name_entries:
                continue
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
                out.append((ne["rec"], img_bytes))
    return out
def gather_pdfs():
    print_header("GATHERING NEW PDFs")
    try:
        headers = {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        response = requests.get(BASE_URL, headers=headers, timeout=30)
        response.raise_for_status()
        pdf_pattern = r'href="([^"]*\.pdf[^"]*)"'
        pdf_links = re.findall(pdf_pattern, response.text, re.IGNORECASE)
        absolute_links = []
        for link in pdf_links:
            if link.startswith('http'):
                absolute_links.append(link)
            elif link.startswith('/'):
                absolute_links.append(f"https://www.mesacounty.us{link}")
            else:
                absolute_links.append(f"{BASE_URL}{link}")
        if not absolute_links:
            print_status("No PDF links found", "WARNING")
            return 0
        print_status(f"Found {len(absolute_links)} PDF links")
        downloaded_count = 0
        skipped_count = 0
        for url in absolute_links:
            filename = os.path.basename(url.split('?')[0])
            filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
            if not filename.lower().endswith('.pdf'):
                filename += '.pdf'
            filepath = os.path.join(SRC, filename)
            if os.path.exists(filepath):
                skipped_count += 1
                continue
            date_pattern = r'(\d{4}-\d{2}-\d{2})'
            match = re.search(date_pattern, filename)
            if match:
                try:
                    pdf_date = datetime.strptime(match.group(1), '%Y-%m-%d')
                    cutoff_date = datetime.now() - timedelta(days=7)
                    if pdf_date < cutoff_date:
                        skipped_count += 1
                        continue
                except:
                    pass
            try:
                headers = {
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/pdf,application/octet-stream,*/*',
                }
                response = requests.get(url, headers=headers, timeout=60, stream=True)
                response.raise_for_status()
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                print_status(f"Downloaded: {filename}", "SUCCESS")
                downloaded_count += 1
                time.sleep(1)  
            except Exception as e:
                print_status(f"Error downloading {filename}: {e}", "ERROR")
        print_status(f"Download complete: {downloaded_count} new, {skipped_count} skipped", "SUCCESS")
        return downloaded_count
    except Exception as e:
        print_status(f"Error fetching PDF links: {e}", "ERROR")
        return 0
def parse_pdfs():
    print_header("PROCESSING PDFs")
    if not os.path.isdir(SRC):
        print_status(f"Missing directory: {SRC}", "ERROR")
        return
    files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".pdf")])
    if not files:
        print_status(f"No PDFs in {SRC}", "WARNING")
        return
    print_status(f"Processing {len(files)} PDF files")
    total_records = 0
    for f in files:
        path = os.path.join(SRC, f)
        print_status(f"Processing: {f}")
        try:
            recs = extract_records(path)
            print_status(f"Extracted {len(recs)} records from {f}")
            if recs:
                save_records_to_database(recs, f)
                total_records += len(recs)
        except Exception as e:
            print_status(f"Failed to process {f}: {e}", "ERROR")
        try:
            shutil.move(path, os.path.join(DST, f))
            print_status(f"Archived: {f}", "SUCCESS")
        except Exception as e:
            print_status(f"Archive move failed for {f}: {e}", "ERROR")
    print_status(f"Processing complete: {total_records} total records processed", "SUCCESS")
def cleanup_orphaned_images():
    print_header("CLEANING UP ORPHANED IMAGES")
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
        cursor.execute("SELECT image_path FROM jail_records WHERE image_path IS NOT NULL AND image_path != ''")
        valid_paths = {row[0] for row in cursor.fetchall()}
        conn.close()
        if not os.path.exists(IMAGES_DIR):
            print_status("No images directory found", "WARNING")
            return
        orphaned_count = 0
        for filename in os.listdir(IMAGES_DIR):
            if filename.endswith('.png'):
                filepath = os.path.join(IMAGES_DIR, filename)
                if filepath not in valid_paths:
                    os.remove(filepath)
                    orphaned_count += 1
        if orphaned_count > 0:
            print_status(f"Cleaned up {orphaned_count} orphaned image files", "SUCCESS")
        else:
            print_status("No orphaned image files found", "SUCCESS")
    except Exception as e:
        print_status(f"Error cleaning up orphaned images: {e}", "ERROR")
def optimize_database():
    print_header("OPTIMIZING DATABASE")
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
        cursor.execute("ANALYZE TABLE jail_records")
        print_status("Analyzed table statistics", "SUCCESS")
        cursor.execute("OPTIMIZE TABLE jail_records")
        print_status("Optimized table structure", "SUCCESS")
        try:
            cursor.execute("CREATE INDEX idx_source_pdf ON jail_records(source_pdf)")
            print_status("Added source_pdf index", "SUCCESS")
        except:
            print_status("source_pdf index already exists", "SUCCESS")
        conn.close()
        print_status("Database optimization complete", "SUCCESS")
    except Exception as e:
        print_status(f"Error optimizing database: {e}", "ERROR")
def show_status():
    print_header("SYSTEM STATUS REPORT")
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
        cursor.execute("SELECT COUNT(DISTINCT source_pdf) FROM jail_records")
        unique_pdfs = cursor.fetchone()[0]
        cursor.execute("SELECT MIN(booking_date), MAX(booking_date) FROM jail_records")
        date_range = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) FROM jail_records WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
        recent_records = cursor.fetchone()[0]
        cursor.execute("SELECT gender, COUNT(*) FROM jail_records GROUP BY gender")
        gender_dist = cursor.fetchall()
        conn.close()
        print(f"📊 DATABASE STATISTICS")
        print(f"   Total Records: {total_records:,}")
        print(f"   Records with Images: {records_with_images:,}")
        print(f"   Image Coverage: {(records_with_images/total_records*100):.1f}%")
        print(f"   Unique PDFs Processed: {unique_pdfs}")
        print(f"   Date Range: {date_range[0]} to {date_range[1]}" if date_range[0] else "   Date Range: No dates")
        print(f"   Recent Records (7 days): {recent_records}")
        print(f"\n👥 GENDER DISTRIBUTION")
        for gender, count in gender_dist:
            if gender:
                print(f"   {gender}: {count:,}")
        image_files = 0
        images_size_mb = 0
        if os.path.exists(IMAGES_DIR):
            image_files = len([f for f in os.listdir(IMAGES_DIR) if f.endswith('.png')])
            total_size = sum(os.path.getsize(os.path.join(IMAGES_DIR, f)) 
                           for f in os.listdir(IMAGES_DIR) if f.endswith('.png'))
            images_size_mb = round(total_size / (1024 * 1024), 2)
        new_pdfs = len([f for f in os.listdir(SRC) if f.endswith('.pdf')]) if os.path.exists(SRC) else 0
        archived_pdfs = len([f for f in os.listdir(DST) if f.endswith('.pdf')]) if os.path.exists(DST) else 0
        print(f"\n📁 FILE SYSTEM STATISTICS")
        print(f"   Image Files: {image_files:,}")
        print(f"   Images Size: {images_size_mb} MB")
        print(f"   New PDFs (pending): {new_pdfs}")
        print(f"   Archived PDFs: {archived_pdfs}")
        print(f"\n🔍 HEALTH CHECK")
        if image_files > records_with_images:
            orphaned = image_files - records_with_images
            print(f"   ⚠️  {orphaned} orphaned image files detected")
        else:
            print(f"   ✅ No orphaned image files")
        if new_pdfs > 0:
            print(f"   📄 {new_pdfs} PDFs pending processing")
        else:
            print(f"   ✅ No pending PDFs")
        if recent_records > 0:
            print(f"   🔄 {recent_records} records added in last 7 days")
        else:
            print(f"   ⚠️  No recent activity")
    except Exception as e:
        print_status(f"Error getting status: {e}", "ERROR")
def show_help():
    print(__doc__)
def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "run"
    print_header("GJ MUGSHOTS DATA PROCESSING SYSTEM")
    print(f"Command: {command}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    if command == "gather":
        ensure_directories()
        gather_pdfs()
    elif command == "parse":
        ensure_directories()
        if not test_database_connection():
            return
        parse_pdfs()
    elif command == "run":
        ensure_directories()
        if not test_database_connection():
            return
        gather_pdfs()
        parse_pdfs()
        cleanup_orphaned_images()
        optimize_database()
    elif command == "cleanup":
        cleanup_orphaned_images()
        optimize_database()
    elif command == "status":
        show_status()
    elif command == "test":
        test_database_connection()
    elif command == "help":
        show_help()
    else:
        print_status(f"Unknown command: {command}", "ERROR")
        show_help()
if __name__ == "__main__":
    main()