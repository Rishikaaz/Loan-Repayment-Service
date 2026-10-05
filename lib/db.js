import pg from 'pg';
const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    let connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/loan_db';
    
    // Remove query params that force strict verification on self-signed pooler certs
    const cleanConnectionString = connectionString.replace(/[\?&]sslmode=[^&]+/, '');
    
    const isSsl = process.env.DATABASE_SSL === 'true' || 
                  process.env.DATABASE_URL?.includes('sslmode=') || 
                  process.env.DATABASE_URL?.includes('supabase.com') ||
                  process.env.NODE_ENV === 'production';

    pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

/**
 * Initializes database schema automatically on startup or script run.
 * Creates loans, installments, and payments tables with strict integrity constraints.
 */
export async function initDb() {
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');

    // 1. Loans Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id VARCHAR(64) PRIMARY KEY,
        principal_paise BIGINT NOT NULL CHECK (principal_paise > 0),
        annual_interest_rate NUMERIC(6, 2) NOT NULL CHECK (annual_interest_rate >= 0),
        tenure_months INT NOT NULL CHECK (tenure_months > 0),
        disbursement_date DATE NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Installments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS installments (
        id SERIAL PRIMARY KEY,
        loan_id VARCHAR(64) NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        installment_number INT NOT NULL,
        due_date DATE NOT NULL,
        principal_component_paise BIGINT NOT NULL CHECK (principal_component_paise >= 0),
        interest_component_paise BIGINT NOT NULL CHECK (interest_component_paise >= 0),
        total_due_paise BIGINT NOT NULL CHECK (total_due_paise >= 0),
        amount_paid_paise BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_paise >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_loan_installment UNIQUE (loan_id, installment_number)
      );
    `);

    // 3. Payments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(64) PRIMARY KEY,
        loan_id VARCHAR(64) NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
        payment_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Indexes for fast retrieval
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON installments(loan_id);
      CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute query with automatic schema initialization fallback
 */
export async function query(text, params) {
  const p = getPool();
  try {
    return await p.query(text, params);
  } catch (err) {
    // If relation does not exist yet, auto-initialize
    if (err.code === '42P01') {
      await initDb();
      return await p.query(text, params);
    }
    throw err;
  }
}
