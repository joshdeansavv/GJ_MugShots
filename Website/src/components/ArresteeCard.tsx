// React import not needed with React 17+ JSX transform
import { Arrestee } from '../types';
import { formatDate, formatTime, ageFromDOB, fullName } from '../utils';
import { MugshotImage } from './MugshotImage';

interface ArresteeCardProps {
  arrestee: Arrestee;
  onViewDetails: () => void;
  totalAppearances?: number;
}

export function ArresteeCard({ arrestee, onViewDetails, totalAppearances }: ArresteeCardProps) {
  const latestArrest = arrestee.arrests[0];
  const age = ageFromDOB(arrestee.date_of_birth);

  return (
    <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-3 sm:p-4 hover:bg-zinc-750 transition-colors cursor-pointer" onClick={onViewDetails}>
      {/* Card layout with image and content side by side */}
      <div className="flex gap-3 sm:gap-4">
        {/* Mugshot - Left side */}
        <div className="flex-shrink-0">
          <MugshotImage 
            src={latestArrest.mugshotPath} 
            alt={`${fullName(arrestee)} mugshot`}
            size="search"
            className="rounded-lg"
          />
        </div>
        
        {/* Content - Right side */}
        <div className="flex-1 min-w-0">
          {/* Name and Arrest Count */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">
              {fullName(arrestee).toUpperCase()}
            </h3>
            {totalAppearances && (
              <div className="bg-zinc-700 text-zinc-200 rounded-full px-3 py-1 flex items-center justify-center text-xs font-medium">
                {totalAppearances} {totalAppearances === 1 ? 'Arrest' : 'Arrests'}
              </div>
            )}
          </div>
          
          {/* Details */}
          <div className="space-y-2">
            {/* Age */}
            {typeof age === 'number' && (
              <div className="flex items-center">
                <span className="text-sm font-medium text-zinc-400 w-16">Age:</span>
                <span className="text-sm text-zinc-200">{age}</span>
              </div>
            )}
            
            {/* Gender */}
            {arrestee.gender && (
              <div className="flex items-center">
                <span className="text-sm font-medium text-zinc-400 w-16">Gender:</span>
                <span className="text-sm text-zinc-200">{arrestee.gender}</span>
              </div>
            )}
            
            {/* Booking Date and Time */}
            <div className="flex items-center">
              <span className="text-sm font-medium text-zinc-400 w-16">Booked:</span>
              <span className="text-sm text-zinc-200">
                {formatDate(latestArrest.bookingDate)}
                {latestArrest.bookingTime && (
                  <span> at {formatTime(latestArrest.bookingTime)}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
