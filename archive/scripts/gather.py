#!/usr/bin/env python3
"""
GJ MugShots Data Gatherer
Downloads new jail records PDFs from the Mesa County Sheriff's Office
"""

import os
import requests
import time
from datetime import datetime, timedelta
import re

# Configuration
BASE_URL = "https://www.mesacounty.us/sheriff/jail-records/"
DOWNLOAD_DIR = "new"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

def ensure_download_directory():
    """Create download directory if it doesn't exist"""
    if not os.path.exists(DOWNLOAD_DIR):
        os.makedirs(DOWNLOAD_DIR)
        print(f"Created directory: {DOWNLOAD_DIR}")

def get_pdf_links():
    """Fetch PDF links from the Mesa County Sheriff's website"""
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
        
        # Look for PDF links in the page content
        pdf_pattern = r'href="([^"]*\.pdf[^"]*)"'
        pdf_links = re.findall(pdf_pattern, response.text, re.IGNORECASE)
        
        # Convert relative URLs to absolute URLs
        absolute_links = []
        for link in pdf_links:
            if link.startswith('http'):
                absolute_links.append(link)
            elif link.startswith('/'):
                absolute_links.append(f"https://www.mesacounty.us{link}")
            else:
                absolute_links.append(f"{BASE_URL}{link}")
        
        return absolute_links
        
    except Exception as e:
        print(f"Error fetching PDF links: {e}")
        return []

def download_pdf(url, filename):
    """Download a PDF file"""
    try:
        headers = {
            'User-Agent': USER_AGENT,
            'Accept': 'application/pdf,application/octet-stream,*/*',
        }
        
        response = requests.get(url, headers=headers, timeout=60, stream=True)
        response.raise_for_status()
        
        filepath = os.path.join(DOWNLOAD_DIR, filename)
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        print(f"Downloaded: {filename}")
        return True
        
    except Exception as e:
        print(f"Error downloading {filename}: {e}")
        return False

def is_recent_pdf(filename):
    """Check if PDF is from recent days (last 7 days)"""
    try:
        # Extract date from filename patterns like:
        # "Mesa County Jail Records (3) 2025-08-28.pdf"
        # "Jail Records 2025-09-07.pdf"
        date_pattern = r'(\d{4}-\d{2}-\d{2})'
        match = re.search(date_pattern, filename)
        
        if match:
            pdf_date = datetime.strptime(match.group(1), '%Y-%m-%d')
            cutoff_date = datetime.now() - timedelta(days=7)
            return pdf_date >= cutoff_date
        
        return True  # If no date found, assume it's recent
        
    except Exception:
        return True  # If parsing fails, assume it's recent

def clean_filename(filename):
    """Clean filename for safe filesystem storage"""
    # Remove or replace problematic characters
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    filename = filename.strip()
    
    # Ensure it ends with .pdf
    if not filename.lower().endswith('.pdf'):
        filename += '.pdf'
    
    return filename

def main():
    """Main function to gather new PDFs"""
    print("=== GJ MugShots Data Gatherer ===")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    ensure_download_directory()
    
    # Get list of PDF links
    print("Fetching PDF links...")
    pdf_links = get_pdf_links()
    
    if not pdf_links:
        print("No PDF links found")
        return
    
    print(f"Found {len(pdf_links)} PDF links")
    
    # Download new PDFs
    downloaded_count = 0
    skipped_count = 0
    
    for url in pdf_links:
        # Extract filename from URL
        filename = os.path.basename(url.split('?')[0])  # Remove query parameters
        filename = clean_filename(filename)
        
        # Check if file already exists
        filepath = os.path.join(DOWNLOAD_DIR, filename)
        if os.path.exists(filepath):
            print(f"Skipping existing file: {filename}")
            skipped_count += 1
            continue
        
        # Check if it's a recent PDF
        if not is_recent_pdf(filename):
            print(f"Skipping old PDF: {filename}")
            skipped_count += 1
            continue
        
        # Download the PDF
        if download_pdf(url, filename):
            downloaded_count += 1
            time.sleep(1)  # Be respectful to the server
    
    print(f"\n=== Download Summary ===")
    print(f"Downloaded: {downloaded_count}")
    print(f"Skipped: {skipped_count}")
    print(f"Total processed: {downloaded_count + skipped_count}")
    
    if downloaded_count > 0:
        print(f"\nNew PDFs are ready for processing in the '{DOWNLOAD_DIR}' directory")

if __name__ == "__main__":
    main()
