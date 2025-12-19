-- Add call duration and conversation end detection settings to businesses table

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS max_call_duration_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS detect_conversation_end BOOLEAN DEFAULT TRUE;

-- Add comments
COMMENT ON COLUMN businesses.max_call_duration_minutes IS 'Maximum call duration in minutes. If set, the AI will end the call after this duration. NULL means no limit.';
COMMENT ON COLUMN businesses.detect_conversation_end IS 'If true, the AI will ask "Is there anything else I can help you with?" before ending calls. If the answer is no, it will move to closing and end the call.';

