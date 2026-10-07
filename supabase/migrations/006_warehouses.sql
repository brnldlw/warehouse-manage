-- Migration: multiple warehouses per company
-- Date: 2026-10-06
-- Description:
--   A company can have several warehouses (e.g. "Main Warehouse", "HVAC/R Tool Crib",
--   "North Shop"). Every tool gets a HOME warehouse (where it belongs, even while it's out on a
--   van) and, while it is in a warehouse, a CURRENT warehouse (where it physically is now).
--
--   Additive only: one new table, two new optional columns on inventory_items, indexes, one
--   small guard trigger. Nothing is deleted or renamed. Existing tools are only given their new
--   warehouse values; their location, van, condition, history etc. are not touched.
--   Safe to run twice. The website works with or without this migration.

-- =====================================================================================
-- 1. The warehouses table
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  address     text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- No two warehouses in the same company with the same name, ignoring capitals and spaces at the
-- ends ("North Shop" = "north shop "). Different companies may use the same names.
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_company_name_key
  ON public.warehouses (company_id, lower(btrim(name)));

-- =====================================================================================
-- 2. Security rules (RLS) for warehouses
--    Without these, anyone holding the website's public key could read every company's
--    warehouses. "Your company" and "active admin" are worked out exactly like the existing
--    tables and the 005 triggers: from YOUR row in user_profiles (the one whose id is the
--    signed-in user).
-- =====================================================================================
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- Not signed in: no access at all. Signed in: read, add, edit — never delete (deactivate instead).
-- The server (service role) and the SQL editor keep full access, as for every table.
REVOKE ALL ON public.warehouses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;

-- Rule 1 — READ: anyone signed in can see the warehouses of their own company, and only those.
DROP POLICY IF EXISTS "Company members can read their warehouses" ON public.warehouses;
CREATE POLICY "Company members can read their warehouses"
  ON public.warehouses FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.user_profiles p WHERE p.id = auth.uid()));

-- Rule 2 — ADD: only an ACTIVE ADMIN can add a warehouse, and only to their own company.
DROP POLICY IF EXISTS "Active admins can add warehouses" ON public.warehouses;
CREATE POLICY "Active admins can add warehouses"
  ON public.warehouses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = warehouses.company_id
      AND p.role = 'admin'
      AND p.is_active IS NOT FALSE
      AND coalesce(p.status, 'active') <> 'inactive'));

-- Rule 3 — EDIT (rename, address, notes, deactivate/reactivate): only an ACTIVE ADMIN of the
-- warehouse's company, and the warehouse can't be moved to another company.
DROP POLICY IF EXISTS "Active admins can edit warehouses" ON public.warehouses;
CREATE POLICY "Active admins can edit warehouses"
  ON public.warehouses FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = warehouses.company_id
      AND p.role = 'admin'
      AND p.is_active IS NOT FALSE
      AND coalesce(p.status, 'active') <> 'inactive'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = warehouses.company_id
      AND p.role = 'admin'
      AND p.is_active IS NOT FALSE
      AND coalesce(p.status, 'active') <> 'inactive'));

-- Rule 4 — DELETE: there is no delete rule (and no delete permission), so nobody can delete a
-- warehouse from the website. Deactivate it instead; its history stays intact.

-- =====================================================================================
-- 3. New columns on tools
-- =====================================================================================
-- Where the tool belongs (stays set while the tool is out on a van).
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS home_warehouse_id uuid REFERENCES public.warehouses(id);
-- Which warehouse it is physically in right now (only while location_type = 'warehouse').
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS current_warehouse_id uuid REFERENCES public.warehouses(id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_company_home_warehouse
  ON public.inventory_items (company_id, home_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_company_current_warehouse
  ON public.inventory_items (company_id, current_warehouse_id);

-- =====================================================================================
-- 4. Guard: keep the warehouse columns sensible whatever writes to tools
--    (the new app, an older copy of the app still open in someone's browser, Bulk Import,
--    deleting a van, the SQL editor):
--    - a tool with no home warehouse gets its company's default one (below);
--    - a tool in a warehouse with no current warehouse is in its home warehouse;
--    - a tool on a van has no current warehouse;
--    - a tool can only point at warehouses of ITS OWN company.
--    It never touches location_type or the van, so it can't create transfer history.
-- =====================================================================================

-- The company's default warehouse: the active "Main Warehouse" if there is one, otherwise the
-- oldest active warehouse, otherwise the oldest one.
CREATE OR REPLACE FUNCTION public.default_warehouse_for(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT w.id FROM public.warehouses w
  WHERE w.company_id = p_company_id
  ORDER BY w.is_active DESC, (lower(btrim(w.name)) = 'main warehouse') DESC, w.created_at, w.id
  LIMIT 1;
$$;
-- Only used inside the database (the guard below), not callable from the website.
REVOKE ALL ON FUNCTION public.default_warehouse_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inventory_items_warehouse_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER            -- reads warehouses whatever the caller's own read rules are
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;             -- very old rows without a company: leave them alone
  END IF;

  IF NEW.home_warehouse_id IS NULL THEN
    NEW.home_warehouse_id := public.default_warehouse_for(NEW.company_id);
  END IF;

  IF coalesce(NEW.location_type, 'warehouse') = 'warehouse' THEN
    IF NEW.current_warehouse_id IS NULL THEN
      NEW.current_warehouse_id := NEW.home_warehouse_id;
    END IF;
  ELSE
    NEW.current_warehouse_id := NULL;
  END IF;

  IF NEW.home_warehouse_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.warehouses w WHERE w.id = NEW.home_warehouse_id AND w.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'That home warehouse belongs to another company.' USING ERRCODE = '42501';
  END IF;
  IF NEW.current_warehouse_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.warehouses w WHERE w.id = NEW.current_warehouse_id AND w.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'That warehouse belongs to another company.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.inventory_items_warehouse_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventory_items_warehouse_guard ON public.inventory_items;
CREATE TRIGGER inventory_items_warehouse_guard
  BEFORE INSERT OR UPDATE OF home_warehouse_id, current_warehouse_id, location_type, assigned_truck_id, company_id
  ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_items_warehouse_guard();

-- =====================================================================================
-- 5. Backfill (safe to run twice)
--    a) Every company that has tools or vans, and no warehouse yet, gets "Main Warehouse".
--       A company that already has any warehouse (e.g. this was run before and "Main
--       Warehouse" was renamed) gets nothing new.
--    b) Tools without a home warehouse get their company's default (= Main Warehouse).
--    c) Tools in the warehouse without a current warehouse are in their home warehouse.
--    Values that are already set are never overwritten.
--    The transfer-history trigger (log_tool_transfer, migration 001) only writes history when
--    a tool's van or location_type changes. This backfill changes neither, so no history rows
--    are created.
-- =====================================================================================
INSERT INTO public.warehouses (company_id, name)
SELECT c.id, 'Main Warehouse'
FROM public.companies c
WHERE (EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.company_id = c.id)
    OR EXISTS (SELECT 1 FROM public.trucks t WHERE t.company_id = c.id))
  AND NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.company_id = c.id)
ON CONFLICT (company_id, lower(btrim(name))) DO NOTHING;

UPDATE public.inventory_items i
SET home_warehouse_id = public.default_warehouse_for(i.company_id)
WHERE i.home_warehouse_id IS NULL
  AND i.company_id IS NOT NULL;

UPDATE public.inventory_items i
SET current_warehouse_id = i.home_warehouse_id
WHERE i.current_warehouse_id IS NULL
  AND i.home_warehouse_id IS NOT NULL
  AND coalesce(i.location_type, 'warehouse') = 'warehouse';

-- Make the website see the new table and columns right away (Supabase's API caches the layout)
NOTIFY pgrst, 'reload schema';

-- =====================================================================================
-- ROLLBACK (run only to undo this migration). This DELETES all warehouses and every tool's
-- warehouse values; tools themselves, vans and history are not affected.
-- =====================================================================================
-- DROP TRIGGER IF EXISTS inventory_items_warehouse_guard ON public.inventory_items;
-- DROP FUNCTION IF EXISTS public.inventory_items_warehouse_guard();
-- DROP INDEX IF EXISTS public.idx_inventory_items_company_current_warehouse;
-- DROP INDEX IF EXISTS public.idx_inventory_items_company_home_warehouse;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS current_warehouse_id;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS home_warehouse_id;
-- DROP FUNCTION IF EXISTS public.default_warehouse_for(uuid);
-- DROP TABLE IF EXISTS public.warehouses;
-- NOTIFY pgrst, 'reload schema';
