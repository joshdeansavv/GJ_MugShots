import { useState } from 'react';

interface MinimalHeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function MinimalHeader({ currentPage, onNavigate }: MinimalHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    { id: 'home', label: 'Home' },
    { id: 'weekly-summary', label: 'Weekly' },
    { id: 'monthly-summary', label: 'Monthly' },
    { id: 'statistics', label: 'Statistics' },
    { id: 'about', label: 'About' },
  ];

  const handleNavigation = (pageId: string) => {
    onNavigate(pageId);
    setIsMobileMenuOpen(false); // Close mobile menu after navigation
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 sticky top-0 z-50 safe-pt">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 sm:h-18">
          
          {/* Logo/Brand */}
          <div className="flex items-center">
            <button
              onClick={() => handleNavigation('home')}
              className="flex items-center hover:opacity-80 transition-opacity touch-manipulation"
              aria-label="Go to home page"
            >
              <h1 className="text-base sm:text-lg lg:text-xl font-bold text-white">GJ Mugshots</h1>
            </button>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-2">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] ${
                  currentPage === item.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
                aria-current={currentPage === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden flex items-center justify-center w-11 h-11 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm safe-pb">
          <nav className="px-3 sm:px-4 py-2 space-y-1">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                className={`w-full text-left px-4 py-3.5 rounded-lg text-base font-medium transition-all min-h-[48px] ${
                  currentPage === item.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
                aria-current={currentPage === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
