// React import not needed with React 17+ JSX transform

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="text-center">
        <div className="mb-6">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-zinc-700 border-t-indigo-500"></div>
        </div>
        <h3 className="text-lg font-medium text-zinc-300 mb-2">{message}</h3>
        <p className="text-zinc-500">Please wait while we fetch the latest records...</p>
      </div>
      
      {/* Skeleton loading cards */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card p-4">
            <div className="flex items-start gap-4">
              <div className="h-24 w-24 rounded-xl bg-zinc-800"></div>
              <div className="flex-1 space-y-3">
                <div className="h-4 bg-zinc-800 rounded w-3/4"></div>
                <div className="h-3 bg-zinc-800 rounded w-1/2"></div>
                <div className="space-y-2">
                  <div className="h-3 bg-zinc-800 rounded w-full"></div>
                  <div className="h-3 bg-zinc-800 rounded w-5/6"></div>
                  <div className="h-3 bg-zinc-800 rounded w-4/5"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
