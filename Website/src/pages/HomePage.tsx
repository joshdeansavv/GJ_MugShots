import { useState, useEffect, useMemo, useCallback } from 'react';
import { Arrestee, SearchFilters } from '../types';
import { SearchBar } from '../components/SearchBar';
import { ArresteeCard } from '../components/ArresteeCard';
import { useDebounce } from '../hooks/useDebounce';
import { getBookingDateTime } from '../utils';

interface HomePageProps {
  arrestees: Arrestee[];
  onViewArrestee: (id: number, fromPage?: string, fromState?: any) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

// Charge synonym mapping (outside component for performance)
const CHARGE_SYNONYMS: Record<string, string[]> = {
  'drunk': ['dui', 'dwai', 'drove', 'under the influence', 'intoxicated', 'alcohol'],
  'dui': ['dui', 'dwai', 'drove', 'under the influence', 'drunk'],
  'drugs': ['drug', 'controlled substance', 'paraphernalia', 'possession', 'narcotic', 'methamphetamine', 'cocaine', 'marijuana', 'fentanyl'],
  'murder': ['murder', 'homicide', 'manslaughter', 'killing'],
  'assault': ['assault', 'battery', 'domestic violence', 'strike', 'shove', 'kick', 'menacing'],
  'theft': ['theft', 'steal', 'robbery', 'burglary', 'larceny', 'shoplifting'],
  'burglary': ['burglary', 'breaking', 'entering', 'trespass'],
  'warrant': ['warrant', 'failure to appear', 'fugitive'],
  'violation': ['violation', 'probation', 'parole', 'protection order', 'restraining'],
  'domestic': ['domestic', 'violence', 'dv'],
  'driving': ['driving', 'vehicle', 'traffic', 'license', 'restraint', 'suspended'],
  'weapon': ['weapon', 'firearm', 'gun', 'knife', 'menacing'],
  'fraud': ['fraud', 'forgery', 'identity', 'credit card', 'deception'],
  'child': ['child', 'minor', 'juvenile', 'abuse', 'endangerment'],
  'trespass': ['trespass', 'criminal trespass', 'unlawful entry'],
  'harassment': ['harassment', 'stalking', 'threats', 'intimidation'],
  'resisting': ['resisting', 'obstruct', 'eluding', 'fleeing'],
};

// Fuzzy charge matching function (outside component for performance)
const matchesChargeQuery = (arresteeCharges: string[], query: string): boolean => {
  if (!query) return true;
  
  const normalizedQuery = query.toLowerCase().trim();
  
  // Get expanded search terms (original + synonyms)
  const searchTerms = [normalizedQuery];
  if (CHARGE_SYNONYMS[normalizedQuery]) {
    searchTerms.push(...CHARGE_SYNONYMS[normalizedQuery]);
  }
  
  // Check if any charge contains any of the search terms
  return arresteeCharges.some(charge => {
    const normalizedCharge = charge.toLowerCase();
    return searchTerms.some(term => normalizedCharge.includes(term));
  });
};

export function HomePage({ arrestees, onViewArrestee, onRefresh, isRefreshing = false }: HomePageProps) {
  // Search filters
  const [filters, setFilters] = useState<SearchFilters>({
    qFirst: '',
    qMiddle: '',
    qLast: '',
    address: '',
    charges: '',
    gender: 'ALL',
    ageMin: undefined,
    ageMax: undefined,
    dob: undefined,
    booking: undefined
  });

  // Debounced search filters (300ms delay for optimal responsiveness)
  const debouncedFilters = useDebounce(filters, 300);

  // Render state
  const [visible, setVisible] = useState(40);
  const [isSearching, setIsSearching] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hasRestored, setHasRestored] = useState(false);
  const PERSIST_KEY = 'homeSearchState';

  // Data guards - ensure data is always an array
  const safeArrestees = useMemo(() => {
    if (!Array.isArray(arrestees)) return [];
    return arrestees.map(arrestee => ({
      ...arrestee,
      arrests: Array.isArray(arrestee.arrests) ? arrestee.arrests.map(arrest => ({
        ...arrest,
        charges: Array.isArray(arrest.charges) ? arrest.charges : []
      })) : []
    }));
  }, [arrestees]);

  // Calculate age helper - defined before use to avoid TDZ errors
  const calculateAge = useCallback((dateOfBirth: string): number | null => {
    try {
      const birthDate = new Date(dateOfBirth);
      if (isNaN(birthDate.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  }, []);

  // Precompute ages and total appearances once per data load
  const arresteesWithAges = useMemo(() => {
    // Count how many times each person (by name) appears in the dataset
    const nameCounts = new Map<string, number>();
    
    safeArrestees.forEach(arrestee => {
      const fullName = `${arrestee.first_name} ${arrestee.middle_name || ''} ${arrestee.last_name}`.trim().replace(/\s+/g, ' ');
      nameCounts.set(fullName, (nameCounts.get(fullName) || 0) + 1);
    });

    return safeArrestees.map(arrestee => {
      const fullName = `${arrestee.first_name} ${arrestee.middle_name || ''} ${arrestee.last_name}`.trim().replace(/\s+/g, ' ');
      return {
        ...arrestee,
        computedAge: arrestee.date_of_birth ? calculateAge(arrestee.date_of_birth) : null,
        totalAppearances: nameCounts.get(fullName) || 1
      };
    });
  }, [safeArrestees, calculateAge]);

  // Stable memoization by [dataPointer, filterState] - never memoize by individual field states
  const filteredArrestees = useMemo(() => {
    if (!arresteesWithAges.length) return [];

    const { qFirst, qMiddle, qLast, address, charges, gender, ageMin, ageMax, dob, booking } = debouncedFilters;
    
    // If no filters, return all data
    if (!qFirst && !qMiddle && !qLast && !address && !charges && gender === 'ALL' && ageMin === undefined && ageMax === undefined && !dob && !booking) {
      return arresteesWithAges;
    }

    return arresteesWithAges.filter(arrestee => {
      // Early exit optimizations for performance
      // Gender filter first (fastest check) - when gender is "ALL", do not filter by gender at all
      if (gender !== 'ALL' && arrestee.gender !== gender) {
        return false;
      }

      // Age filters - use precomputed age (second fastest)
      if (ageMin !== undefined || ageMax !== undefined) {
        const age = arrestee.computedAge;
        if (age === null) return false; // Exclude records with missing DOB when age filters are active
        if (ageMin !== undefined && age < ageMin) return false;
        if (ageMax !== undefined && age > ageMax) return false;
      }

      // Date of birth filter - exact match by normalizing stored MM/DD/YYYY to YYYY-MM-DD
      if (dob) {
        const storedDob = arrestee.date_of_birth;
        if (!storedDob) return false;
        let normalized = storedDob;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(storedDob)) {
          const [mm, dd, yyyy] = storedDob.split('/');
          normalized = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
        if (normalized !== dob) return false;
      }

      // Booking date filter - match any arrest with same YYYY-MM-DD date
      if (booking) {
        const hasBooking = (arrestee.arrests || []).some(arrest => {
          const d = new Date(arrest.bookingDate);
          if (isNaN(d.getTime())) return false;
          const iso = d.toISOString().slice(0, 10);
          return iso === booking;
        });
        if (!hasBooking) return false;
      }

      // Charges filter with fuzzy matching
      if (charges) {
        // Collect all charges from all arrests for this person
        const allCharges = arrestee.arrests.flatMap(arrest => arrest.charges || []);
        if (!matchesChargeQuery(allCharges, charges)) {
          return false;
        }
      }
      
      // Name filters last (string operations are more expensive)
      if (qFirst && !arrestee.first_name?.toLowerCase().includes(qFirst.toLowerCase())) {
        return false;
      }
      if (qMiddle && !arrestee.middle_name?.toLowerCase().includes(qMiddle.toLowerCase())) {
        return false;
      }
      if (qLast && !arrestee.last_name?.toLowerCase().includes(qLast.toLowerCase())) {
        return false;
      }
      if (address && !arrestee.address?.toLowerCase().includes(address.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [arresteesWithAges, debouncedFilters]);

  // Sort by most recent booking date + time (descending), then by name as a tiebreaker
  const sortedArrestees = useMemo(() => {
    const mostRecentMs = (arrestee: Arrestee): number => {
      const arrests = Array.isArray(arrestee.arrests) ? arrestee.arrests : [];
      let maxTime = 0;
      for (const arrest of arrests) {
        const t = getBookingDateTime(arrest.bookingDate, arrest.bookingTime);
        if (t > maxTime) maxTime = t;
      }
      return maxTime;
    };

    return [...filteredArrestees].sort((a, b) => {
      const aTime = mostRecentMs(a);
      const bTime = mostRecentMs(b);
      if (aTime !== bTime) return bTime - aTime;

      const nameA = `${a.last_name}, ${a.first_name} ${a.middle_name || ''}`.trim();
      const nameB = `${b.last_name}, ${b.first_name} ${b.middle_name || ''}`.trim();
      return nameA.localeCompare(nameB);
    });
  }, [filteredArrestees]);

  // Render visible items - no artificial limit, show all data
  const visibleArrestees = useMemo(() => {
    return sortedArrestees.slice(0, visible);
  }, [sortedArrestees, visible]);

  // Debounced search effect - pause rendering during filter changes
  useEffect(() => {
    const { qFirst, qMiddle, qLast, address, charges, gender, ageMin, ageMax, dob } = debouncedFilters;
    const hasFilters = qFirst || qMiddle || qLast || address || charges || gender !== 'ALL' || ageMin !== undefined || ageMax !== undefined || dob;
    
    if (hasFilters) {
      setIsSearching(true);
      // Pause infinite scroll and load-more triggers during filtering
      const timer = setTimeout(() => {
        setIsSearching(false);
        // Only reset visible count if we haven't restored state yet
        if (!hasRestored) {
          setVisible(40); // Reset visible count on filter change
        }
      }, 50); // Shorter delay for better responsiveness
      return () => clearTimeout(timer);
    } else {
      setIsSearching(false);
      // Only reset visible count if we haven't restored state yet
      if (!hasRestored) {
        setVisible(40); // Reset visible when no filters
      }
    }
  }, [debouncedFilters, hasRestored]);

  // Intersection Observer for infinite scroll - paused during search
  const observerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isSearching && visible < sortedArrestees.length) {
          // Debounce observer callback by 150ms
          setTimeout(() => {
            setVisible(prev => prev + 40);
          }, 150);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isSearching, visible, sortedArrestees.length]);

  // Load more button handler - paused during search
  const handleLoadMore = useCallback(() => {
    if (!isSearching) {
      setVisible(prev => prev + 40);
    }
  }, [isSearching, visible, sortedArrestees.length]);

  // Filter change handler
  const handleFiltersChange = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters);
  }, []);

  const handleResetAll = useCallback(() => {
    // Reset filters to main state
    setFilters({
      qFirst: '',
      qMiddle: '',
      qLast: '',
      address: '',
      charges: '',
      gender: 'ALL',
      ageMin: undefined,
      ageMax: undefined,
      dob: undefined,
      booking: undefined
    });
    // Reset pagination and UI affordances
    setVisible(40);
    setIsSearching(false);
    setResetKey(prev => prev + 1);
    // Clear persisted state
    try { sessionStorage.removeItem(PERSIST_KEY); } catch {}
    // Scroll to top of the page
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  

  const hasMore = visible < sortedArrestees.length;
  const canLoadMore = hasMore;

  // Restore persisted search state on mount only
  useEffect(() => {
    const restoreState = () => {
      try {
        const raw = sessionStorage.getItem(PERSIST_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { filters: SearchFilters; visible: number; scrollY?: number };
          if (saved && saved.filters) {
            setFilters(saved.filters);
          }
          if (typeof saved?.visible === 'number') {
            setVisible(Math.max(40, saved.visible));
          }
          // Defer scroll restore to next tick to allow DOM to paint
          if (typeof window !== 'undefined' && typeof saved?.scrollY === 'number') {
            setTimeout(() => window.scrollTo(0, saved.scrollY || 0), 50);
          }
        }
      } catch (error) {
        // Silently handle restore errors
      }
    };

    // Restore on mount
    restoreState();
    setHasRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filters and visible when they change (after initial restore)
  useEffect(() => {
    if (!hasRestored) return;
    try {
      const raw = sessionStorage.getItem(PERSIST_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      const payload = {
        ...prev,
        filters,
        visible
      };
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    } catch {}
  }, [filters, visible, hasRestored]);

  // Persist scroll position
  useEffect(() => {
    if (!hasRestored) return;
    const onScroll = () => {
      try {
        const raw = sessionStorage.getItem(PERSIST_KEY);
        const prev = raw ? JSON.parse(raw) : {};
        prev.scrollY = window.scrollY || window.pageYOffset || 0;
        sessionStorage.setItem(PERSIST_KEY, JSON.stringify(prev));
      } catch {}
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hasRestored]);

  return (
    <div className="space-y-4">
      <SearchBar
        key={resetKey}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        resultCount={sortedArrestees.length}
        showLoadMore={false}
        onResetAll={handleResetAll}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Searching indicator */}
      {isSearching && (
        <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm sm:text-base py-2">
          <div className="animate-spin h-4 w-4 border-2 border-zinc-600 border-t-indigo-500 rounded-full" />
          <span>Searching…</span>
        </div>
      )}

      {/* Results */}
      {sortedArrestees.length === 0 && !isSearching ? (
        <div className="text-center py-12 sm:py-16 px-4">
          <div className="text-6xl sm:text-7xl mb-4 sm:mb-6">🔍</div>
          <h3 className="text-xl sm:text-2xl font-semibold text-zinc-300 mb-3">No Results Found</h3>
          <p className="text-zinc-500 text-base sm:text-lg max-w-md mx-auto">Try adjusting your search criteria or clearing some filters.</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-4xl mx-auto">
          {visibleArrestees.map((arrestee) => (
            <ArresteeCard
              key={arrestee.id}
              arrestee={arrestee}
              onViewDetails={() => {
                const currentState = {
                  filters,
                  visible,
                  scrollY: window.scrollY || window.pageYOffset || 0
                };
                onViewArrestee(arrestee.id, 'home', currentState);
              }}
              totalAppearances={arrestee.totalAppearances}
            />
          ))}
        </div>
      )}

      {/* Load more button or sentinel */}
      {canLoadMore && !isSearching && (
        <div className="flex justify-center py-6 px-4">
          <button
            onClick={handleLoadMore}
            className="btn-primary w-full sm:w-auto min-h-[48px] text-base sm:text-sm"
          >
            Load More ({visibleArrestees.length} of {sortedArrestees.length})
          </button>
        </div>
      )}

      {/* Intersection observer sentinel */}
      {hasMore && !canLoadMore && !isSearching && (
        <div ref={observerRef} className="h-4" />
      )}

      {/* End of results */}
      {!hasMore && sortedArrestees.length > 0 && (
        <div className="text-center py-8 px-4">
          <div className="text-sm sm:text-base text-zinc-500">
            End of results • {sortedArrestees.length.toLocaleString()} total
          </div>
        </div>
      )}
    </div>
  );
}