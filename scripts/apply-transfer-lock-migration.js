/**
 * One-off: apply call_sessions transfer lock + email_sent columns.
 * Usage: node scripts/apply-transfer-lock-migration.js
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function columnExists(column) {
  const { data, error } = await supabase.from('call_sessions').select(column).limit(1);
  if (error && (error.message || '').includes(column)) return false;
  if (error && /column|does not exist/i.test(error.message || '')) return false;
  return !error;
}

async function main() {
  const locked = await columnExists('facility_transfer_locked');
  const emailed = await columnExists('email_notification_sent');
  console.log({ facility_transfer_locked: locked, email_notification_sent: emailed });

  if (locked && emailed) {
    console.log('Columns already present — nothing to do.');
    return;
  }

  // PostgREST cannot run DDL. Prefer DATABASE_URL if present.
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error(
      'Columns missing and no DATABASE_URL/SUPABASE_DB_URL. Run migrations/add_call_sessions_transfer_lock_and_email_sent.sql in the Supabase SQL Editor.'
    );
    process.exit(2);
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = readFileSync(
    resolve(__dirname, '../migrations/add_call_sessions_transfer_lock_and_email_sent.sql'),
    'utf8'
  );
  await client.query(sql);
  await client.end();
  console.log('Migration applied via DATABASE_URL.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
