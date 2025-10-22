// React import not needed with React 17+ JSX transform
import { Arrestee } from '../types';
import { formatDate, formatTime, ageFromDOB, fullName, createGoogleMapsLink, isAddressLinkable, getBookingDateTime } from '../utils';
import { MugshotImage } from '../components/MugshotImage';

interface ProfilePageProps {
  arrestee: Arrestee;
  allArrestees: Arrestee[];
  onBack: () => void;
  backText: string;
}

export function ProfilePage({ arrestee, allArrestees, onBack, backText }: ProfilePageProps) {

  // Aggregate all arrests for this person across all their records
  // IMPORTANT: Must filter by date_of_birth to avoid mixing different people with the same name
  const allPersonArrests = allArrestees
    .filter(a => 
      a.first_name === arrestee.first_name && 
      a.last_name === arrestee.last_name &&
      (a.middle_name || '') === (arrestee.middle_name || '') &&
      a.date_of_birth === arrestee.date_of_birth
    )
    .flatMap(a => a.arrests)
    .sort((a, b) => getBookingDateTime(b.bookingDate, b.bookingTime) - getBookingDateTime(a.bookingDate, a.bookingTime));

  const age = ageFromDOB(arrestee.date_of_birth);
  
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-zinc-300 hover:text-white transition-colors group"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 transition-transform group-hover:-translate-x-1" aria-hidden="true">
          <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="font-medium">{backText}</span>
      </button>


      {/* Arrestee Information - Enhanced profile card */}
      <section className="bg-zinc-800/90 backdrop-blur-sm rounded-xl border border-zinc-700/50 p-5 sm:p-6 mb-8 shadow-lg shadow-black/10">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Mugshot - Top on mobile, left on desktop */}
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <MugshotImage 
              src={allPersonArrests[0]?.originalMugshotPath || null} 
              alt={`${fullName(arrestee)} mugshot`}
              size="search"
              className="rounded-lg ring-2 ring-zinc-700/50 shadow-lg"
            />
          </div>
          
          {/* Content - Below on mobile, right on desktop */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <h2 className="text-xl font-semibold text-white mb-4 text-center sm:text-left">
              {fullName(arrestee).toUpperCase()}
            </h2>
            
            {/* Details Grid */}
            <div className="space-y-3">
              {/* Age */}
              {typeof age === 'number' && (
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <span className="text-sm font-medium text-zinc-400 sm:w-20">Age:</span>
                  <span className="text-sm text-zinc-200">{age}</span>
                </div>
              )}
              
              {/* Gender */}
              {arrestee.gender && (
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <span className="text-sm font-medium text-zinc-400 sm:w-20">Gender:</span>
                  <span className="text-sm text-zinc-200">{arrestee.gender}</span>
                </div>
              )}
              
              {/* Date of Birth */}
              {arrestee.date_of_birth && (
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <span className="text-sm font-medium text-zinc-400 sm:w-20">DOB:</span>
                  <span className="text-sm text-zinc-200">{formatDate(arrestee.date_of_birth)}</span>
                </div>
              )}
              
            </div>
          </div>
        </div>
      </section>

      {/* Arrest History */}
      <section>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3 className="text-xl sm:text-2xl font-bold text-white">
            Arrest History
          </h3>
          <span className="inline-flex items-center bg-indigo-600/20 text-indigo-400 px-4 py-2 rounded-lg text-sm font-bold border border-indigo-600/30 shadow-lg shadow-indigo-600/10">
            {allPersonArrests.length} Total Arrest{allPersonArrests.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-5">
          {allPersonArrests.map((arrest, index) => (
            <div key={arrest.id} className="bg-zinc-800/90 backdrop-blur-sm rounded-xl border border-zinc-700/50 p-5 sm:p-6 shadow-lg shadow-black/10 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/20 transition-all duration-200">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                {/* Mugshot - Top on mobile, left on desktop */}
                <div className="flex-shrink-0 mx-auto sm:mx-0">
                  <MugshotImage 
                    src={arrest.originalMugshotPath || null} 
                    alt={`${fullName(arrestee)} mugshot ${arrest.bookingDate}`}
                    size="large"
                    className="rounded-lg ring-2 ring-zinc-700/50 shadow-lg"
                  />
                </div>
                
                {/* Content - Below on mobile, right on desktop */}
                <div className="flex-1 min-w-0">
                  {/* Date and Arrest Number */}
                  <div className="mb-4">
                    <h4 className="text-lg font-semibold text-white mb-1 text-center sm:text-left">
                      {formatDate(arrest.bookingDate)}
                      {arrest.bookingTime && (
                        <span className="text-base font-normal text-zinc-300 ml-2">at {formatTime(arrest.bookingTime)}</span>
                      )}
                    </h4>
                    <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap">
                      <span className="inline-flex items-center bg-zinc-700/70 text-zinc-300 px-3 py-1 rounded-lg text-xs font-semibold">
                        Arrest #{allPersonArrests.length - index}
                      </span>
                      {index === 0 && (
                        <span className="inline-flex items-center bg-indigo-600/20 text-indigo-400 px-3 py-1 rounded-lg text-xs font-semibold border border-indigo-600/30">
                          Most Recent
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Details */}
                  <div className="space-y-3">
                    {/* Address at time of this arrest */}
                    {arrest.address && (
                      <div className="flex flex-col sm:flex-row sm:items-start">
                        <span className="text-sm font-medium text-zinc-400 sm:w-24 flex-shrink-0">Address:</span>
                        <div className="text-sm text-zinc-200">
                          {isAddressLinkable(arrest.address) ? (
                            <a
                              href={createGoogleMapsLink(arrest.address)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 transition-colors underline"
                            >
                              {arrest.address}
                            </a>
                          ) : (
                            <span className="text-zinc-300">{arrest.address}</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Arresting Officer */}
                    {arrest.arrestingOfficer && (
                      <div className="flex flex-col sm:flex-row sm:items-center">
                        <span className="text-sm font-medium text-zinc-400 sm:w-24">Officer:</span>
                        <span className="text-sm text-zinc-200 break-words">{arrest.arrestingOfficer}</span>
                      </div>
                    )}
                    
                    {/* Source PDF Link */}
                    {arrest.sourcePdf && (
                      <div className="flex flex-col sm:flex-row sm:items-center">
                        <span className="text-sm font-medium text-zinc-400 sm:w-24">Source:</span>
                        <a
                          href={`/api/pdf/${encodeURIComponent(arrest.sourcePdf)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors active:scale-95"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View Source PDF
                        </a>
                      </div>
                    )}
                    
                    {/* Charges */}
                    <div>
                      <div className="text-sm font-medium text-zinc-400 mb-2">
                        Charges ({arrest.charges.length}):
                      </div>
                      <ul className="space-y-2">
                        {arrest.charges.map((charge, chargeIndex) => (
                          <li key={chargeIndex} className="flex items-start gap-3">
                            <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-zinc-500" />
                            <div className="flex-1">
                              <span className="text-sm text-zinc-200 leading-relaxed">{charge}</span>
                              <a
                                href={`https://law.justia.com/search?q=${encodeURIComponent(charge + ' Colorado')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors underline decoration-zinc-500"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                View Statute
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
