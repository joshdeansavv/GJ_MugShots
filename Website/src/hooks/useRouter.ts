import { useState, useEffect } from 'react';
import { RouteState } from '../types';

interface NavigationState {
  page: string;
  filters?: any;
  visible?: number;
  scrollY?: number;
}

const NAVIGATION_KEY = 'gj-mugshots-navigation';

export function useRouter() {
  const [route, setRoute] = useState<RouteState>({ page: 'home' });
  const [previousPage, setPreviousPage] = useState<string>('home');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      
      // Store current page as previous before changing
      setRoute(currentRoute => {
        setPreviousPage(currentRoute.page);
        
        if (!hash) {
          return { page: 'home' };
        }

        const parts = hash.split('/');
        
        if (parts[0] === 'profile' && parts[1]) {
          const id = Number(parts[1]);
          if (!Number.isNaN(id)) {
            return { page: 'profile', id };
          }
        }

        if (parts[0] === 'weekly-summary') {
          return { page: 'weekly-summary' };
        }

        if (parts[0] === 'monthly-summary') {
          return { page: 'monthly-summary' };
        }

        if (parts[0] === 'statistics') {
          return { page: 'statistics' };
        }

        if (parts[0] === 'about') {
          return { page: 'about' };
        }

        if (parts[0] === 'terms-of-service') {
          return { page: 'terms-of-service' };
        }

        if (parts[0] === 'privacy-policy') {
          return { page: 'privacy-policy' };
        }

        // If route is invalid, redirect to home
        window.location.hash = '#/';
        return { page: 'home' };
      });
    };

    // Handle initial load
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Save current page state to sessionStorage
  const saveCurrentState = (page: string, additionalState?: any) => {
    try {
      const currentState: NavigationState = {
        page,
        ...additionalState
      };
      sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify(currentState));
    } catch (error) {
      // Silently handle storage errors
    }
  };

  // Get saved state from sessionStorage
  const getSavedState = (): NavigationState | null => {
    try {
      const saved = sessionStorage.getItem(NAVIGATION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      return null;
    }
  };

  // Clear saved state
  const clearSavedState = () => {
    try {
      sessionStorage.removeItem(NAVIGATION_KEY);
    } catch (error) {
      // Silently handle storage errors
    }
  };

  const navigateToProfile = (id: number, fromPage?: string, fromState?: any) => {
    if (fromPage && fromState) {
      saveCurrentState(fromPage, fromState);
    }
    window.location.hash = `#/profile/${id}`;
  };

  const navigateToHome = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/';
  };

  const navigateToWeeklySummary = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/weekly-summary';
  };

  const navigateToMonthlySummary = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/monthly-summary';
  };

  const navigateToStatistics = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/statistics';
  };

  const navigateToAbout = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/about';
  };

  const navigateToTermsOfService = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/terms-of-service';
  };

  const navigateToPrivacyPolicy = (preserveState = false) => {
    if (!preserveState) {
      clearSavedState();
    }
    window.location.hash = '#/privacy-policy';
  };

  const navigateBack = () => {
    const savedState = getSavedState();
    
    if (savedState) {
      // Restore the saved state
      if (savedState.page === 'home') {
        // Merge the saved state into HomeP
        // age's sessionStorage BEFORE navigating
        try {
          const homeState = {
            filters: savedState.filters || {},
            visible: savedState.visible || 40,
            scrollY: savedState.scrollY || 0
          };
          sessionStorage.setItem('homeSearchState', JSON.stringify(homeState));
          
          // Clear the navigation state after using it
          clearSavedState();
        } catch (error) {
          // Silently handle restore errors
        }
        navigateToHome(true);
      } else if (savedState.page === 'weekly-summary') {
        navigateToWeeklySummary(true);
        // Restore scroll position for summary pages
        if (savedState.scrollY) {
          setTimeout(() => {
            window.scrollTo(0, savedState.scrollY || 0);
          }, 100);
        }
        clearSavedState();
      } else if (savedState.page === 'monthly-summary') {
        navigateToMonthlySummary(true);
        // Restore scroll position for summary pages
        if (savedState.scrollY) {
          setTimeout(() => {
            window.scrollTo(0, savedState.scrollY || 0);
          }, 100);
        }
        clearSavedState();
      } else if (savedState.page === 'statistics') {
        navigateToStatistics(true);
        // Restore scroll position for statistics page
        if (savedState.scrollY) {
          setTimeout(() => {
            window.scrollTo(0, savedState.scrollY || 0);
          }, 100);
        }
        clearSavedState();
      } else {
        navigateToHome(true);
        clearSavedState();
      }
    } else {
    // Fallback to previous page logic
    if (previousPage === 'weekly-summary') {
      navigateToWeeklySummary();
    } else if (previousPage === 'monthly-summary') {
      navigateToMonthlySummary();
    } else if (previousPage === 'statistics') {
      navigateToStatistics();
    } else {
      navigateToHome();
    }
    }
  };

  const getBackText = () => {
    const savedState = getSavedState();
    if (savedState) {
      if (savedState.page === 'weekly-summary') {
        return 'Back to Weekly Summary';
      } else if (savedState.page === 'monthly-summary') {
        return 'Back to Monthly Summary';
      } else if (savedState.page === 'statistics') {
        return 'Back to Statistics';
      } else {
        return 'Back to Home';
      }
    }
    
    // Fallback to previous page
    if (previousPage === 'weekly-summary') {
      return 'Back to Weekly Summary';
    } else if (previousPage === 'monthly-summary') {
      return 'Back to Monthly Summary';
    } else if (previousPage === 'statistics') {
      return 'Back to Statistics';
    } else {
      return 'Back to Home';
    }
  };

  return {
    route,
    previousPage,
    navigateToProfile,
    navigateToHome,
    navigateToWeeklySummary,
    navigateToMonthlySummary,
    navigateToStatistics,
    navigateToAbout,
    navigateToTermsOfService,
    navigateToPrivacyPolicy,
    navigateBack,
    getBackText,
    saveCurrentState,
    getSavedState
  };
}
