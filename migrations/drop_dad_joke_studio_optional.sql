-- Optional teardown: retired KiddConnect module `dad-joke-studio` (standalone studio, not Orbix).
-- Dad jokes in Orbix use `orbix_*` tables and DAD_JOKE_GENERATOR — do not confuse the two.
-- Backup first. Remove Supabase Storage buckets `dadjoke-studio-assets` / `dadjoke-studio-renders` in Dashboard if they exist.

BEGIN;

DROP TABLE IF EXISTS dadjoke_studio_publish_queue CASCADE;

-- Break GC ↔ render cycle before dropping render rows.
ALTER TABLE dadjoke_studio_generated_content
  DROP CONSTRAINT IF EXISTS fk_djs_gc_current_render;

DROP TABLE IF EXISTS dadjoke_studio_rendered_outputs CASCADE;
DROP TABLE IF EXISTS dadjoke_studio_generated_content CASCADE;

DROP TABLE IF EXISTS dadjoke_studio_ideas CASCADE;
DROP TABLE IF EXISTS dadjoke_studio_assets CASCADE;
DROP TABLE IF EXISTS dadjoke_studio_presets CASCADE;
DROP TABLE IF EXISTS dadjoke_studio_business_formats CASCADE;
DROP TABLE IF EXISTS dadjoke_studio_style_recipes CASCADE;
DROP TABLE IF EXISTS dadjoke_studio_formats CASCADE;

DELETE FROM module_settings WHERE module_key = 'dad-joke-studio';
DELETE FROM subscriptions WHERE module_key = 'dad-joke-studio';
DELETE FROM modules WHERE key = 'dad-joke-studio';

COMMIT;
