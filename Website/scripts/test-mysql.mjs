import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'Techandtime@25!!',
    database: 'bookings',
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 5000
  });

  console.log('Getting connection...');
  const conn = await pool.getConnection();
  console.log('Connected. Running SELECT 1...');
  const [rows] = await conn.execute('SELECT 1 as test');
  console.log('Result:', rows);
  conn.release();
  await pool.end();
}

main().catch((err) => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});


