-- Facility human-handoff (AI phone agent): track attempts and post-failure re-offer gating.
ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS facility_transfer_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS facility_transfer_suppress_until_explicit BOOLEAN NOT NULL DEFAULT FALSE;
