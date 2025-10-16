import { useEffect, useState } from 'react';

interface PdfViewerProps {
  pdfFilename: string | null;
  onClose: () => void;
}

export function PdfViewer({ pdfFilename, onClose }: PdfViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when PDF changes
    setIsLoading(true);
    setError(null);
  }, [pdfFilename]);

  if (!pdfFilename) {
    return null;
  }

  const pdfUrl = `/api/pdf/${encodeURIComponent(pdfFilename)}`;

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load PDF. The file may not exist or there was an error loading it.');
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative w-full h-full max-w-7xl max-h-[95vh] bg-zinc-900 rounded-lg shadow-2xl m-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-white truncate flex-1 mr-4">
            {pdfFilename}
          </h3>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-zinc-400 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-lg"
            aria-label="Close PDF viewer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                <p className="text-zinc-300">Loading PDF...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <div className="text-center max-w-md px-4">
                <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title={`PDF Viewer: ${pdfFilename}`}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>

        {/* Footer with helpful info */}
        <div className="px-6 py-3 border-t border-zinc-700 bg-zinc-800/50">
          <p className="text-sm text-zinc-400 text-center">
            Press <kbd className="px-2 py-1 bg-zinc-700 rounded text-xs">ESC</kbd> to close • 
            Click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}

