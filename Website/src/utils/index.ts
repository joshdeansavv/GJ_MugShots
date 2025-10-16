import { Arrestee } from '../types';

// Date formatting
const formatter = new Intl.DateTimeFormat(undefined, { 
  year: 'numeric', 
  month: 'long', 
  day: '2-digit' 
});

export function formatDate(dateString: string): string {
  try { 
    return formatter.format(new Date(dateString)); 
  } catch { 
    return dateString; 
  }
}

// Time formatting - convert to 12-hour format with AM/PM
export function formatTime(timeString: string): string {
  try {
    // Handle different time formats that might come from the database
    let time: Date;
    
    // If it's just HH:mm:ss or HH:mm format, create a date for today
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeString)) {
      const [hours, minutes] = timeString.split(':');
      time = new Date();
      time.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    } else {
      // Try to parse as a full date/time
      time = new Date(timeString);
    }
    
    if (isNaN(time.getTime())) {
      return timeString; // Return original if parsing fails
    }
    
    // Format as 12-hour time with AM/PM
    return time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return timeString; // Return original if any error occurs
  }
}

// Age calculation
export function ageFromDOB(dob?: string | null): number | undefined {
  if (!dob) return undefined;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return undefined;
  
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// Name formatting
export function fullName(arrestee: Pick<Arrestee, 'first_name' | 'middle_name' | 'last_name'>): string {
  return [arrestee.first_name, arrestee.middle_name, arrestee.last_name]
    .filter(Boolean)
    .join(' ');
}

// Charge deduplication
export function dedupeCharges(charges: string[], maxCount = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const charge of charges) {
    const normalizedCharge = charge.replace(/\s+/g, ' ').trim().toUpperCase();
    
    if (!seen.has(normalizedCharge)) {
      seen.add(normalizedCharge);
      result.push(charge.trim());
      
      if (result.length === maxCount) break;
    }
  }
  
  return result;
}

// Text normalization for search
export function normalizeText(text: string): string {
  return text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Google Maps link generation
export function createGoogleMapsLink(address: string): string | null {
  if (!address || address.trim() === '' || address.toLowerCase().includes('homeless')) {
    return null;
  }
  
  // Clean up the address for URL encoding
  const cleanAddress = address.trim().replace(/\s+/g, ' ');
  
  // Encode the address for URL
  const encodedAddress = encodeURIComponent(cleanAddress);
  
  // Return Google Maps search URL
  return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
}

// Check if address should be linked (not homeless/empty)
export function isAddressLinkable(address?: string | null): boolean {
  if (!address || address.trim() === '') return false;
  const lowerAddress = address.toLowerCase();
  return !lowerAddress.includes('homeless') && !lowerAddress.includes('unknown');
}

// Get combined date and time for accurate sorting
export function getBookingDateTime(bookingDate: string, bookingTime?: string): number {
  try {
    const date = new Date(bookingDate);
    if (isNaN(date.getTime())) return 0;
    
    // If we have a separate time, combine it with the date
    if (bookingTime) {
      const timeMatch = bookingTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeMatch) {
        const [, hours, minutes, seconds = '0'] = timeMatch;
        date.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10), 0);
      }
    }
    
    return date.getTime();
  } catch {
    return 0;
  }
}
