# Database objects — YouTube / studio vertical (from repo migrations)

**Live DB may differ** — run `docs/supabase-schema-introspection.sql` §7 on Supabase.

## Kid Quiz Studio
- `kidquiz_settings`
- `kidquiz_projects`
- `kidquiz_questions`
- `kidquiz_answer_options`
- `kidquiz_renders`
- `kidquiz_publishes`

## Orbix Network (core + longform + extras)
**Core** (`create_orbix_network_tables.sql`):
- `orbix_sources`
- `orbix_raw_items`
- `orbix_stories`
- `orbix_scripts`
- `orbix_review_queue`
- `orbix_renders`
- `orbix_publishes`
- `orbix_analytics_daily`

**Channels** (`add_orbix_channels.sql`):
- `orbix_channels`

**Longform** (`add_orbix_longform_tables.sql`):
- `orbix_puzzles`
- `orbix_puzzle_explanations`
- `orbix_longform_videos`
- `orbix_longform_video_puzzles`

**Other** (migration filenames):
- `orbix_deleted_riddles` (`add_orbix_deleted_riddles.sql`)

Additional columns / enums were added across many `add_orbix_*.sql` and channel-support migrations — introspect production.

## Movie Review Studio
- `movie_review_projects`
- `movie_review_assets`
- `movie_review_timeline_items`
- `movie_review_renders`

## Shared (not YouTube-only but required today)
- `module_settings` — keys like `kidquiz`, `orbix-network`, `movie-review` (legacy rows may still use `dad-joke-studio`)
- `modules`, `businesses`, `users`, `organization_users` — see `SHARED_CORE_PREREQUISITES.md`

## Storage buckets

**Production list:** see **`STORAGE_BUCKETS.md`** (live Supabase snapshot: Kid Quiz, Movie Review, Orbix, `website-hero`; legacy `dadjoke-studio-*` buckets may still exist if migrations ran historically).

Env examples: `SUPABASE_STORAGE_BUCKET_KIDQUIZ_RENDERS` / `kidquiz-videos`; migrations also reference Orbix music/backgrounds policies in `add_orbix_*` SQL files.
