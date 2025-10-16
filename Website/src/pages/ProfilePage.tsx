// React import not needed with React 17+ JSX transform
import { useState } from 'react';
import { Arrestee } from '../types';
import { formatDate, formatTime, ageFromDOB, fullName, createGoogleMapsLink, isAddressLinkable, getBookingDateTime } from '../utils';
import { MugshotImage } from '../components/MugshotImage';
import { PdfViewer } from '../components/PdfViewer';

interface ProfilePageProps {
  arrestee: Arrestee;
  allArrestees: Arrestee[];
  onBack: () => void;
  backText: string;
}

export function ProfilePage({ arrestee, allArrestees, onBack, backText }: ProfilePageProps) {
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);

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


      {/* Arrestee Information - Clean profile card */}
      <section className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-6 mb-8">
        <div className="flex gap-4 sm:gap-6">
          {/* Mugshot - Left side */}
          <div className="flex-shrink-0">
            <MugshotImage 
              src={allPersonArrests[0]?.originalMugshotPath || null} 
              alt={`${fullName(arrestee)} mugshot`}
              size="search"
              className="rounded-lg"
            />
          </div>
          
          {/* Content - Right side */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <h2 className="text-xl font-semibold text-white mb-4">
              {fullName(arrestee).toUpperCase()}
            </h2>
            
            {/* Details Grid */}
            <div className="space-y-3">
              {/* Age */}
              {typeof age === 'number' && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-zinc-400 w-20">Age:</span>
                  <span className="text-sm text-zinc-200">{age}</span>
                </div>
              )}
              
              {/* Gender */}
              {arrestee.gender && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-zinc-400 w-20">Gender:</span>
                  <span className="text-sm text-zinc-200">{arrestee.gender}</span>
                </div>
              )}
              
              {/* Date of Birth */}
              {arrestee.date_of_birth && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-zinc-400 w-20">DOB:</span>
                  <span className="text-sm text-zinc-200">{formatDate(arrestee.date_of_birth)}</span>
                </div>
              )}
              
            </div>
          </div>
        </div>
      </section>

      {/* Arrest History */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">
            Arrest History
          </h3>
          <span className="bg-zinc-700 text-zinc-200 px-3 py-1 rounded-md text-sm font-medium">
            {allPersonArrests.length} Total Arrest{allPersonArrests.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-4">
          {allPersonArrests.map((arrest, index) => (
            <div key={arrest.id} className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-6">
              <div className="flex gap-4 sm:gap-6">
                {/* Mugshot - Left side */}
                <div className="flex-shrink-0">
                  <MugshotImage 
                    src={arrest.originalMugshotPath || null} 
                    alt={`${fullName(arrestee)} mugshot ${arrest.bookingDate}`}
                    size="large"
                    className="rounded-lg"
                  />
                </div>
                
                {/* Content - Right side */}
                <div className="flex-1 min-w-0">
                  {/* Date and Arrest Number */}
                  <div className="mb-4">
                    <h4 className="text-lg font-semibold text-white mb-1">
                      {formatDate(arrest.bookingDate)}
                      {arrest.bookingTime && (
                        <span className="text-base font-normal text-zinc-300 ml-2">at {formatTime(arrest.bookingTime)}</span>
                      )}
                    </h4>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400">Arrest #{allPersonArrests.length - index}</span>
                      {index === 0 && (
                        <span className="bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-xs font-medium">
                          Most Recent
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Details */}
                  <div className="space-y-3">
                    {/* Address at time of this arrest */}
                    {arrest.address && (
                      <div className="flex items-start">
                        <span className="text-sm font-medium text-zinc-400 w-24 flex-shrink-0">Address:</span>
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
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-zinc-400 w-24">Officer:</span>
                        <span className="text-sm text-zinc-200">{arrest.arrestingOfficer}</span>
                      </div>
                    )}
                    
                    {/* Source PDF Button */}
                    {arrest.sourcePdf && (
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-zinc-400 w-24">Source:</span>
                        <button
                          onClick={() => setSelectedPdf(arrest.sourcePdf!)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          View Source PDF
                        </button>
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
                            <span className="text-sm text-zinc-200 leading-relaxed">{charge}</span>
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

      {/* PDF Viewer Modal */}
      {selectedPdf && (
        <PdfViewer 
          pdfFilename={selectedPdf} 
          onClose={() => setSelectedPdf(null)} 
        />
      )}
    </div>
  );
}
