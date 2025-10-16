export interface Arrest {
  id: string;
  bookingDate: string; // ISO date
  bookingTime?: string; // "HH:mm:ss" or human string
  arrestingOfficer?: string;
  charges: string[]; // full strings as parsed from PDFs
  mugshotPath: string | null; // e.g. "/images/ALLEN_STEVEN_MIKEL_20250910.jpg" (with fallback for homepage)
  originalMugshotPath?: string | null; // The original image from this specific arrest (for profile page)
  sourcePdf?: string | null; // e.g. "Mesa County Jail Records (3) 2025-06-01.pdf"
  address?: string | null; // Address at time of this arrest
}

export interface AddressHistory {
  address: string;
  bookingDate: string; // ISO date when this address was used
  bookingTime?: string; // Time of booking
}

export interface Arrestee {
  id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  gender?: "MALE" | "FEMALE" | "NON-BINARY" | "OTHER" | "UNKNOWN";
  date_of_birth?: string | null; // ISO date
  address?: string | null; // Kept for backwards compatibility
  addresses?: AddressHistory[]; // All unique addresses (most recent first)
  arrests: Arrest[]; // most-recent first
  totalAppearances?: number; // How many times this person appears in the dataset
}

export interface SearchFilters {
  qFirst: string;
  qMiddle: string;
  qLast: string;
  address: string;
  charges: string; // Fuzzy charge search
  gender: "ALL" | "MALE" | "FEMALE" | "NON-BINARY" | "OTHER" | "UNKNOWN";
  ageMin?: number;
  ageMax?: number;
  dob?: string; // YYYY-MM-DD format
  booking?: string; // YYYY-MM-DD format
}

export type RouteState =
  | { page: "home" }
  | { page: "profile"; id: number }
  | { page: "weekly-summary" }
  | { page: "monthly-summary" }
  | { page: "statistics" }
  | { page: "about" }
  | { page: "terms-of-service" }
  | { page: "privacy-policy" };
