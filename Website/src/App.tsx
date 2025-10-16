import { useState, useEffect, useCallback } from 'react';
import { Arrestee } from './types';
import { fetchArrestees, forceRefreshData } from './api';
import { useRouter } from './hooks/useRouter';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { StatisticsPage } from './pages/StatisticsPage';
import { AboutPage } from './pages/AboutPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { WeeklySummary, MonthlySummary } from './SummaryPages';
import { MinimalHeader } from './components/MinimalHeader';

function App() {
  const [arrestees, setArrestees] = useState<Arrestee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { route, navigateToProfile, navigateToHome, navigateToWeeklySummary, navigateToMonthlySummary, navigateToStatistics, navigateToAbout, navigateToTermsOfService, navigateToPrivacyPolicy, navigateBack, getBackText } = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchArrestees();
        setArrestees(data);
      } catch (err) {
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleViewArrestee = useCallback((id: number, fromPage?: string, fromState?: any) => {
    navigateToProfile(id, fromPage, fromState);
  }, [navigateToProfile]);

  const handleRefreshData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const data = await forceRefreshData();
      setArrestees(data);
    } catch (err) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Navigation handler - must be defined before early returns
  const handleNavigation = useCallback((page: string) => {
    switch (page) {
      case 'home':
        navigateToHome();
        break;
      case 'weekly-summary':
        navigateToWeeklySummary();
        break;
      case 'monthly-summary':
        navigateToMonthlySummary();
        break;
      case 'statistics':
        navigateToStatistics();
        break;
      case 'about':
        navigateToAbout();
        break;
      case 'terms-of-service':
        navigateToTermsOfService();
        break;
      case 'privacy-policy':
        navigateToPrivacyPolicy();
        break;
      default:
        navigateToHome();
    }
  }, [navigateToHome, navigateToWeeklySummary, navigateToMonthlySummary, navigateToStatistics, navigateToAbout, navigateToTermsOfService, navigateToPrivacyPolicy]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-zinc-600 border-t-indigo-500 rounded-full mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-zinc-300 mb-2">Loading Data...</h1>
          <p className="text-zinc-500">Please wait while we fetch the latest information.</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-zinc-300 mb-2">Error Loading Data</h1>
          <p className="text-zinc-500 mb-6">{error}</p>
          <button
            onClick={handleRefreshData}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Main app content
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Minimal Header */}
      <MinimalHeader 
        currentPage={route.page}
        onNavigate={handleNavigation}
      />
      
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">

        {/* Main content based on route */}
        {route.page === 'home' && (
          <HomePage
            arrestees={arrestees}
            onViewArrestee={handleViewArrestee}
            onRefresh={handleRefreshData}
            isRefreshing={isRefreshing}
          />
        )}
        
        {route.page === 'profile' && (() => {
          const arrestee = arrestees.find(a => a.id === route.id);
          return arrestee ? (
            <ProfilePage
              arrestee={arrestee}
              allArrestees={arrestees}
              onBack={navigateBack}
              backText={getBackText()}
            />
          ) : (
            <div className="text-center py-10">
              <div className="text-6xl mb-4">❌</div>
              <h1 className="text-2xl font-bold text-zinc-300 mb-2">Arrestee Not Found</h1>
              <p className="text-zinc-500 mb-6">The requested arrestee could not be found.</p>
              <button
                onClick={() => navigateToHome()}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Back to Home
              </button>
            </div>
          );
        })()}
        
        {route.page === 'weekly-summary' && (
          <WeeklySummary
            data={arrestees}
            onOpenProfile={handleViewArrestee}
          />
        )}
        
        {route.page === 'monthly-summary' && (
          <MonthlySummary
            data={arrestees}
            onOpenProfile={handleViewArrestee}
          />
        )}
        
        {route.page === 'statistics' && (
          <StatisticsPage
            arrestees={arrestees}
          />
        )}

        {route.page === 'about' && (
          <AboutPage />
        )}

        {route.page === 'terms-of-service' && (
          <TermsOfServicePage />
        )}

        {route.page === 'privacy-policy' && (
          <PrivacyPolicyPage />
        )}

      </div>
    </div>
  );
}

export default App;
