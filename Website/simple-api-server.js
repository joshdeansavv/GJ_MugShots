import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = 3001;
const HOST = '0.0.0.0';

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'Techandtime@25!!',
  database: 'bookings',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Middleware
app.use(cors());
app.use(express.json());

// Test database connection
app.get('/api/health', async (req, res) => {
  console.log('🔍 Health check requested');
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT 1 as test');
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

// Simple arrestees endpoint
app.get('/api/arrestees', async (req, res) => {
  console.log('🔍 Arrestees endpoint requested');
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection acquired');
    
    // Simple query to test
    const query = 'SELECT id, first_name, last_name FROM bookings LIMIT 10';
    console.log('🔍 Executing query:', query);
    
    const [rows] = await connection.execute(query);
    console.log('✅ Query executed, got', rows.length, 'rows');
    
    connection.release();
    
    // Return simple format
    const arrestees = rows.map(row => ({
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      middle_name: null,
      gender: 'UNKNOWN',
      date_of_birth: null,
      address: null,
      arrests: [{
        id: `${row.id}-1`,
        bookingDate: '2024-01-01',
        bookingTime: '12:00:00',
        arrestingOfficer: null,
        charges: ['Test Charge'],
        mugshotPath: null
      }]
    }));
    
    console.log('✅ Returning', arrestees.length, 'arrestees');
    res.json(arrestees);
    
  } catch (error) {
    console.error('❌ Arrestees endpoint failed:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`GJ Mugshots API server listening on http://${HOST}:${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/api/health`);
});
