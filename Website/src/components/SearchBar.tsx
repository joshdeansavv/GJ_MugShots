import React, { useState } from 'react';
import { SearchFilters } from '../types';

interface SearchBarProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  resultCount: number;
  onLoadMore?: () => void;
  showLoadMore?: boolean;
  onResetAll?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function SearchBar({ 
  filters, 
  onFiltersChange, 
  resultCount, 
  onLoadMore, 
  showLoadMore = false,
  onResetAll,
  onRefresh,
  isRefreshing = false
}: SearchBarProps) {
  const handleInputChange = (field: keyof SearchFilters) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      [field]: value
    });
  };

  const handleReset = () => {
    onFiltersChange({
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
    setShowAdvanced(false);
    onResetAll && onResetAll();
  };

  const hasFilters = filters.qFirst || filters.qMiddle || filters.qLast || filters.address || filters.charges || filters.gender !== 'ALL' || filters.ageMin !== undefined || filters.ageMax !== undefined || filters.dob !== undefined || filters.booking !== undefined;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const basicFilters = filters.qFirst || filters.qMiddle || filters.qLast || filters.address || filters.charges;
  const advancedFilters = filters.gender !== 'ALL' || filters.ageMin !== undefined || filters.ageMax !== undefined || filters.dob !== undefined || filters.booking !== undefined;

  return (
    <section className="card p-4 sm:p-5 lg:p-6 shadow-lg animate-fade-in max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      {/* Basic Search */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <input
            type="text"
            value={filters.qFirst}
            onChange={handleInputChange('qFirst')}
            placeholder="First name"
            className="input-field text-base sm:text-sm"
          />
          <input
            type="text"
            value={filters.qMiddle}
            onChange={handleInputChange('qMiddle')}
            placeholder="Middle name"
            className="input-field text-base sm:text-sm"
          />
          <input
            type="text"
            value={filters.qLast}
            onChange={handleInputChange('qLast')}
            placeholder="Last name"
            className="input-field text-base sm:text-sm"
          />
          <input
            type="text"
            value={filters.address}
            onChange={handleInputChange('address')}
            placeholder="Address"
            className="input-field text-base sm:text-sm"
          />
        </div>
        
        {/* Charge Search - Full Width */}
        <div className="relative">
          <input
            type="text"
            value={filters.charges}
            onChange={handleInputChange('charges')}
            placeholder="Search charges (e.g., drunk, DUI, murder, theft, drugs, assault)..."
            className="input-field text-base sm:text-sm pr-10"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {filters.charges && (
            <p className="text-xs text-zinc-400 mt-1 italic">Fuzzy search active: includes synonyms and related charges</p>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="btn-secondary flex-1 touch-target min-h-[48px] text-base sm:text-sm"
          >
            <svg className="h-5 w-5 mr-2 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
            </svg>
            <span className="hidden sm:inline">Advanced</span>
            <span className="sm:hidden">Advanced Filters</span>
          </button>
          {hasFilters && (
            <button
              onClick={handleReset}
              className="btn-secondary touch-target min-h-[48px] text-base sm:text-sm px-6"
            >
              <svg className="h-5 w-5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="ml-2 sm:hidden">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Search */}
      {showAdvanced && (
        <div className="mt-5 sm:mt-6 p-4 sm:p-5 bg-zinc-900/50 rounded-lg border border-zinc-800">
          <h3 className="text-base sm:text-lg font-semibold text-zinc-300 mb-5">Advanced Filters</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Gender</label>
              <select
                value={filters.gender}
                onChange={handleInputChange('gender')}
                className="input-field text-base sm:text-sm w-full"
              >
                <option value="ALL">All Genders</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="NON-BINARY">Non-Binary</option>
                <option value="OTHER">Other</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Min Age</label>
              <input
                type="number"
                value={filters.ageMin || ''}
                onChange={(e) => onFiltersChange({
                  ...filters,
                  ageMin: e.target.value ? parseInt(e.target.value) : undefined
                })}
                placeholder="Min age"
                min="0"
                max="120"
                className="input-field text-base sm:text-sm w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Max Age</label>
              <input
                type="number"
                value={filters.ageMax || ''}
                onChange={(e) => onFiltersChange({
                  ...filters,
                  ageMax: e.target.value ? parseInt(e.target.value) : undefined
                })}
                placeholder="Max age"
                min="0"
                max="120"
                className="input-field text-base sm:text-sm w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Date of Birth</label>
              <input
                type="date"
                value={filters.dob || ''}
                onChange={(e) => onFiltersChange({
                  ...filters,
                  dob: e.target.value || undefined
                })}
                className="input-field text-base sm:text-sm w-full"
                title="Date of birth"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Booking Date</label>
              <input
                type="date"
                value={filters.booking || ''}
                onChange={(e) => onFiltersChange({
                  ...filters,
                  booking: e.target.value || undefined
                })}
                className="input-field text-base sm:text-sm w-full"
                title="Booking date"
              />
            </div>

            {/* Refresh Button in Advanced Section */}
            {onRefresh && (
              <div className="sm:col-span-2 lg:col-span-3 pt-4 border-t border-zinc-800">
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-sm"
                >
                  {isRefreshing ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-zinc-600 border-t-indigo-500 rounded-full" />
                      <span>Refreshing Data...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh Data</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs sm:text-sm text-zinc-400">
          {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
          {(basicFilters || advancedFilters) && (
            <span className="ml-2 inline-flex items-center rounded-full bg-indigo-900/50 px-2 py-1 text-xs text-indigo-300">
              Filtered
            </span>
          )}
        </div>
        
        {showLoadMore && onLoadMore && (
          <button
            onClick={onLoadMore}
            className="btn-primary text-xs sm:text-sm"
          >
            Load More
          </button>
        )}
      </div>
    </section>
  );
}
