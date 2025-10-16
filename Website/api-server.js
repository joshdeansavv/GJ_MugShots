import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001; // API server port
const HOST = '0.0.0.0';

// Database configuration
const dbConfig = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'Techandtime@25!!',
  database: 'bookings',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Enhanced caching system
let arresteesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours (longer cache since data updates daily)
const DAILY_REFRESH_HOUR = 10; // 10 AM
const DAILY_REFRESH_MINUTE = 5; // 10:05 AM
let isRefreshing = false;
let lastDataCheck = null;

// Enhanced preload data function with better error handling and data validation
async function preloadArresteesData(force = false) {
  if (isRefreshing && !force) {
    console.log('🔄 Data refresh already in progress, skipping...');
    return arresteesCache;
  }
  
  isRefreshing = true;
  const startTime = Date.now();
  console.log('🔄 Preloading arrestees data...');
  
  try {
    const connection = await pool.getConnection();
    
    // Query to get ALL data - NO FALLBACK LOGIC
    // If image_path exists in the record, use it. Otherwise NULL.
    const query = `
      SELECT 
        b1.id,
        b1.first_name,
        b1.middle_name,
        b1.last_name,
        b1.gender,
        b1.date_of_birth,
        b1.address,
        b1.booking_date,
        b1.booking_time,
        b1.raw_arrestor as arresting_officer,
        b1.charges,
        b1.source_pdf,
        b1.image_path as original_image_path,
        b1.image_path as mugshot_path,
        b1.created_at
      FROM bookings b1
      ORDER BY b1.id DESC
    `;
    
    const [rows] = await connection.execute(query);
    
    // Also get total count to verify we have all data
    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM bookings');
    const totalInDB = countResult[0].total;
    
    connection.release();
    
    console.log(`📊 Retrieved ${rows.length} booking records from database (DB total: ${totalInDB})`);
    
    if (rows.length !== totalInDB) {
      console.warn(`⚠️ WARNING: Retrieved ${rows.length} records but database contains ${totalInDB} total records!`);
    } else {
      console.log(`✅ SUCCESS: Retrieved ALL ${rows.length} records from database`);
    }
    
    // Process ALL records - NO GROUPING, show every single booking record
    console.log(`🔄 Processing ALL ${rows.length} booking records...`);
    
    // First, build a map of all addresses per person (for quick lookup)
    const personAddressesMap = new Map();
    rows.forEach(row => {
      const personKey = `${row.first_name}|${row.last_name}|${row.date_of_birth}`;
      if (!personAddressesMap.has(personKey)) {
        personAddressesMap.set(personKey, new Map());
      }
      
      if (row.address && row.address.trim()) {
        const addressMap = personAddressesMap.get(personKey);
        const addr = row.address.trim();
        const existing = addressMap.get(addr);
        
        // Keep the most recent booking date for each address
        if (!existing || new Date(row.booking_date) > new Date(existing.bookingDate)) {
          addressMap.set(addr, {
            address: addr,
            bookingDate: row.booking_date,
            bookingTime: row.booking_time
          });
        }
      }
    });
    
    const arrestees = rows.map((row, index) => {
      // Parse charges with better error handling
      let charges = [];
      if (row.charges) {
        try {
          charges = row.charges
            .split(';')
            .map((charge) => charge.trim())
            .filter((charge) => charge.length > 0);
        } catch (e) {
          console.warn(`⚠️ Error parsing charges for booking ${row.id}:`, e);
          charges = [row.charges.substring(0, 100)]; // Fallback to raw charges
        }
      }
      
      // Get all addresses for this person
      const personKey = `${row.first_name}|${row.last_name}|${row.date_of_birth}`;
      const addressMap = personAddressesMap.get(personKey);
      const addresses = addressMap ? Array.from(addressMap.values()).sort((a, b) => {
        const dateA = new Date(a.bookingDate);
        const dateB = new Date(b.bookingDate);
        if (dateA.getTime() !== dateB.getTime()) {
          return dateB - dateA;
        }
        if (a.bookingTime && b.bookingTime) {
          return b.bookingTime.localeCompare(a.bookingTime);
        }
        return 0;
      }) : [];
      
      // Create individual arrestee record for each booking
      return {
        id: row.id,
        first_name: row.first_name || '',
        middle_name: row.middle_name || '',
        last_name: row.last_name || '',
        gender: row.gender || '',
        date_of_birth: row.date_of_birth || '',
        address: row.address || '',
        addresses: addresses.map(addr => ({
          address: addr.address,
          bookingDate: new Date(addr.bookingDate).toISOString(),
          bookingTime: addr.bookingTime
        })),
        arrests: [{
          id: row.id.toString(),
          bookingDate: new Date(row.booking_date).toISOString(),
          bookingTime: row.booking_time || '',
          arrestingOfficer: row.arresting_officer || '',
          charges: charges,
          mugshotPath: row.mugshot_path ? `/images/${row.mugshot_path.replace('images/', '')}` : null,
          originalMugshotPath: row.original_image_path ? `/images/${row.original_image_path.replace('images/', '')}` : null,
          sourcePdf: row.source_pdf || null,
          address: row.address || null
        }]
      };
    });
    
    console.log(`✅ Processed ALL ${arrestees.length} individual booking records`);
    
    // Sort all records by booking date (most recent first)
    const newCache = arrestees.sort((a, b) => new Date(b.arrests[0].bookingDate) - new Date(a.arrests[0].bookingDate));
    
    arresteesCache = newCache;
    cacheTimestamp = Date.now();
    lastDataCheck = new Date();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Successfully cached ALL ${arresteesCache.length} individual booking records in ${duration}ms`);
    
    return arresteesCache;
  } catch (error) {
    console.error('❌ Failed to preload data:', error);
    throw error;
  } finally {
    isRefreshing = false;
  }
}

// Check if cache is valid
function isCacheValid() {
  return arresteesCache && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION;
}

// Smart cache management functions
function shouldRefreshNow() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Check if it's around daily refresh time (10:05 AM ± 5 minutes)
  if (hour === DAILY_REFRESH_HOUR && minute >= DAILY_REFRESH_MINUTE && minute <= DAILY_REFRESH_MINUTE + 5) {
    // Only refresh once per day at this time
    if (!lastDataCheck || lastDataCheck.toDateString() !== now.toDateString()) {
      return true;
    }
  }
  
  // Also refresh if cache is completely stale (older than 12 hours)
  if (!cacheTimestamp || (Date.now() - cacheTimestamp) > (12 * 60 * 60 * 1000)) {
    return true;
  }
  
  return false;
}

// Schedule daily cache warming at 10:05 AM
function scheduleNextDailyRefresh() {
  const now = new Date();
  const nextRefresh = new Date();
  
  nextRefresh.setHours(DAILY_REFRESH_HOUR, DAILY_REFRESH_MINUTE, 0, 0);
  
  // If we've passed today's refresh time, schedule for tomorrow
  if (nextRefresh <= now) {
    nextRefresh.setDate(nextRefresh.getDate() + 1);
  }
  
  const timeUntilRefresh = nextRefresh - now;
  console.log(`📅 Next automatic cache refresh scheduled for ${nextRefresh.toLocaleString()}`);
  
  setTimeout(async () => {
    console.log('⏰ Daily cache refresh triggered');
    try {
      await preloadArresteesData(true); // Force refresh
      scheduleNextDailyRefresh(); // Schedule next refresh
    } catch (error) {
      console.error('❌ Daily cache refresh failed:', error);
      // Retry in 5 minutes if it fails
      setTimeout(() => scheduleNextDailyRefresh(), 5 * 60 * 1000);
    }
  }, timeUntilRefresh);
}

// Periodic health check (every 5 minutes) - only refresh if needed
setInterval(async () => {
  if (shouldRefreshNow()) {
    console.log('🔄 Smart cache refresh triggered');
    try {
      await preloadArresteesData();
    } catch (error) {
      console.error('❌ Smart cache refresh failed:', error);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Middleware
app.use(cors());
app.use(express.json());

// Serve static images from the Core_Script images directory
const imagesPath = path.join(__dirname, '..', 'Core_Script', 'images');
app.use('/images', express.static(imagesPath));

// Root route for simple health check in browser
app.get('/', (req, res) => {
  res.status(200).send('GJ Mugshots API is running');
});

// Lightweight request logger for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Test database connection
app.get('/api/health', async (req, res) => {
  console.log('🔍 Health check requested');
  try {
    console.log('🔗 Attempting database connection...');
    const connection = await pool.getConnection();
    console.log('✅ Database connection acquired');
    
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Database query executed');
    connection.release();
    
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Manual cache refresh endpoint
app.post('/api/refresh-cache', async (req, res) => {
  console.log('🔄 Manual cache refresh requested');
  try {
    await preloadArresteesData(true); // Force refresh
    res.json({ 
      status: 'success', 
      message: 'Cache refreshed successfully',
      timestamp: new Date().toISOString(),
      recordCount: arresteesCache ? arresteesCache.length : 0
    });
  } catch (error) {
    console.error('❌ Manual cache refresh failed:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get all arrestees - enhanced with caching
app.get('/api/arrestees', async (req, res) => {
  console.log('🔍 Arrestees endpoint requested');
  
  try {
    // Try to serve from cache first
    if (isCacheValid() && arresteesCache) {
      console.log(`✅ Serving ${arresteesCache.length} arrestees from cache (${Math.round((Date.now() - cacheTimestamp) / 1000 / 60)} minutes old)`);
      
      // Set cache headers to allow client-side caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate', // Disable caching for live updates
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date(cacheTimestamp).toUTCString(),
      'ETag': `"${cacheTimestamp}"`,
      'X-Cache': 'HIT',
      'X-Cache-Age': Math.round((Date.now() - cacheTimestamp) / 1000)
    });
      
      // Check for conditional requests
      const ifModifiedSince = req.headers['if-modified-since'];
      const ifNoneMatch = req.headers['if-none-match'];
      
      if (ifModifiedSince && new Date(ifModifiedSince) >= new Date(cacheTimestamp)) {
        return res.status(304).end();
      }
      
      if (ifNoneMatch && ifNoneMatch === `"${cacheTimestamp}"`) {
        return res.status(304).end();
      }
      
      return res.json(arresteesCache);
    }
    
    console.log('⚠️ Cache miss or invalid - fetching fresh data from database');
    
    // Cache miss or invalid - fetch fresh data
    const freshData = await preloadArresteesData(true);
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate', // Disable caching for live updates
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date(cacheTimestamp).toUTCString(),
      'ETag': `"${cacheTimestamp}"`,
      'X-Cache': 'MISS',
      'X-Cache-Age': '0'
    });
    
    console.log(`✅ Served ${freshData.length} arrestees from fresh database query`);
    res.json(freshData);
    
  } catch (error) {
    console.error('❌ Database error:', error);
    
    // Try to serve stale cache if available
    if (arresteesCache) {
      console.log('🔄 Serving stale cache due to database error');
      res.set({
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800', // Shorter cache on error
        'X-Cache': 'STALE-ERROR',
        'X-Cache-Age': Math.round((Date.now() - cacheTimestamp) / 1000)
      });
      return res.json(arresteesCache);
    }
    
    res.status(500).json({ 
      error: 'Database query failed', 
      details: error.message,
      suggestion: 'Please check your database configuration in api-server.js'
    });
  }
});

// Get single arrestee by ID
app.get('/api/arrestees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    const query = `
      SELECT 
        b1.id,
        b1.first_name,
        b1.middle_name,
        b1.last_name,
        b1.gender,
        b1.date_of_birth,
        b1.address,
        b1.booking_date,
        b1.booking_time,
        b1.raw_arrestor as arresting_officer,
        b1.charges,
        b1.source_pdf,
        b1.image_path as original_image_path,
        b1.image_path as mugshot_path
      FROM bookings b1
      WHERE b1.id = ?
    `;
    
    const [rows] = await connection.execute(query, [id]);
    connection.release();
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Arrestee not found' });
    }
    
    const row = rows[0];
    
    // Parse charges from the text field
    let charges = [];
    if (row.charges) {
      charges = row.charges.split(';').map(charge => charge.trim()).filter(charge => charge.length > 0);
    }
    
    // Get ALL arrests for this person (same name + DOB)
    const allArrestsQuery = `
      SELECT 
        id,
        booking_date,
        booking_time,
        raw_arrestor as arresting_officer,
        charges,
        image_path as original_mugshot_path,
        image_path as mugshot_path,
        source_pdf,
        address
      FROM bookings
      WHERE first_name = ? AND last_name = ? AND date_of_birth = ?
      ORDER BY booking_date DESC
    `;
    
    const connection2 = await pool.getConnection();
    const [allArrestRows] = await connection2.execute(allArrestsQuery, [
      row.first_name, 
      row.last_name, 
      row.date_of_birth
    ]);
    connection2.release();
    
    // Create arrests array from all bookings for this person
    const arrests = allArrestRows.map(arrestRow => {
      let arrestCharges = [];
      if (arrestRow.charges) {
        arrestCharges = arrestRow.charges.split(';').map(charge => charge.trim()).filter(charge => charge.length > 0);
      }
      
      return {
        id: arrestRow.id.toString(),
        bookingDate: arrestRow.booking_date,
        bookingTime: arrestRow.booking_time,
        arrestingOfficer: arrestRow.arresting_officer,
        charges: arrestCharges,
        mugshotPath: arrestRow.mugshot_path ? `/images/${arrestRow.mugshot_path.replace('images/', '')}` : null,
        originalMugshotPath: arrestRow.original_mugshot_path ? `/images/${arrestRow.original_mugshot_path.replace('images/', '')}` : null,
        sourcePdf: arrestRow.source_pdf || null,
        address: arrestRow.address || null
      };
    });
    
    // Collect all unique addresses with their most recent booking date
    const addressMap = new Map();
    allArrestRows.forEach(arrestRow => {
      if (arrestRow.address && arrestRow.address.trim()) {
        const addr = arrestRow.address.trim();
        const existingEntry = addressMap.get(addr);
        
        // Keep the most recent booking date for each address
        if (!existingEntry || new Date(arrestRow.booking_date) > new Date(existingEntry.bookingDate)) {
          addressMap.set(addr, {
            address: addr,
            bookingDate: arrestRow.booking_date,
            bookingTime: arrestRow.booking_time
          });
        }
      }
    });
    
    // Convert to array and sort by booking date (most recent first)
    const addresses = Array.from(addressMap.values()).sort((a, b) => {
      const dateA = new Date(a.bookingDate);
      const dateB = new Date(b.bookingDate);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateB - dateA;
      }
      // If dates are same, sort by time if available
      if (a.bookingTime && b.bookingTime) {
        return b.bookingTime.localeCompare(a.bookingTime);
      }
      return 0;
    });

    const arrestee = {
      id: row.id,
      first_name: row.first_name || '',
      middle_name: row.middle_name,
      last_name: row.last_name || '',
      gender: row.gender,
      date_of_birth: row.date_of_birth,
      address: row.address, // Keep for backwards compatibility
      addresses: addresses, // New: all unique addresses
      arrests: arrests
    };
    
    res.json(arrestee);
    
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Database query failed', 
      details: error.message 
    });
  }
});

// Search arrestees
app.get('/api/search', async (req, res) => {
  try {
    const {
      first_name: qFirstRaw,
      middle_name: qMiddleRaw,
      last_name: qLastRaw,
      address: qAddressRaw,
      gender: qGenderRaw,
      age_min: qAgeMinRaw,
      age_max: qAgeMaxRaw,
      date_of_birth: qDobRaw,
      booking_date: qBookingRaw,
      booking_date_from: qFromRaw,
      booking_date_to: qToRaw,
      limit: qLimitRaw = 50,
      offset: qOffsetRaw = 0
    } = req.query;

    const getStr = (v) => (Array.isArray(v) ? v[0] : v);

    // Input validation and sanitization - SQL injection protection
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return null;
      const cleaned = str.trim().replace(/['";\\-]/g, '');
      return cleaned.length > 0 ? cleaned.substring(0, 100) : null;
    };

    const sanitizeDate = (dateStr) => {
      if (typeof dateStr !== 'string') return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : dateStr;
    };

    const normalizeDOB = (dobStr) => {
      if (typeof dobStr !== 'string') return null;
      // Accept MM/DD/YYYY directly
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) return dobStr;
      // Accept YYYY-MM-DD and convert to MM/DD/YYYY for stored format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
        const [y, m, d] = dobStr.split('-');
        return `${m}/${d}/${y}`;
      }
      return null;
    };

    const safeLimit = Math.min(Math.max(1, parseInt(getStr(qLimitRaw)) || 50), 200);
    const safeOffset = Math.max(0, parseInt(getStr(qOffsetRaw)) || 0);

    const first = sanitizeString(getStr(qFirstRaw));
    const middle = sanitizeString(getStr(qMiddleRaw));
    const last = sanitizeString(getStr(qLastRaw));
    const address = sanitizeString(getStr(qAddressRaw));
    const gender = sanitizeString(getStr(qGenderRaw));
    const ageMinStr = getStr(qAgeMinRaw);
    const ageMaxStr = getStr(qAgeMaxRaw);
    const ageMin = ageMinStr != null && ageMinStr !== '' && !isNaN(parseInt(ageMinStr)) ? Math.max(0, Math.min(120, parseInt(ageMinStr))) : null;
    const ageMax = ageMaxStr != null && ageMaxStr !== '' && !isNaN(parseInt(ageMaxStr)) ? Math.max(0, Math.min(120, parseInt(ageMaxStr))) : null;
    const dob = normalizeDOB(getStr(qDobRaw));
    const booking = sanitizeDate(getStr(qBookingRaw));
    const fromDate = sanitizeDate(getStr(qFromRaw));
    const toDate = sanitizeDate(getStr(qToRaw));

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (first !== null) {
      whereClause += ' AND b1.first_name LIKE ?';
      params.push(`%${first}%`);
    }
    if (middle !== null) {
      whereClause += ' AND b1.middle_name LIKE ?';
      params.push(`%${middle}%`);
    }
    if (last !== null) {
      whereClause += ' AND b1.last_name LIKE ?';
      params.push(`%${last}%`);
    }
    if (address !== null) {
      whereClause += ' AND b1.address LIKE ?';
      params.push(`%${address}%`);
    }
    if (gender !== null && gender !== 'ALL' && ['MALE', 'FEMALE', 'NON-BINARY', 'OTHER', 'UNKNOWN'].includes(gender)) {
      whereClause += ' AND b1.gender = ?';
      params.push(gender);
    }
    if (dob !== null) {
      whereClause += ' AND b1.date_of_birth = ?';
      params.push(dob);
    }
    // Age filtering computed from date_of_birth string using MySQL functions
    if (ageMin !== null) {
      whereClause += " AND b1.date_of_birth IS NOT NULL AND b1.date_of_birth <> '' AND TIMESTAMPDIFF(YEAR, STR_TO_DATE(b1.date_of_birth, '%m/%d/%Y'), CURDATE()) >= ?";
      params.push(ageMin);
    }
    if (ageMax !== null) {
      whereClause += " AND b1.date_of_birth IS NOT NULL AND b1.date_of_birth <> '' AND TIMESTAMPDIFF(YEAR, STR_TO_DATE(b1.date_of_birth, '%m/%d/%Y'), CURDATE()) <= ?";
      params.push(ageMax);
    }
    // Exact booking date match
    if (booking !== null) {
      whereClause += ' AND DATE(b1.booking_date) = ?';
      params.push(booking);
    }
    if (fromDate !== null) {
      whereClause += ' AND b1.booking_date >= ?';
      params.push(fromDate);
    }
    if (toDate !== null) {
      whereClause += ' AND b1.booking_date <= ?';
      params.push(toDate);
    }

    const baseQuery = `
      SELECT 
        b1.id,
        b1.first_name,
        b1.middle_name,
        b1.last_name,
        b1.gender,
        b1.date_of_birth,
        b1.address,
        b1.booking_date,
        b1.booking_time,
        b1.raw_arrestor as arresting_officer,
        b1.charges,
        b1.source_pdf,
        b1.image_path as original_image_path,
        b1.image_path as mugshot_path
      FROM bookings b1
      ${whereClause}
      ORDER BY b1.booking_date DESC, b1.last_name, b1.first_name
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `;

    // Debug log
    console.log('Search where/params:', whereClause, params);

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(baseQuery, params);
    connection.release();

    const arrestees = rows.map((row) => {
      let charges = [];
      if (row.charges) {
        charges = row.charges
          .split(';')
          .slice(0, 3)
          .map((charge) => charge.trim())
          .filter((charge) => charge.length > 0);
      }

      return {
        id: row.id,
        first_name: row.first_name || '',
        middle_name: row.middle_name,
        last_name: row.last_name || '',
        gender: row.gender,
        date_of_birth: row.date_of_birth,
        address: row.address,
        arrests: [
          {
            id: row.id.toString(),
            bookingDate: row.booking_date,
            bookingTime: row.booking_time,
            arrestingOfficer: row.arresting_officer,
            charges: charges,
            mugshotPath: row.mugshot_path ? `/images/${row.mugshot_path.replace('images/', '')}` : null,
            originalMugshotPath: row.original_image_path ? `/images/${row.original_image_path.replace('images/', '')}` : null,
            sourcePdf: row.source_pdf || null,
            address: row.address || null
          },
        ],
      };
    });

    res.json({ arrestees, total: Math.min(rows.length, 100) });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database search failed', details: error.message });
  }
});

// Serve PDF files
app.get('/api/pdf/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security: Only allow PDF files and prevent directory traversal
    if (!filename.toLowerCase().endsWith('.pdf') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // PDF files are in the Core_Script archive directory
    const pdfPath = path.join(__dirname, '..', 'Core_Script', 'archive', filename);
    
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    // Set headers for PDF viewing
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('❌ PDF serving error:', error);
    res.status(500).json({ error: 'Failed to serve PDF' });
  }
});

// Initialize cache on server startup
async function initializeServer() {
  console.log('🚀 Initializing GJ Mugshots API server...');
  
  try {
    // Pre-warm the cache on startup
    console.log('🔥 Pre-warming data cache...');
    await preloadArresteesData(true);
    
    // Schedule the daily refresh system
    scheduleNextDailyRefresh();
    
    console.log('✅ Server initialization complete');
  } catch (error) {
    console.error('⚠️ Failed to pre-warm cache on startup:', error);
    console.log('🔄 Cache will be populated on first request');
    
    // Still schedule daily refresh even if initial load fails
    scheduleNextDailyRefresh();
  }
}

app.listen(PORT, HOST, async () => {
  console.log(`🌐 GJ Mugshots API server listening on http://${HOST}:${PORT}`);
  console.log(`🏥 Health check: http://${HOST}:${PORT}/api/health`);
  console.log(`📊 Arrestees endpoint: http://${HOST}:${PORT}/api/arrestees`);
  
  // Initialize cache warming system
  await initializeServer();
});
