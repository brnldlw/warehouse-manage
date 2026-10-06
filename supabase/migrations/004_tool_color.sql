-- Migration: tool color
-- Date: 2026-10-05
-- Description: An optional color on each tool (e.g. "red" for the red Milwaukee drill), so
--   people can tell similar tools apart. Additive only: one new optional column. Existing tools
--   get no color; nothing is removed or rewritten. The website works with or without it.
--   The app stores one of: red, orange, yellow, green, blue, purple, pink, brown, black,
--   white, gray, silver (or nothing).

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS color text;

-- Make the website see the new column right away (Supabase's API caches the table layout)
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- ROLLBACK (run only to undo this migration; this DELETES any colors entered)
-- =====================================================
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS color;
-- NOTIFY pgrst, 'reload schema';
