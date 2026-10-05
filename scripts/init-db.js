import 'dotenv/config';
import { initDb, getPool } from '../lib/db.js';

async function main() {
  console.log('🚀 Initializing PostgreSQL Database Schema...');
  try {
    await initDb();
    console.log('✅ Schema initialized successfully (loans, installments, payments tables created).');
  } catch (err) {
    console.error('❌ Failed to initialize database schema:', err);
    process.exit(1);
  } finally {
    const pool = getPool();
    await pool.end();
  }
}

main();
