-- Check if AI agent is configured for a business
-- Replace the business_id with your actual business ID

-- Option 1: Check for specific business
SELECT 
  id,
  business_id,
  name,
  greeting_text,
  business_hours,
  faqs,
  message_settings,
  voice_settings,
  system_instructions,
  created_at,
  updated_at,
  deleted_at
FROM ai_agents
WHERE business_id = '7c4bde64-d914-4e61-8b84-fac0ab7e70bd'
  AND deleted_at IS NULL;

-- Option 2: Check all businesses and their AI agents
SELECT 
  b.id as business_id,
  b.email,
  b.name as business_name,
  a.id as agent_id,
  a.name as agent_name,
  a.greeting_text,
  a.deleted_at as agent_deleted
FROM businesses b
LEFT JOIN ai_agents a ON b.id = a.business_id AND a.deleted_at IS NULL
ORDER BY b.created_at DESC;

-- Option 3: Count AI agents per business
SELECT 
  business_id,
  COUNT(*) as agent_count,
  MAX(created_at) as latest_agent_created
FROM ai_agents
WHERE deleted_at IS NULL
GROUP BY business_id;

