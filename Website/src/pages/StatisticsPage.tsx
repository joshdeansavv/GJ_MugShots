import { useMemo, useState } from 'react';
import { Arrestee } from '../types';
import { ageFromDOB } from '../utils';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface StatisticsPageProps {
  arrestees: Arrestee[];
}

const COLORS = {
  primary: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'],
  warm: ['#f59e0b', '#f97316', '#ef4444', '#dc2626', '#fbbf24', '#fb923c', '#fdba74'],
  gender: {
    MALE: '#3b82f6',
    FEMALE: '#ec4899',
    'NON-BINARY': '#8b5cf6',
    OTHER: '#f59e0b',
    UNKNOWN: '#6b7280',
  },
  timeOfDay: {
    'Night (12am-6am)': '#1e3a8a',
    'Morning (6am-12pm)': '#f59e0b',
    'Afternoon (12pm-6pm)': '#eab308',
    'Evening (6pm-12am)': '#7c3aed',
  }
};

export function StatisticsPage({ arrestees }: StatisticsPageProps) {
  const [selectedView, setSelectedView] = useState<'overview' | 'temporal' | 'demographics' | 'charges' | 'officers' | 'geographic' | 'recidivism'>('overview');
  
  const statistics = useMemo(() => {
    // Total unique offenders (by name + DOB)
    const uniqueOffenders = new Map<string, Arrestee>();
    const uniqueOffendersData = new Map<string, { arrestee: Arrestee, totalArrests: number, charges: Set<string> }>();
    
    arrestees.forEach(arrestee => {
      const key = `${arrestee.first_name}|${arrestee.last_name}|${arrestee.date_of_birth}`;
      if (!uniqueOffenders.has(key)) {
        uniqueOffenders.set(key, arrestee);
      }
      
      const existing = uniqueOffendersData.get(key);
      const chargesSet = new Set<string>();
      arrestee.arrests.forEach(arrest => {
        arrest.charges.forEach(c => chargesSet.add(c.trim().toUpperCase()));
      });
      
      if (existing) {
        existing.totalArrests += arrestee.arrests.length;
        chargesSet.forEach(c => existing.charges.add(c));
      } else {
        uniqueOffendersData.set(key, {
          arrestee,
          totalArrests: arrestee.arrests.length,
          charges: chargesSet
        });
      }
    });

    // Gender distribution
    const genderCounts: Record<string, number> = {};
    uniqueOffenders.forEach(arrestee => {
      const gender = arrestee.gender || 'UNKNOWN';
      genderCounts[gender] = (genderCounts[gender] || 0) + 1;
    });
    
    const genderData = Object.entries(genderCounts).map(([name, value]) => ({
      name,
      value,
      percentage: ((value / uniqueOffenders.size) * 100).toFixed(1)
    }));

    // Age distribution (more granular)
    const ageCounts: Record<string, number> = {};
    const ageByGender: Record<string, Record<string, number>> = {};
    uniqueOffenders.forEach(arrestee => {
      const age = ageFromDOB(arrestee.date_of_birth);
      const gender = arrestee.gender || 'UNKNOWN';
      
      if (age !== undefined && !isNaN(age)) {
        // 5-year groups for more detail
        const ageGroup = Math.floor(age / 5) * 5;
        const label = `${ageGroup}-${ageGroup + 4}`;
        ageCounts[label] = (ageCounts[label] || 0) + 1;
        
        if (!ageByGender[gender]) {
          ageByGender[gender] = {};
        }
        ageByGender[gender][label] = (ageByGender[gender][label] || 0) + 1;
      }
    });
    
    const ageData = Object.entries(ageCounts)
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => {
        const aStart = parseInt(a.range.split('-')[0]);
        const bStart = parseInt(b.range.split('-')[0]);
        return aStart - bStart;
      });

    // Day of week pattern
    const dayOfWeekCounts: Record<string, number> = {
      'Sunday': 0, 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0,
      'Thursday': 0, 'Friday': 0, 'Saturday': 0
    };
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        try {
          const date = new Date(arrest.bookingDate);
          const dayName = dayNames[date.getDay()];
          dayOfWeekCounts[dayName]++;
        } catch (e) {
          // Skip invalid dates
        }
      });
    });
    
    const dayOfWeekData = Object.entries(dayOfWeekCounts)
      .map(([day, count]) => ({ day, count }));

    // Time of day pattern
    const timeOfDayCounts: Record<string, number> = {
      'Night (12am-6am)': 0,
      'Morning (6am-12pm)': 0,
      'Afternoon (12pm-6pm)': 0,
      'Evening (6pm-12am)': 0
    };
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        if (arrest.bookingTime) {
          const match = arrest.bookingTime.match(/^(\d{1,2}):(\d{2})/);
          if (match) {
            const hour = parseInt(match[1]);
            if (hour >= 0 && hour < 6) timeOfDayCounts['Night (12am-6am)']++;
            else if (hour >= 6 && hour < 12) timeOfDayCounts['Morning (6am-12pm)']++;
            else if (hour >= 12 && hour < 18) timeOfDayCounts['Afternoon (12pm-6pm)']++;
            else if (hour >= 18 && hour < 24) timeOfDayCounts['Evening (6pm-12am)']++;
          }
        }
      });
    });
    
    const timeOfDayData = Object.entries(timeOfDayCounts)
      .map(([period, count]) => ({ period, count, percentage: ((count / arrestees.reduce((sum, a) => sum + a.arrests.length, 0)) * 100).toFixed(1) }));

    // Arrests over time (by week for more granularity)
    const weekCounts = new Map<string, number>();
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        try {
          const date = new Date(arrest.bookingDate);
          // Get week number
          const startOfYear = new Date(date.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
          const weekKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
          weekCounts.set(weekKey, (weekCounts.get(weekKey) || 0) + 1);
        } catch (e) {
          // Skip invalid dates
        }
      });
    });
    
    const weeklyData = Array.from(weekCounts.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-26); // Last 26 weeks (6 months)

    // Monthly arrests for longer trend
    const monthCounts = new Map<string, number>();
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        try {
          const date = new Date(arrest.bookingDate);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
        } catch (e) {
          // Skip invalid dates
        }
      });
    });
    
    const timelineData = Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-24); // Last 24 months

    // Arresting officers with detailed stats
    const officerStats = new Map<string, { 
      count: number, 
      uniqueOffenders: Set<string>,
      charges: Set<string>,
      avgChargesPerArrest: number
    }>();
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        const officer = arrest.arrestingOfficer?.trim();
        if (officer && officer !== '' && officer.toLowerCase() !== 'unknown') {
          const key = `${arrestee.first_name}|${arrestee.last_name}|${arrestee.date_of_birth}`;
          const existing = officerStats.get(officer);
          
          if (existing) {
            existing.count++;
            existing.uniqueOffenders.add(key);
            arrest.charges.forEach(c => existing.charges.add(c.trim().toUpperCase()));
          } else {
            const chargesSet = new Set<string>();
            arrest.charges.forEach(c => chargesSet.add(c.trim().toUpperCase()));
            officerStats.set(officer, {
              count: 1,
              uniqueOffenders: new Set([key]),
              charges: chargesSet,
              avgChargesPerArrest: arrest.charges.length
            });
          }
        }
      });
    });
    
    // Filter officers with at least 3 arrests and sort
    const topOfficers = Array.from(officerStats.entries())
      .filter(([_, stats]) => stats.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([name, stats]) => ({ 
        name, 
        arrests: stats.count,
        uniqueOffenders: stats.uniqueOffenders.size,
        avgPerOffender: (stats.count / stats.uniqueOffenders.size).toFixed(1)
      }));

    // Charge categorization with intelligent grouping
    const chargeCounts = new Map<string, number>();
    const chargeCategories: Record<string, number> = {
      'FTA/Warrants': 0,
      'Parole/Probation Violations': 0,
      'DUI/DWAI': 0,
      'Domestic Violence': 0,
      'Drug-Related': 0,
      'Theft/Burglary': 0,
      'Assault/Battery': 0,
      'Traffic Violations': 0,
      'Trespassing': 0,
      'Weapons': 0,
      'Property Damage': 0,
      'Other': 0
    };
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        arrest.charges.forEach(charge => {
          const normalizedCharge = charge.trim().toUpperCase();
          if (normalizedCharge) {
            chargeCounts.set(normalizedCharge, (chargeCounts.get(normalizedCharge) || 0) + 1);
            
            // Categorize with priority order (more specific first)
            if (normalizedCharge.includes('PAROLE') || normalizedCharge.includes('PROBATION')) {
              chargeCategories['Parole/Probation Violations']++;
            } else if (normalizedCharge.includes('FAIL') && normalizedCharge.includes('APPEAR') || 
                       normalizedCharge.includes('FTA') || 
                       normalizedCharge.includes('WARRANT') ||
                       normalizedCharge.includes('FUGITIVE')) {
              chargeCategories['FTA/Warrants']++;
            } else if (normalizedCharge.includes('DUI') || 
                       normalizedCharge.includes('DWAI') || 
                       normalizedCharge.includes('DRIVING UNDER') ||
                       normalizedCharge.includes('DRUNK DRIV')) {
              chargeCategories['DUI/DWAI']++;
            } else if (normalizedCharge.includes('DOMESTIC') || 
                       normalizedCharge.includes(' DV ') ||
                       normalizedCharge.includes('DV-')) {
              chargeCategories['Domestic Violence']++;
            } else if (normalizedCharge.includes('DRUG') || 
                       normalizedCharge.includes('MARIJUANA') || 
                       normalizedCharge.includes('METH') || 
                       normalizedCharge.includes('COCAINE') || 
                       normalizedCharge.includes('NARCOTIC') || 
                       normalizedCharge.includes('CONTROLLED SUBSTANCE') ||
                       normalizedCharge.includes('PARAPHERNALIA') ||
                       normalizedCharge.includes('HEROIN') ||
                       normalizedCharge.includes('FENTANYL')) {
              chargeCategories['Drug-Related']++;
            } else if (normalizedCharge.includes('THEFT') || 
                       normalizedCharge.includes('BURGLARY') || 
                       normalizedCharge.includes('ROBBERY') || 
                       normalizedCharge.includes('STEAL') ||
                       normalizedCharge.includes('SHOPLIFT') ||
                       normalizedCharge.includes('LARCENY')) {
              chargeCategories['Theft/Burglary']++;
            } else if (normalizedCharge.includes('ASSAULT') || 
                       normalizedCharge.includes('BATTERY') ||
                       normalizedCharge.includes('MENACING')) {
              chargeCategories['Assault/Battery']++;
            } else if (normalizedCharge.includes('TRESPASS') || 
                       normalizedCharge.includes('TRESPAS')) {
              chargeCategories['Trespassing']++;
            } else if (normalizedCharge.includes('TRAFFIC') || 
                       (normalizedCharge.includes('DRIV') && !normalizedCharge.includes('DUI')) || 
                       normalizedCharge.includes('LICENSE') ||
                       normalizedCharge.includes('RECKLESS') && normalizedCharge.includes('DRIV') ||
                       normalizedCharge.includes('SPEEDING')) {
              chargeCategories['Traffic Violations']++;
            } else if (normalizedCharge.includes('WEAPON') || 
                       normalizedCharge.includes('FIREARM') || 
                       normalizedCharge.includes('GUN')) {
              chargeCategories['Weapons']++;
            } else if (normalizedCharge.includes('CRIMINAL MISCHIEF') || 
                       normalizedCharge.includes('DAMAGE') || 
                       normalizedCharge.includes('VANDAL') ||
                       normalizedCharge.includes('DESTRUCTION')) {
              chargeCategories['Property Damage']++;
            } else {
              chargeCategories['Other']++;
            }
          }
        });
      });
    });
    
    const chargeCategoryData = Object.entries(chargeCategories)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    
    // Intelligent charge grouping - normalize and combine similar charges
    const normalizeCharge = (charge: string): string => {
      let normalized = charge.trim().toUpperCase();
      
      // Remove state/county prefixes and statute numbers WHILE keeping the description
      // Pattern: "State 90Z 18-3-303 M2 FALSE IMPRISONMENT" → "FALSE IMPRISONMENT"
      normalized = normalized.replace(/^STATE\s+\w+\s+[\d\-#A-Z()]+\s+[A-Z0-9]+\s+/i, '');
      normalized = normalized.replace(/^COUNTY\s+\w+\s+[\d\-#A-Z()]+\s+[A-Z0-9]+\s+/i, '');
      
      // Standardize common variations - keep specific context!
      if (normalized.includes('FAIL') && normalized.includes('APPEAR')) {
        return 'FAILURE TO APPEAR';
      }
      if (normalized.includes('PROBATION') && normalized.includes('VIOL')) {
        return 'PROBATION VIOLATION';
      }
      if (normalized.includes('PAROLE') && normalized.includes('VIOL')) {
        return 'PAROLE VIOLATION';
      }
      if (normalized.includes('PROTECTION ORDER')) {
        return 'VIOLATION OF A PROTECTION ORDER';
      }
      if (normalized.includes('RESTRAINING ORDER')) {
        return 'VIOLATION OF RESTRAINING ORDER';
      }
      if (normalized.includes('DOMESTIC') && normalized.includes('VIOL')) {
        return 'DOMESTIC VIOLENCE';
      }
      if (normalized.includes('FUGITIVE')) {
        return 'FUGITIVE FROM JUSTICE';
      }
      if (normalized.includes('DUI') && normalized.includes('DROVE VEH UNDER')) {
        return 'DUI - DROVE VEH UNDER THE INFLUENCE';
      }
      if (normalized.includes('DWAI')) {
        return 'DWAI - DROVE WHILE ABILITY IMPAIRED';
      }
      if (normalized.includes('FALSE IMPRISON')) {
        return 'FALSE IMPRISONMENT';
      }
      if (normalized.includes('DRUG PARAPHERNALIA') || normalized.includes('POSSESSION OF DRUG PARAPHERNALIA')) {
        return 'POSSESSION OF DRUG PARAPHERNALIA';
      }
      if (normalized.includes('CONTROLLED SUB') && normalized.includes('POSSESS')) {
        return 'POSSESSION OF CONTROLLED SUBSTANCE';
      }
      if (normalized.includes('TRESPASS') && normalized.includes('1ST DEG')) {
        return '1ST DEGREE CRIMINAL TRESPASS';
      }
      if (normalized.includes('TRESPASS') && normalized.includes('2ND DEG')) {
        return '2ND DEGREE CRIMINAL TRESPASS';
      }
      if (normalized.includes('TRESPASS')) {
        return 'TRESPASSING';
      }
      if (normalized.includes('HARASSMENT') && normalized.includes('STRIKE')) {
        return 'HARASSMENT - STRIKE/SHOVE/KICK';
      }
      if (normalized.includes('HARASSMENT')) {
        return 'HARASSMENT';
      }
      if (normalized.includes('MENACING') && normalized.includes('WEAPON')) {
        return 'MENACING - WITH WEAPON';
      }
      if (normalized.includes('MENACING')) {
        return 'MENACING';
      }
      if (normalized.includes('ASSAULT') && normalized.includes('2ND DEG')) {
        return 'ASSAULT 2ND DEGREE';
      }
      if (normalized.includes('ASSAULT') && normalized.includes('3RD DEG')) {
        return 'ASSAULT 3RD DEGREE';
      }
      if (normalized.includes('ASSAULT') && normalized.includes('POLICE OFFICER')) {
        return 'ASSAULT ON POLICE OFFICER';
      }
      if (normalized.includes('ASSAULT')) {
        return 'ASSAULT';
      }
      if (normalized.includes('THEFT') && normalized.includes('MOTOR VEHICLE')) {
        return 'MOTOR VEHICLE THEFT';
      }
      if (normalized.includes('THEFT')) {
        return 'THEFT';
      }
      if (normalized.includes('BURGLARY') && normalized.includes('2ND DEG')) {
        return '2ND DEGREE BURGLARY';
      }
      if (normalized.includes('BURGLARY')) {
        return 'BURGLARY';
      }
      if (normalized.includes('CRIMINAL MISCHIEF')) {
        return 'CRIMINAL MISCHIEF';
      }
      if (normalized.includes('RESISTING ARREST')) {
        return 'RESISTING ARREST';
      }
      if (normalized.includes('OBSTRUCT')) {
        return 'OBSTRUCTING OFFICER';
      }
      if (normalized.includes('DRIVING UNDER RESTRAINT')) {
        return 'DRIVING UNDER RESTRAINT';
      }
      if (normalized.includes('RECKLESS DRIV')) {
        return 'RECKLESS DRIVING';
      }
      if (normalized.includes('RECKLESS ENDANGER')) {
        return 'RECKLESS ENDANGERMENT';
      }
      if (normalized.includes('VEHICULAR ELUD')) {
        return 'VEHICULAR ELUDING';
      }
      if (normalized.includes('CARELESS DRIV')) {
        return 'CARELESS DRIVING';
      }
      
      // Remove trailing ellipsis and truncation artifacts
      normalized = normalized.replace(/\.{3,}$/, '');
      normalized = normalized.replace(/\s*-\s*$/, '');
      normalized = normalized.replace(/\s+/g, ' '); // normalize whitespace
      
      return normalized.substring(0, 60).trim();
    };
    
    const groupedCharges = new Map<string, number>();
    chargeCounts.forEach((count, charge) => {
      const normalized = normalizeCharge(charge);
      groupedCharges.set(normalized, (groupedCharges.get(normalized) || 0) + count);
    });
    
    const topCharges = Array.from(groupedCharges.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([charge, count]) => ({
        charge: charge.length > 50 ? charge.substring(0, 47) + '...' : charge,
        count
      }));

    // Repeat offenders analysis
    const offenderArrestCounts = Array.from(uniqueOffendersData.values())
      .map(data => ({
        name: `${data.arrestee.first_name} ${data.arrestee.last_name}`,
        arrests: data.totalArrests,
        uniqueCharges: data.charges.size,
        age: ageFromDOB(data.arrestee.date_of_birth),
        gender: data.arrestee.gender || 'UNKNOWN'
      }));
    
    const topRepeatOffenders = offenderArrestCounts
      .filter(o => o.arrests >= 3)
      .sort((a, b) => b.arrests - a.arrests)
      .slice(0, 15);

    // First-time vs repeat offenders
    const firstTimeOffenders = offenderArrestCounts.filter(o => o.arrests === 1).length;
    const repeatOffenders = offenderArrestCounts.filter(o => o.arrests > 1).length;
    const chronicOffenders = offenderArrestCounts.filter(o => o.arrests >= 5).length;

    // Charges per arrest distribution
    const chargesPerArrestCounts: Record<string, number> = {};
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        const chargeCount = arrest.charges.length;
        const bucket = chargeCount >= 5 ? '5+' : String(chargeCount);
        chargesPerArrestCounts[bucket] = (chargesPerArrestCounts[bucket] || 0) + 1;
      });
    });
    
    const chargesPerArrestData = Object.entries(chargesPerArrestCounts)
      .map(([charges, count]) => ({ charges, count }))
      .sort((a, b) => {
        if (a.charges === '5+') return 1;
        if (b.charges === '5+') return -1;
        return parseInt(a.charges) - parseInt(b.charges);
      });

    // Seasonal patterns (by month of year)
    const seasonalCounts: Record<string, number> = {
      'Jan': 0, 'Feb': 0, 'Mar': 0, 'Apr': 0, 'May': 0, 'Jun': 0,
      'Jul': 0, 'Aug': 0, 'Sep': 0, 'Oct': 0, 'Nov': 0, 'Dec': 0
    };
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        try {
          const date = new Date(arrest.bookingDate);
          const monthName = monthNames[date.getMonth()];
          seasonalCounts[monthName]++;
        } catch (e) {
          // Skip invalid dates
        }
      });
    });
    
    const seasonalData = monthNames.map(month => ({
      month,
      count: seasonalCounts[month] || 0
    }));

    // Average age statistics
    const ages = Array.from(uniqueOffenders.values())
      .map(a => ageFromDOB(a.date_of_birth))
      .filter(age => age !== undefined && !isNaN(age)) as number[];
    
    const avgAge = ages.length > 0 ? (ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1) : 0;
    const medianAge = ages.length > 0 ? ages.sort((a, b) => a - b)[Math.floor(ages.length / 2)] : 0;
    const youngestAge = ages.length > 0 ? Math.min(...ages) : 0;
    const oldestAge = ages.length > 0 ? Math.max(...ages) : 0;

    // Total charges filed
    const totalCharges = arrestees.reduce((sum, a) => 
      sum + a.arrests.reduce((asum, arrest) => asum + arrest.charges.length, 0), 0);

    // GEOGRAPHIC ANALYSIS
    // Housing status - count unique people, not arrests
    const housingStatus = { homeless: 0, housed: 0, unknown: 0 };
    const cityAreaCounts = new Map<string, number>();
    
    // For housing status: count unique people (use most recent address)
    uniqueOffenders.forEach(arrestee => {
      const address = arrestee.address?.toUpperCase() || '';
      
      // Housing status (per unique person)
      if (address.includes('HOMELESS')) {
        housingStatus.homeless++;
      } else if (address && address.trim() !== '') {
        housingStatus.housed++;
      } else {
        housingStatus.unknown++;
      }
      
      // City/area breakdown (per unique person)
      if (address.includes('GRAND JUNCTION')) {
        cityAreaCounts.set('Grand Junction', (cityAreaCounts.get('Grand Junction') || 0) + 1);
      } else if (address.includes('CLIFTON')) {
        cityAreaCounts.set('Clifton', (cityAreaCounts.get('Clifton') || 0) + 1);
      } else if (address.includes('FRUITA')) {
        cityAreaCounts.set('Fruita', (cityAreaCounts.get('Fruita') || 0) + 1);
      } else if (address.includes('PALISADE')) {
        cityAreaCounts.set('Palisade', (cityAreaCounts.get('Palisade') || 0) + 1);
      } else if (address.includes('HOMELESS')) {
        // Already counted above
      } else if (address) {
        cityAreaCounts.set('Other Areas', (cityAreaCounts.get('Other Areas') || 0) + 1);
      }
    });
    
    // For location hot spots: extract streets and neighborhoods (privacy-conscious)
    // Count all arrests (not just unique people) to see which streets have most activity
    const streetCounts = new Map<string, number>();
    const zipCodeCounts = new Map<string, number>();
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        const address = (arrest.address || arrestee.address || '').toUpperCase();
        if (address && !address.includes('HOMELESS') && !address.includes('PO BOX')) {
          // Extract street name (avoid house numbers for privacy)
          // Example: "302 PITKIN AVE GRAND JUNCTION, CO 81501" -> "PITKIN AVE"
          // More flexible regex: capture everything between the house number and the city/apt
          const parts = address.split(',');
          if (parts.length > 0) {
            const streetPart = parts[0].trim();
            // Remove leading house number and extract street name
            // Handles: "302 PITKIN AVE", "2853 NORTH AVE", "564 29 RD", "2760 B 1/2 RD"
            const streetMatch = streetPart.match(/^\d+\s+(.+?)$/);
            if (streetMatch && streetMatch[1]) {
              let street = streetMatch[1].trim();
              // Remove "Apt" or "Unit" suffixes if they snuck in
              street = street.replace(/\s+(APT\.?|UNIT)\s*\d*$/i, '');
              street = street.replace(/\s+/g, ' '); // normalize whitespace
              
              // Filter out very short street names
              if (street.length > 2 && street !== 'N' && street !== 'S' && street !== 'E' && street !== 'W') {
                streetCounts.set(street, (streetCounts.get(street) || 0) + 1);
              }
            }
          }
          
          // Extract zip code for neighborhood analysis
          const zipMatch = address.match(/\b(81\d{3})\b/);
          if (zipMatch) {
            const zip = zipMatch[1];
            const neighborhood = zip === '81501' ? 'Downtown/Central GJ (81501)' :
                                zip === '81504' ? 'Northeast GJ (81504)' :
                                zip === '81503' ? 'Southeast GJ (81503)' :
                                zip === '81505' ? 'Orchard Mesa (81505)' :
                                zip === '81507' ? 'Redlands (81507)' :
                                zip === '81506' ? 'West GJ (81506)' :
                                zip === '81520' ? 'Clifton (81520)' :
                                zip === '81521' ? 'Clifton East (81521)' :
                                zip.startsWith('815') ? `Grand Junction Area (${zip})` :
                                `Other Area (${zip})`;
            zipCodeCounts.set(neighborhood, (zipCodeCounts.get(neighborhood) || 0) + 1);
          }
        }
      });
    });
    
    const housingData = [
      { status: 'Housed', count: housingStatus.housed, percentage: ((housingStatus.housed / uniqueOffenders.size) * 100).toFixed(1) },
      { status: 'Homeless', count: housingStatus.homeless, percentage: ((housingStatus.homeless / uniqueOffenders.size) * 100).toFixed(1) },
      { status: 'Unknown', count: housingStatus.unknown, percentage: ((housingStatus.unknown / uniqueOffenders.size) * 100).toFixed(1) },
    ];
    
    // Top streets with activity
    const topStreets = Array.from(streetCounts.entries())
      .filter(([_, count]) => count >= 3) // Lowered threshold to show more streets
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([street, count]) => ({
        location: street,
        count,
        type: 'street'
      }));
    
    // Top neighborhoods by zip code
    const topNeighborhoods = Array.from(zipCodeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([neighborhood, count]) => ({
        location: neighborhood,
        count,
        type: 'neighborhood'
      }));
    
    const cityData = Array.from(cityAreaCounts.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    // HOURLY PATTERNS (24-hour breakdown)
    const hourlyPatterns: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourlyPatterns[i] = 0;
    }
    
    arrestees.forEach(arrestee => {
      arrestee.arrests.forEach(arrest => {
        if (arrest.bookingTime) {
          const match = arrest.bookingTime.match(/^(\d{1,2}):(\d{2})/);
          if (match) {
            const hour = parseInt(match[1]);
            if (hour >= 0 && hour < 24) {
              hourlyPatterns[hour]++;
            }
          }
        }
      });
    });
    
    const hourlyData = Object.entries(hourlyPatterns)
      .map(([hour, count]) => ({
        hour: `${hour.padStart(2, '0')}:00`,
        count,
        label: parseInt(hour) === 0 ? '12am' : parseInt(hour) < 12 ? `${hour}am` : parseInt(hour) === 12 ? '12pm' : `${parseInt(hour) - 12}pm`
      }));

    // AGE-GENDER CORRELATION
    const ageGenderData: Array<{ ageGroup: string, male: number, female: number, other: number }> = [];
    const ageGroups = ['Under 21', '21-30', '31-40', '41-50', 'Over 50'];
    
    ageGroups.forEach(group => {
      const data = { ageGroup: group, male: 0, female: 0, other: 0 };
      
      uniqueOffenders.forEach(arrestee => {
        const age = ageFromDOB(arrestee.date_of_birth);
        if (age === undefined) return;
        
        let matchesGroup = false;
        if (group === 'Under 21' && age < 21) matchesGroup = true;
        else if (group === '21-30' && age >= 21 && age <= 30) matchesGroup = true;
        else if (group === '31-40' && age >= 31 && age <= 40) matchesGroup = true;
        else if (group === '41-50' && age >= 41 && age <= 50) matchesGroup = true;
        else if (group === 'Over 50' && age > 50) matchesGroup = true;
        
        if (matchesGroup) {
          const gender = arrestee.gender || 'UNKNOWN';
          if (gender === 'MALE') data.male++;
          else if (gender === 'FEMALE') data.female++;
          else data.other++;
        }
      });
      
      ageGenderData.push(data);
    });

    // RECIDIVISM PATTERNS
    const arrestDistribution = {
      '1 arrest': offenderArrestCounts.filter(o => o.arrests === 1).length,
      '2 arrests': offenderArrestCounts.filter(o => o.arrests === 2).length,
      '3-4 arrests': offenderArrestCounts.filter(o => o.arrests >= 3 && o.arrests <= 4).length,
      '5-9 arrests': offenderArrestCounts.filter(o => o.arrests >= 5 && o.arrests <= 9).length,
      '10+ arrests': offenderArrestCounts.filter(o => o.arrests >= 10).length,
    };
    
    const recidivismData = Object.entries(arrestDistribution)
      .map(([category, count]) => ({ category, count }));

    return {
      totalOffenders: uniqueOffenders.size,
      totalArrests: arrestees.reduce((sum, a) => sum + a.arrests.length, 0),
      totalCharges,
      genderData,
      topOfficers,
      ageData,
      dayOfWeekData,
      timeOfDayData,
      weeklyData,
      timelineData,
      chargeCategoryData,
      topCharges,
      topRepeatOffenders,
      chargesPerArrestData,
      seasonalData,
      firstTimeOffenders,
      repeatOffenders,
      chronicOffenders,
      avgAge,
      medianAge,
      youngestAge,
      oldestAge,
      // Geographic data
      housingData,
      topStreets,
      topNeighborhoods,
      cityData,
      // Temporal patterns
      hourlyData,
      // Demographics
      ageGenderData,
      // Recidivism
      recidivismData,
    };
  }, [arrestees]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg shadow-lg">
          <p className="text-zinc-200 text-sm font-medium">{label}</p>
          {payload.map((p: any, idx: number) => (
            <p key={idx} className="text-zinc-300 text-sm" style={{ color: p.color }}>
              {p.name}: {p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Advanced Statistics Dashboard</h1>
        <p className="text-zinc-400">Deep dive analytics of booking records with comprehensive insights</p>
      </div>

      {/* View selector */}
      <div className="mb-8 flex flex-wrap gap-2">
        {[
          { id: 'overview', label: '📊 Overview' },
          { id: 'temporal', label: '📅 Temporal Patterns' },
          { id: 'demographics', label: '👥 Demographics' },
          { id: 'charges', label: '⚖️ Charges Analysis' },
          { id: 'officers', label: '👮 Officer Stats' },
          { id: 'geographic', label: '📍 Geographic Analysis' },
          { id: 'recidivism', label: '🔄 Recidivism Patterns' },
        ].map(view => (
          <button
            key={view.id}
            onClick={() => setSelectedView(view.id as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedView === view.id
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg p-4 shadow-lg">
          <div className="text-indigo-200 text-xs font-medium mb-1">Total Offenders</div>
          <div className="text-white text-2xl font-bold">{statistics.totalOffenders.toLocaleString()}</div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-4 shadow-lg">
          <div className="text-purple-200 text-xs font-medium mb-1">Total Arrests</div>
          <div className="text-white text-2xl font-bold">{statistics.totalArrests.toLocaleString()}</div>
        </div>
        
        <div className="bg-gradient-to-br from-pink-600 to-pink-700 rounded-lg p-4 shadow-lg">
          <div className="text-pink-200 text-xs font-medium mb-1">Total Charges</div>
          <div className="text-white text-2xl font-bold">{statistics.totalCharges.toLocaleString()}</div>
        </div>
        
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-4 shadow-lg">
          <div className="text-blue-200 text-xs font-medium mb-1">Avg Age</div>
          <div className="text-white text-2xl font-bold">{statistics.avgAge}</div>
        </div>
        
        <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-lg p-4 shadow-lg">
          <div className="text-teal-200 text-xs font-medium mb-1">Repeat Offenders</div>
          <div className="text-white text-2xl font-bold">{statistics.repeatOffenders}</div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg p-4 shadow-lg">
          <div className="text-orange-200 text-xs font-medium mb-1">Chronic (5+)</div>
          <div className="text-white text-2xl font-bold">{statistics.chronicOffenders}</div>
        </div>
      </div>

      {/* Overview Section */}
      {selectedView === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Offender Type Distribution */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Offender Types</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'First-Time', value: statistics.firstTimeOffenders },
                    { name: 'Repeat (2-4)', value: statistics.repeatOffenders - statistics.chronicOffenders },
                    { name: 'Chronic (5+)', value: statistics.chronicOffenders },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={100}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-zinc-300">First-Time</span>
                </div>
                <span className="text-zinc-400">{statistics.firstTimeOffenders}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-zinc-300">Repeat (2-4)</span>
                </div>
                <span className="text-zinc-400">{statistics.repeatOffenders - statistics.chronicOffenders}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-zinc-300">Chronic (5+)</span>
                </div>
                <span className="text-zinc-400">{statistics.chronicOffenders}</span>
              </div>
            </div>
          </div>

          {/* Gender Distribution */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Gender Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statistics.genderData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statistics.genderData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS.gender[entry.name as keyof typeof COLORS.gender] || COLORS.primary[index % COLORS.primary.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {statistics.genderData.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS.gender[entry.name as keyof typeof COLORS.gender] || COLORS.primary[idx % COLORS.primary.length] }}
                    />
                    <span className="text-zinc-300">{entry.name}</span>
                  </div>
                  <span className="text-zinc-400">{entry.value} ({entry.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Charge Categories */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Charge Categories</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={statistics.chargeCategoryData} margin={{ bottom: 80, left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="category" 
                  stroke="#9ca3af" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Bar dataKey="count" fill="#8b5cf6">
                  {statistics.chargeCategoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Age Statistics Card */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Age Statistics</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Average Age:</span>
                <span className="text-white text-2xl font-bold">{statistics.avgAge}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Median Age:</span>
                <span className="text-white text-xl font-semibold">{statistics.medianAge}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Age Range:</span>
                <span className="text-white text-lg font-medium">{statistics.youngestAge} - {statistics.oldestAge}</span>
              </div>
            </div>
          </div>

          {/* Charges Per Arrest */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Charges Per Arrest</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statistics.chargesPerArrestData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="charges" stroke="#9ca3af" label={{ value: 'Number of Charges', position: 'insideBottom', offset: -5 }} />
                <YAxis stroke="#9ca3af" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Temporal Patterns Section */}
      {selectedView === 'temporal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Arrests Over Time (Monthly) */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Arrests Over Time (24 Months)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={statistics.timelineData}>
                <defs>
                  <linearGradient id="colorArrests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af"
                  tickFormatter={(value) => {
                    const [year, month] = value.split('-');
                    return `${month}/${year.slice(2)}`;
                  }}
                />
                <YAxis stroke="#9ca3af" />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorArrests)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly Trend */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Weekly Arrests (26 Weeks)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={statistics.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="week" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <YAxis stroke="#9ca3af" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Day of Week Pattern */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Arrests by Day of Week</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={statistics.dayOfWeekData} margin={{ bottom: 10, left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="day" 
                  stroke="#9ca3af"
                  tick={{ fontSize: 12 }}
                  interval={0}
                />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Bar dataKey="count" fill="#ec4899">
                  {statistics.dayOfWeekData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Time of Day Pattern */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Arrests by Time of Day</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statistics.timeOfDayData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ period, percentage }: any) => `${period.split(' ')[0]}: ${percentage}%`}
                  outerRadius={100}
                  dataKey="count"
                >
                  {statistics.timeOfDayData.map((_, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={Object.values(COLORS.timeOfDay)[index] || COLORS.primary[index % COLORS.primary.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {statistics.timeOfDayData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: Object.values(COLORS.timeOfDay)[idx] || COLORS.primary[idx] }}
                    />
                    <span className="text-zinc-300">{item.period}</span>
                  </div>
                  <span className="text-zinc-400">{item.count} ({item.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Seasonal Pattern */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Seasonal Patterns (All Data)</h2>
            <p className="text-sm text-zinc-400 mb-4">
              Aggregated across all months in dataset. Shows arrest distribution by calendar month.
            </p>
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={statistics.seasonalData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis 
                  dataKey="month" 
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <PolarRadiusAxis 
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  angle={90}
                />
                <Radar 
                  name="Arrests" 
                  dataKey="count" 
                  stroke="#f59e0b" 
                  fill="#f59e0b" 
                  fillOpacity={0.6}
                  dot={{ fill: '#f59e0b', r: 4 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                  formatter={(value) => [`${value} arrests`, 'Count']}
                />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-6 gap-2 text-xs">
              {statistics.seasonalData.map((item, idx) => (
                <div key={idx} className={`text-center p-2 rounded ${item.count > 0 ? 'bg-zinc-700' : 'bg-zinc-900'}`}>
                  <div className="text-zinc-400 font-medium">{item.month}</div>
                  <div className={`${item.count > 0 ? 'text-orange-400' : 'text-zinc-600'} font-bold`}>
                    {item.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Demographics Section */}
      {selectedView === 'demographics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Age Distribution (Detailed) */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Age Distribution (5-Year Groups)</h2>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={statistics.ageData} margin={{ bottom: 20, left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Legend />
                <Bar dataKey="count" fill="#8b5cf6" name="Count" />
                <Line type="monotone" dataKey="count" stroke="#ec4899" strokeWidth={2} name="Trend" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Top Repeat Offenders */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Top Repeat Offenders (3+ Arrests)</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Rank</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Name</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Arrests</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Unique Charges</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Age</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Gender</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.topRepeatOffenders.map((offender, index) => (
                    <tr key={index} className="border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          index === 0 ? 'bg-yellow-500 text-yellow-950' :
                          index === 1 ? 'bg-zinc-400 text-zinc-900' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-200 font-medium">{offender.name}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-600/20 text-indigo-300">
                          {offender.arrests}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-zinc-300">{offender.uniqueCharges}</td>
                      <td className="py-3 px-4 text-center text-zinc-300">{offender.age || 'N/A'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          offender.gender === 'MALE' ? 'bg-blue-600/20 text-blue-300' :
                          offender.gender === 'FEMALE' ? 'bg-pink-600/20 text-pink-300' :
                          'bg-zinc-600/20 text-zinc-300'
                        }`}>
                          {offender.gender}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Charges Section */}
      {selectedView === 'charges' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Most Common Charges */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Top 15 Most Common Charges</h2>
            <ResponsiveContainer width="100%" height={550}>
              <BarChart data={statistics.topCharges} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis 
                  dataKey="charge" 
                  type="category" 
                  width={280} 
                  stroke="#9ca3af"
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Bar dataKey="count" fill="#f59e0b">
                  {statistics.topCharges.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Officers Section */}
      {selectedView === 'officers' && (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Top Arresting Officers */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Top Arresting Officers (3+ Arrests)</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Rank</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Officer Name</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Total Arrests</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Unique Offenders</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Avg/Offender</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.topOfficers.map((officer, index) => (
                    <tr key={index} className="border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          index === 0 ? 'bg-yellow-500 text-yellow-950' :
                          index === 1 ? 'bg-zinc-400 text-zinc-900' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-200 font-medium">{officer.name}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-600/20 text-indigo-300">
                          {officer.arrests}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-zinc-300">{officer.uniqueOffenders}</td>
                      <td className="py-3 px-4 text-center text-zinc-400">{officer.avgPerOffender}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Officer Performance Chart */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Officer Arrests Visualization</h2>
            <ResponsiveContainer width="100%" height={650}>
              <BarChart data={statistics.topOfficers} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={180} 
                  stroke="#9ca3af"
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Legend />
                <Bar dataKey="arrests" fill="#06b6d4" name="Total Arrests">
                  {statistics.topOfficers.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                  ))}
                </Bar>
                <Bar dataKey="uniqueOffenders" fill="#10b981" name="Unique Offenders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Geographic Analysis Section */}
      {selectedView === 'geographic' && (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Housing Status */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Housing Status Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statistics.housingData}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry: any) => `${entry.status}: ${entry.percentage}%`}
                    >
                      {statistics.housingData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={['#10b981', '#ef4444', '#6b7280'][index]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#e4e4e7' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center space-y-4">
                {statistics.housingData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: ['#10b981', '#ef4444', '#6b7280'][index] }}></div>
                      <span className="text-zinc-200 font-medium">{item.status}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold text-xl">{item.count}</div>
                      <div className="text-zinc-400 text-sm">{item.percentage}%</div>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-4 bg-orange-600/10 border border-orange-600/30 rounded-lg">
                  <p className="text-orange-300 text-sm">
                    <strong>Key Insight:</strong> {statistics.housingData[1].percentage}% of arrestees are experiencing homelessness, 
                    which is significantly higher than the general population.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* City/Area Breakdown */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Geographic Distribution by Area</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={statistics.cityData} margin={{ top: 10, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis 
                  dataKey="city" 
                  stroke="#a1a1aa" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke="#a1a1aa" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Bar dataKey="count" fill="#3b82f6">
                  {statistics.cityData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Neighborhoods by Activity */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Arrest Activity by Neighborhood</h2>
            <p className="text-zinc-400 mb-4 text-sm">Neighborhoods with the most arrest records</p>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={statistics.topNeighborhoods} margin={{ top: 10, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis 
                  dataKey="location" 
                  stroke="#a1a1aa" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="#a1a1aa" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Bar dataKey="count" fill="#8b5cf6">
                  {statistics.topNeighborhoods.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Streets by Activity */}
          {statistics.topStreets.length > 0 ? (
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">High-Activity Streets (3+ Arrests)</h2>
              <p className="text-zinc-400 mb-4 text-sm">Streets with the most arrest activity (specific addresses not shown for privacy)</p>
              <div className="mb-4 text-zinc-400 text-xs">Found {statistics.topStreets.length} streets with 3+ arrests</div>
              <ResponsiveContainer width="100%" height={Math.max(450, statistics.topStreets.length * 35)}>
                <BarChart data={statistics.topStreets} layout="horizontal" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis type="number" stroke="#a1a1aa" />
                  <YAxis 
                    type="category" 
                    dataKey="location" 
                    stroke="#a1a1aa" 
                    width={200}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                    labelStyle={{ color: '#e4e4e7' }}
                  />
                  <Bar dataKey="count" fill="#f59e0b">
                    {statistics.topStreets.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.warm[index % COLORS.warm.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
                <p className="text-blue-300 text-sm">
                  <strong>Note:</strong> Street-level data shows general areas with higher arrest activity. This may indicate higher-traffic areas, facilities, or neighborhoods with more law enforcement presence.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">High-Activity Streets</h2>
              <p className="text-zinc-400 text-sm">No street data available with 3+ arrests. This could mean addresses are not in a parseable format.</p>
            </div>
          )}

          {/* Hourly Arrest Patterns */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">24-Hour Arrest Pattern Analysis</h2>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={statistics.hourlyData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                <defs>
                  <linearGradient id="colorHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis 
                  dataKey="label" 
                  stroke="#a1a1aa"
                  interval={1}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="#a1a1aa" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
                          <p className="text-white font-medium">{payload[0].payload.label}</p>
                          <p className="text-indigo-400">Arrests: {payload[0].value}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorHourly)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-4 bg-purple-600/10 border border-purple-600/30 rounded-lg">
                <p className="text-purple-300 text-sm">
                  <strong>Peak Hours:</strong> {(() => {
                    const maxHour = statistics.hourlyData.reduce((max, curr) => curr.count > max.count ? curr : max);
                    return `${maxHour.label} (${maxHour.count} arrests)`;
                  })()}
                </p>
              </div>
              <div className="p-4 bg-purple-600/10 border border-purple-600/30 rounded-lg">
                <p className="text-purple-300 text-sm">
                  <strong>Quietest Hour:</strong> {(() => {
                    const minHour = statistics.hourlyData.reduce((min, curr) => curr.count < min.count ? curr : min);
                    return `${minHour.label} (${minHour.count} arrests)`;
                  })()}
                </p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Recidivism Patterns Section */}
      {selectedView === 'recidivism' && (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Arrest Distribution */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Recidivism Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={statistics.recidivismData}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={(entry: any) => `${entry.category}`}
                    >
                      {statistics.recidivismData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#e4e4e7' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={statistics.recidivismData} margin={{ top: 10, right: 30, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis 
                      dataKey="category" 
                      stroke="#a1a1aa"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#a1a1aa" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#e4e4e7' }}
                    />
                    <Bar dataKey="count" fill="#8b5cf6">
                      {statistics.recidivismData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Key Recidivism Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-6 shadow-lg">
              <div className="text-green-100 text-sm font-medium mb-2">First-Time Offenders</div>
              <div className="text-white text-4xl font-bold mb-1">{statistics.firstTimeOffenders}</div>
              <div className="text-green-200 text-xs">
                {((statistics.firstTimeOffenders / statistics.totalOffenders) * 100).toFixed(1)}% of total
              </div>
            </div>
            <div className="bg-gradient-to-br from-yellow-600 to-yellow-700 rounded-lg p-6 shadow-lg">
              <div className="text-yellow-100 text-sm font-medium mb-2">Repeat Offenders (2+)</div>
              <div className="text-white text-4xl font-bold mb-1">{statistics.repeatOffenders}</div>
              <div className="text-yellow-200 text-xs">
                {((statistics.repeatOffenders / statistics.totalOffenders) * 100).toFixed(1)}% of total
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-lg p-6 shadow-lg">
              <div className="text-red-100 text-sm font-medium mb-2">Chronic Offenders (5+)</div>
              <div className="text-white text-4xl font-bold mb-1">{statistics.chronicOffenders}</div>
              <div className="text-red-200 text-xs">
                {((statistics.chronicOffenders / statistics.totalOffenders) * 100).toFixed(1)}% of total
              </div>
            </div>
          </div>

          {/* Top Repeat Offenders */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Individuals with Most Arrests</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Rank</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">Name</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Total Arrests</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">Unique Charges</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.topRepeatOffenders.map((offender, index) => (
                    <tr key={index} className="border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          index === 0 ? 'bg-yellow-500 text-yellow-950' :
                          index === 1 ? 'bg-zinc-400 text-zinc-900' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-200 font-medium">{offender.name}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-600/20 text-red-300">
                          {offender.arrests}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-zinc-300">{offender.uniqueCharges}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Age-Gender Recidivism Correlation */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Demographic Breakdown by Age Group & Gender</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={statistics.ageGenderData} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis 
                  dataKey="ageGroup" 
                  stroke="#a1a1aa"
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke="#a1a1aa" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Legend />
                <Bar dataKey="male" stackId="a" fill="#3b82f6" name="Male" />
                <Bar dataKey="female" stackId="a" fill="#ec4899" name="Female" />
                <Bar dataKey="other" stackId="a" fill="#6b7280" name="Other/Unknown" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 p-4 bg-indigo-600/10 border border-indigo-600/30 rounded-lg">
              <p className="text-indigo-300 text-sm">
                <strong>Analysis:</strong> The age group {(() => {
                  const maxGroup = statistics.ageGenderData.reduce((max, curr) => 
                    (curr.male + curr.female + curr.other) > (max.male + max.female + max.other) ? curr : max
                  );
                  return maxGroup.ageGroup;
                })()} has the highest number of offenders, with males representing the majority in all age categories.
              </p>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
