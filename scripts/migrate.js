import dotenv from 'dotenv';
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set!');
  console.error('Get these from your Supabase project settings:');
  console.error('  - Project URL: Settings → API → Project URL');
  console.error('  - Service Role Key: Settings → API → service_role key (secret)');
  process.exit(1);
}

console.log('✅ Using Supabase client');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Execute SQL using Supabase REST API
const executeSQL = async (sql) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    // If exec_sql function doesn't exist, try direct SQL execution via PostgREST
    // For table creation, we'll use a different approach
    throw new Error(`SQL execution failed: ${response.statusText}`);
  }

  return response.json();
};

const runMigrations = async () => {
  try {
    console.log('🔄 Running database migrations...');
    
    // Use Supabase REST API to execute SQL
    // Note: Supabase doesn't support raw SQL via REST API directly
    // We'll use the SQL editor approach or create tables via Supabase client
    
    // For now, let's create a simple migration that uses Supabase's table creation
    // via the management API or we can provide SQL to run in Supabase dashboard
    
    console.log('⚠️  Supabase migrations need to be run via SQL Editor');
    console.log('📝 Please run the following SQL in your Supabase SQL Editor:');
    console.log('');
    console.log('-- Copy and paste this into Supabase Dashboard → SQL Editor → New Query');
    console.log('');
    
    const migrationSQL = `
-- Create businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan_tier VARCHAR(50) DEFAULT 'starter',
  usage_limit_minutes INTEGER DEFAULT 1000,
  voximplant_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'owner',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create ai_agents table
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) DEFAULT 'AI Assistant',
  greeting_text TEXT,
  business_hours JSONB,
  faqs JSONB DEFAULT '[]'::jsonb,
  message_settings JSONB DEFAULT '{}'::jsonb,
  voice_settings JSONB DEFAULT '{}'::jsonb,
  system_instructions TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create call_sessions table
CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  voximplant_call_id VARCHAR(255) UNIQUE NOT NULL,
  caller_number VARCHAR(50),
  caller_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'ringing',
  duration_seconds INTEGER DEFAULT 0,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  recording_url TEXT,
  transcript TEXT,
  intent VARCHAR(50),
  message_taken BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
  caller_name VARCHAR(255),
  caller_phone VARCHAR(50) NOT NULL,
  caller_email VARCHAR(255),
  message_text TEXT NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(50) DEFAULT 'new',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Create usage_minutes table
CREATE TABLE IF NOT EXISTS usage_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
  minutes_used DECIMAL(10, 2) NOT NULL,
  date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_businesses_id ON businesses(id);
CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_ai_agents_business_id ON ai_agents(business_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_business_id ON call_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_voximplant_call_id ON call_sessions(voximplant_call_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_call_session_id ON messages(call_session_id);
CREATE INDEX IF NOT EXISTS idx_usage_minutes_business_id ON usage_minutes(business_id);
CREATE INDEX IF NOT EXISTS idx_usage_minutes_date ON usage_minutes(date);
CREATE INDEX IF NOT EXISTS idx_usage_minutes_month_year ON usage_minutes(business_id, year, month);
`;

    console.log(migrationSQL);
    console.log('');
    console.log('✅ After running the SQL above, your database will be ready!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migrations
runMigrations()
  .then(() => {
    console.log('✅ Migration instructions displayed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
