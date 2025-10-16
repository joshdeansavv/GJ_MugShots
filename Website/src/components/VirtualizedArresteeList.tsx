import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arrestee } from '../types';
import { ArresteeCard } from './ArresteeCard';

interface VirtualizedArresteeListProps {
  arrestees: Arrestee[];
  onViewArrestee: (id: number) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  containerHeight?: number; // Height of the container in pixels
  itemHeight?: number; // Estimated height per item
  overscan?: number; // Number of items to render outside of visible area
}

interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

/**
 * Virtualized list component that only renders visible items for better performance
 * with large datasets. Uses intersection observer for load-more functionality.
 */
export function VirtualizedArresteeList({
  arrestees,
  onViewArrestee,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  containerHeight = 600,
  itemHeight = 200,
  overscan = 5
}: VirtualizedArresteeListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerActualHeight, setContainerActualHeight] = useState(containerHeight);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Calculate visible range based on scroll position
  const visibleRange = useMemo((): VisibleRange => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      arrestees.length - 1,
      Math.ceil((scrollTop + containerActualHeight) / itemHeight) + overscan
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, containerActualHeight, itemHeight, overscan, arrestees.length]);

  // Calculate total height for scrollbar
  const totalHeight = arrestees.length * itemHeight;

  // Get visible items
  const visibleItems = useMemo(() => {
    const items = [];
    for (let i = visibleRange.startIndex; i <= visibleRange.endIndex; i++) {
      if (arrestees[i]) {
        items.push({
          arrestee: arrestees[i],
          top: i * itemHeight
        });
      }
    }
    return items;
  }, [visibleRange, arrestees, itemHeight]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
  }, []);

  // Update container height when it changes
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight;
        setContainerActualHeight(height);
      }
    };

    updateHeight();
    
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Set up intersection observer for load more
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { 
        root: containerRef.current,
        threshold: 0.1,
        rootMargin: '100px'
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore, arrestees.length]);

  if (arrestees.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Results Found</h3>
          <p className="text-zinc-500">
            Try adjusting your search criteria or clearing some filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative overflow-auto border border-zinc-800 rounded-lg"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      {/* Total height container for proper scrollbar */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible items */}
        <div className="space-y-4 p-4">
          {visibleItems.map(({ arrestee, top }) => (
            <div
              key={arrestee.id}
              style={{
                position: 'absolute',
                top: top + 16, // Add padding
                left: 16,
                right: 16,
                minHeight: itemHeight - 16 // Account for spacing
              }}
            >
              <ArresteeCard
                arrestee={arrestee}
                onViewDetails={() => onViewArrestee(arrestee.id)}
              />
            </div>
          ))}
        </div>

        {/* Load more trigger */}
        {hasMore && (
          <div
            ref={loadMoreRef}
            style={{
              position: 'absolute',
              top: Math.max(totalHeight - 100, visibleRange.endIndex * itemHeight),
              left: 0,
              right: 0,
              height: 100
            }}
            className="flex items-center justify-center"
          >
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-zinc-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                <span className="text-sm">Loading more...</span>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">
                Scroll for more • {arrestees.length} loaded
              </div>
            )}
          </div>
        )}

        {/* End of results */}
        {!hasMore && arrestees.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: totalHeight,
              left: 0,
              right: 0,
              height: 60
            }}
            className="flex items-center justify-center text-center py-4"
          >
            <div className="text-sm text-zinc-500">
              End of results • {arrestees.length.toLocaleString()} total
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to provide optimized props for VirtualizedArresteeList
 */
export function useVirtualizedListProps(
  baseItemHeight = 200,
  baseContainerHeight = 600
) {
  // Adjust based on screen size
  const itemHeight = useMemo(() => {
    if (typeof window === 'undefined') return baseItemHeight;
    
    // Smaller height on mobile
    if (window.innerWidth < 768) {
      return Math.max(150, baseItemHeight * 0.8);
    }
    
    return baseItemHeight;
  }, [baseItemHeight]);

  const containerHeight = useMemo(() => {
    if (typeof window === 'undefined') return baseContainerHeight;
    
    // Use most of viewport height, but leave room for header/search
    const availableHeight = window.innerHeight - 200;
    return Math.min(baseContainerHeight, Math.max(400, availableHeight));
  }, [baseContainerHeight]);

  return { itemHeight, containerHeight };
}
