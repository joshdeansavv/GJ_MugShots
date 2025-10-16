import { useState } from 'react';

interface MugshotImageProps {
  src: string | null;
  alt: string;
  size?: 'small' | 'medium' | 'large' | 'xl' | 'search';
  className?: string;
}

const sizeClasses = {
  small: 'h-16 w-16',
  medium: 'h-24 w-24',
  large: 'h-32 w-32',
  xl: 'h-48 w-48 md:h-64 md:w-64',
  search: 'h-24 w-24 sm:h-24 sm:w-24 md:h-40 md:w-40'
};

export function MugshotImage({ src, alt, size = 'small', className = '' }: MugshotImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setHasError(true);
    setIsLoading(false);
  };

  return (
    <div className={`relative ${sizeClasses[size]} flex-shrink-0 overflow-hidden rounded-xl bg-zinc-800/70 ring-1 ring-zinc-700 ${className}`}>
      {!hasError && src ? (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500"></div>
            </div>
          )}
          <img
            src={src}
            alt={alt}
            className={`h-full w-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            loading="lazy"
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-500">
          <svg viewBox="0 0 24 24" className={`${size === 'xl' ? 'h-16 w-16' : size === 'large' || size === 'search' ? 'h-12 w-12' : 'h-8 w-8'}`} aria-hidden="true">
            <circle cx="12" cy="8" r="4" fill="currentColor" />
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
          </svg>
        </div>
      )}
      
      {/* Hover overlay for larger images */}
      {size !== 'small' && !hasError && src && (
        <div className="absolute inset-0 bg-black/0 transition-colors hover:bg-black/10" />
      )}
    </div>
  );
}
