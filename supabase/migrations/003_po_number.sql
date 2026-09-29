-- Migration: PO number and purchase date on tools
-- Date: 2026-09-28
-- Description: Record which purchase order each tool was bought on, and when.
--   Additive only: two new optional columns and an index. Existing tools get empty values;
--   nothing is removed or rewritten. The website works with or without these columns.

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS po_number text;

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS purchase_date date;

-- Find all tools on a PO quickly, within a company
CREATE INDEX IF NOT EXISTS idx_inventory_items_company_po_number
ON public.inventory_items (company_id, po_number);

-- Make the website see the new columns right away (Supabase's API caches the table layout)
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- ROLLBACK (run only to undo this migration; this DELETES any PO numbers and dates entered)
-- =====================================================
-- DROP INDEX IF EXISTS public.idx_inventory_items_company_po_number;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS purchase_date;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS po_number;
-- NOTIFY pgrst, 'reload schema';
