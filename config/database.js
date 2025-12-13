import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

// Create Supabase client with service role key (has full database access)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Note: Models should use supabaseClient directly for all database operations
// This query function is kept for backward compatibility but may not work for all cases
export const query = async (text, params = []) => {
  console.warn('⚠️ Using raw SQL query - consider using Supabase client methods instead');
  // For complex queries, use Supabase SQL Editor or create RPC functions
  throw new Error('Raw SQL queries not supported. Use Supabase client methods or create RPC functions.');
};

// Direct Supabase client access for table operations (preferred method)
export const supabaseClient = supabase;

// Helper for table operations
export const from = (table) => supabase.from(table);

// Helper to get a client (for compatibility with existing code)
export const getClient = async () => {
  return supabase;
};

export default supabase;

