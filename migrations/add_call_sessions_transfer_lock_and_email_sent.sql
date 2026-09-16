-- Live phone agent hardening: bounce transfer lock + email dedupe flags.
ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS facility_transfer_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS email_notification_sent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN call_sessions.facility_transfer_locked IS
  'When true, transfer_to_facility must refuse further dials on this session/bounce journey.';
COMMENT ON COLUMN call_sessions.email_notification_sent IS
  'When true, a call-summary/message email was already sent for this session (dedupe).';
