-- Optional teardown: Kid Quiz Studio module removed from the app (key: kidquiz).
-- Backup first. Remove Storage buckets kidquiz-photos / kidquiz-videos in Supabase Dashboard if present.

BEGIN;

DROP TABLE IF EXISTS kidquiz_publishes CASCADE;
DROP TABLE IF EXISTS kidquiz_renders CASCADE;
DROP TABLE IF EXISTS kidquiz_answer_options CASCADE;
DROP TABLE IF EXISTS kidquiz_questions CASCADE;
DROP TABLE IF EXISTS kidquiz_projects CASCADE;
DROP TABLE IF EXISTS kidquiz_settings CASCADE;

DELETE FROM module_settings WHERE module_key = 'kidquiz';
DELETE FROM subscriptions WHERE module_key = 'kidquiz';
DELETE FROM modules WHERE key = 'kidquiz';

COMMIT;
