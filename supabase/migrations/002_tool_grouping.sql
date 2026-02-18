-- Migration: Add group_id for tool quantity grouping
-- Date: 2026-02-18
-- Description: Tools are stored individually but can be grouped for display.
--   Items with the same group_id share the same name/category/condition.
--   When adding "60 ladders", 60 rows are created with the same group_id.
--   Admin UI shows them grouped with quantity, but each can be transferred independently.

-- =====================================================
-- STEP 1: Add group_id column to inventory_items
-- =====================================================

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS group_id UUID DEFAULT gen_random_uuid();

-- =====================================================
-- STEP 2: Index for fast grouping queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_inventory_items_group_id 
ON public.inventory_items(group_id);

-- =====================================================
-- STEP 3: Set group_id for all existing items
-- (Each existing item gets its own unique group_id)
-- =====================================================

UPDATE public.inventory_items 
SET group_id = gen_random_uuid() 
WHERE group_id IS NULL;
