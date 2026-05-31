import { Pool } from 'pg';

let pool;

export function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const db = getDb();
  const result = await db.query(sql, params);
  return result;
}
