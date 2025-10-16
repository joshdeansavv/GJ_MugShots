import { useMemo } from 'react';
import { Arrestee } from './types';
import { MugshotImage } from './components/MugshotImage';
import { getBookingDateTime } from './utils';

interface SummaryPagesProps {
  data: Arrestee[];
  onOpenProfile: (id: number, fromPage?: string, fromState?: any) => void;
}

interface SummaryPageProps {
  data: Arrestee[];
  mode: 'weekly' | 'monthly';
  onOpenProfile: (id: number, fromPage?: string, fromState?: any) => void;
}

// Data guards - ensure data is always an array
const safeArrestees = (data: Arrestee[]): Arrestee[] => {
  if (!Array.isArray(data)) return [];
  return data.map(arrestee => ({
    ...arrestee,
    arrests: Array.isArray(arrestee.arrests) ? arrestee.arrests.map(arrest => ({
      ...arrest,
      charges: Array.isArray(arrest.charges) ? arrest.charges : []
    })) : []
  }));
};

// Type for flattened arrests with arrestee info
interface FlattenedArrest {
  id: string;
  bookingDate: string;
  bookingTime?: string;
  arrestingOfficer?: string;
  charges: string[];
  mugshotPath: string | null;
  arresteeName: string;
  arresteeId: number;
  arrestee: Arrestee;
  arrestCount: number; // How many times this arrestee appears in the dataset
}

// Memoized flatten function
const flattenArrests = (arrestees: Arrestee[]): FlattenedArrest[] => {
  // Count how many times each person (by name) appears in the dataset
  const nameCounts = new Map<string, number>();
  
  // Group by full name to count appearances
  arrestees.forEach(arrestee => {
    const fullName = `${arrestee.first_name} ${arrestee.middle_name || ''} ${arrestee.last_name}`.trim().replace(/\s+/g, ' ');
    nameCounts.set(fullName, (nameCounts.get(fullName) || 0) + 1);
  });

  return arrestees.flatMap(arrestee => 
    arrestee.arrests.map(arrest => {
      const fullName = `${arrestee.first_name} ${arrestee.middle_name || ''} ${arrestee.last_name}`.trim().replace(/\s+/g, ' ');
      return {
        ...arrest,
        arresteeName: fullName,
        arresteeId: arrestee.id,
        arrestee,
        arrestCount: nameCounts.get(fullName) || 1
      };
    })
  );
};

// Helpers to normalize dates for reliable local-day comparisons
const toLocalStartOfDay = (input: string | Date): Date | null => {
  try {
    if (input instanceof Date) {
      const d = new Date(input);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    }

    const value = String(input);
    // YYYY-MM-DD (treat as local date to avoid UTC shift)
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [y, m, d] = value.slice(0, 10).split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    }
    // MM/DD/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
      const [mm, dd, yyyy] = value.slice(0, 10).split('/').map(Number);
      return new Date(yyyy || 0, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
    }
    // Fallback: let Date parse, then coerce to local start of day
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  } catch {
    return null;
  }
};

// Determine "effective today" based on 10:00 local release time
const getEffectiveTodayStart = (): Date => {
  const now = new Date();
  const effective = new Date(now);
  if (effective.getHours() < 10) {
    effective.setDate(effective.getDate() - 1);
  }
  effective.setHours(0, 0, 0, 0);
  return effective;
};

// Get current month date range
const getMonthlyDateRange = (): Date[] => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // Get first day of current month
  const firstDay = new Date(year, month, 1);
  
  // Get last day of current month
  const lastDay = new Date(year, month + 1, 0);
  
  const dates = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
};

// Filter arrests within date range
const filterArrestsByDateRange = (arrests: FlattenedArrest[], startDate: Date, endDate: Date): FlattenedArrest[] => {
  return arrests.filter(arrest => {
    const arrestDate = new Date(arrest.bookingDate);
    arrestDate.setHours(0, 0, 0, 0);
    return arrestDate >= startDate && arrestDate <= endDate;
  });
};

// Group arrests by local day
const groupArrestsByDay = (arrests: FlattenedArrest[]): { [key: string]: FlattenedArrest[] } => {
  const groups: { [key: string]: FlattenedArrest[] } = {};
  
  arrests.forEach(arrest => {
    const date = toLocalStartOfDay(arrest.bookingDate);
    if (!date) return;
    const dateKey = date.toDateString();
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(arrest);
  });
  
  return groups;
};

// (kept for potential future use)

// Component for clickable mugshot grid
interface MugshotGridProps {
  arrests: FlattenedArrest[];
  onImageClick: (arresteeId: number, fromPage?: string, fromState?: any) => void;
  emptyMessage?: string;
  currentPage?: string;
}

function MugshotGrid({ arrests, onImageClick, emptyMessage = "No mugshots available", currentPage }: MugshotGridProps) {
  // Show ALL arrests - no limits
  const displayedArrests = arrests;

  if (arrests.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <div className="w-12 h-12 mx-auto mb-2 text-zinc-600">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-1">
        {displayedArrests.map((arrest) => (
          <div
            key={`${arrest.arresteeId}-${arrest.id}`}
            className="cursor-pointer group aspect-square relative"
            onClick={() => {
              const currentState = {
                scrollY: window.scrollY || window.pageYOffset || 0
              };
              onImageClick(arrest.arresteeId, currentPage, currentState);
            }}
          >
            <MugshotImage
              src={arrest.mugshotPath}
              alt={`${arrest.arresteeName} mugshot`}
              size="medium"
              className="w-full h-full transition-transform duration-200 group-hover:scale-105 group-hover:ring-2 group-hover:ring-indigo-500"
            />
            {/* Repeat offender badge */}
            {arrest.arrestCount > 1 && (
              <div className="absolute top-1 right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm border border-red-400">
                {arrest.arrestCount}
              </div>
            )}
          </div>
        ))}
      </div>
      
    </div>
  );
}

export function WeeklySummary({ data, onOpenProfile }: SummaryPagesProps) {
  // Data guards and processing
  const safeData = useMemo(() => safeArrestees(data), [data]);
  const flattenedArrests = useMemo(() => flattenArrests(safeData), [safeData]);
  
  // No need to precompute weekly days or arrests when showing most recent 7 days with data

  // Group all arrests by day once (local day), sorted desc
  const dailyGroups = useMemo(() => {
    const groups = groupArrestsByDay(flattenedArrests);
    const entries = Object.entries(groups).sort((a, b) => {
      const da = toLocalStartOfDay(a[0]);
      const db = toLocalStartOfDay(b[0]);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      return tb - ta;
    });
    const sorted: { [key: string]: FlattenedArrest[] } = {};
    for (const [key, arrests] of entries) {
      sorted[key] = arrests.sort((a, b) => getBookingDateTime(b.bookingDate, b.bookingTime) - getBookingDateTime(a.bookingDate, a.bookingTime));
    }
    return sorted;
  }, [flattenedArrests]);

  // Pick most recent 7 days WITH records, anchored by release schedule (10AM local)
  const displayedDayKeys = useMemo(() => {
    const effectiveToday = getEffectiveTodayStart();
    // Build a set of allowed dateKeys for last 7 effective days
    const allowed = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(effectiveToday);
      d.setDate(effectiveToday.getDate() - i);
      allowed.add(d.toDateString());
    }
    // Filter grouped keys to those within allowed window, then take newest first
    return Object.keys(dailyGroups)
      .filter(k => allowed.has(k))
      .slice(0, 7);
  }, [dailyGroups]);
  const displayedDays = useMemo(() => displayedDayKeys.map(k => toLocalStartOfDay(k)!).filter(Boolean) as Date[], [displayedDayKeys]);
  const totalArrests = useMemo(() => displayedDayKeys.reduce((sum, k) => sum + (dailyGroups[k]?.length || 0), 0), [displayedDayKeys, dailyGroups]);

  if (!Array.isArray(data)) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 text-zinc-600">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-zinc-300 mb-2">Invalid Data</h3>
        <p className="text-zinc-500">Unable to display weekly summary. Data format is incorrect.</p>
      </div>
    );
  }

  if (totalArrests === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 text-zinc-600">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Arrests This Week</h3>
        <p className="text-zinc-500">No arrest records found for the last 7 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Weekly Summary</h2>
        <p className="text-zinc-400 text-sm sm:text-base mb-4">
          Last 7 days • {totalArrests} total arrest{totalArrests !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
          <div className="bg-red-500 rounded-full w-3 h-3 shadow-sm border border-red-400"></div>
          <span>= multiple prior records on file</span>
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="space-y-4 sm:space-y-6">
        {displayedDays.map((date) => {
          const dateKey = date.toDateString();
          const dayArrests = dailyGroups[dateKey] || [];
          
          return (
            <div key={dateKey} className="card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-zinc-200 leading-tight">
                    {date.toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric',
                      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                    })}
                  </h3>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                    {dayArrests.length} arrest{dayArrests.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                {date.toDateString() === new Date().toDateString() && (
                  <span className="px-3 py-1 bg-indigo-900/50 text-indigo-300 text-xs font-medium rounded-full ring-1 ring-indigo-700/50 self-start sm:self-auto">
                    Today
                  </span>
                )}
              </div>
              
              <MugshotGrid
                arrests={dayArrests}
                onImageClick={onOpenProfile}
                currentPage="weekly-summary"
              />
              
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthlySummary({ data, onOpenProfile }: SummaryPagesProps) {
  // Data guards and processing
  const safeData = useMemo(() => safeArrestees(data), [data]);
  const flattenedArrests = useMemo(() => flattenArrests(safeData), [safeData]);
  
  // Get current month and filter arrests
  const monthlyDates = useMemo(() => getMonthlyDateRange(), []);
  const monthlyArrests = useMemo(() => {
    if (monthlyDates.length === 0) return [];
    const startDate = monthlyDates[0];
    const endDate = monthlyDates[monthlyDates.length - 1];
    endDate.setHours(23, 59, 59, 999); // Include full last day
    const filtered = filterArrestsByDateRange(flattenedArrests, startDate, endDate);
    // Sort by date AND time (most recent first)
    return filtered.sort((a, b) => getBookingDateTime(b.bookingDate, b.bookingTime) - getBookingDateTime(a.bookingDate, a.bookingTime));
  }, [flattenedArrests, monthlyDates]);


  const currentMonth = new Date().toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });
  const totalArrests = monthlyArrests.length;

  if (!Array.isArray(data)) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 text-zinc-600">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-zinc-300 mb-2">Invalid Data</h3>
        <p className="text-zinc-500">Unable to display monthly summary. Data format is incorrect.</p>
      </div>
    );
  }

  if (totalArrests === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 text-zinc-600">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Arrests This Month</h3>
        <p className="text-zinc-500">No arrest records found for {currentMonth}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Monthly Summary</h2>
        <p className="text-zinc-400 text-sm sm:text-base">
          {currentMonth} • {totalArrests} total arrest{totalArrests !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Main collage */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-zinc-200">All Arrests This Month</h3>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <div className="bg-red-500 rounded-full w-3 h-3 shadow-sm border border-red-400"></div>
            <span>= multiple prior records on file</span>
          </div>
        </div>
        <MugshotGrid
          arrests={monthlyArrests}
          onImageClick={onOpenProfile}
          currentPage="monthly-summary"
        />
      </div>

    </div>
  );
}

// Default component that handles mode switching
export default function SummaryPage({ data, mode, onOpenProfile }: SummaryPageProps) {
  if (mode === 'weekly') {
    return <WeeklySummary data={data} onOpenProfile={onOpenProfile} />;
  } else if (mode === 'monthly') {
    return <MonthlySummary data={data} onOpenProfile={onOpenProfile} />;
  }
  
  // Fallback for invalid mode
  return (
    <div className="card p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 text-zinc-600">
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-zinc-300 mb-2">Invalid Mode</h3>
      <p className="text-zinc-500">Please specify either 'weekly' or 'monthly' mode.</p>
    </div>
  );
}