-- Migration: protect roles, companies and active/inactive on user_profiles
-- Date: 2026-10-06
-- Description: Closes docs/PENDING_DB_FIXES.md item 6. Until now a signed-in user could update
--   their own profile row from the browser console, including role (make themselves admin),
--   company_id (move into another company) and is_active/status (reactivate themselves).
--   Two triggers fix that. No existing data is changed; no columns or rules are dropped.
--
--   Who may change what on user_profiles after this:
--     role, company_id (and super_admin, if that column exists)
--         only the server (Edge Functions using the service role key) or the SQL editor.
--         Never from the browser, not even by admins. Roles go through admin-create-tech.
--     is_active, status (the two "is this person active" columns)
--         the server, the SQL editor, or an ACTIVE ADMIN of the SAME company, and never on
--         their own profile. (This is the Activate/Deactivate button on Technicians.)
--     everything else (name, phone, specialty, …)
--         unchanged: whatever the existing row rules (RLS) already allow.
--   New profiles created from the browser (a tech's first sign-in) always get role 'tech' and
--   are active, whatever the browser sent.

-- "Is this request from the server or the SQL editor?"
--   service_role = an Edge Function using the service role key.
--   No signed-in user AND not an anonymous/signed-in API request = the SQL editor, a database
--   job, or Supabase's own sign-up service (it has no login of its own).
CREATE OR REPLACE FUNCTION public.profile_change_is_trusted()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NULL AND coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'));
$$;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE: refuse protected changes that don't come from a trusted place
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER            -- so it can look up the caller's own profile whatever the row rules say
SET search_path = public
AS $$
DECLARE
  me public.user_profiles%ROWTYPE;
BEGIN
  IF public.profile_change_is_trusted() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Roles can only be changed by an admin from the Technicians page.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A person''s company can''t be changed from the app. Ask the app owner.'
      USING ERRCODE = '42501';
  END IF;

  -- Only if a super_admin column exists (to_jsonb gives NULL for a missing column on both sides).
  IF (to_jsonb(NEW) -> 'super_admin') IS DISTINCT FROM (to_jsonb(OLD) -> 'super_admin') THEN
    RAISE EXCEPTION 'Super admin can only be set by the app owner.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO me FROM public.user_profiles WHERE id = auth.uid();
    IF NOT FOUND
       OR me.role IS DISTINCT FROM 'admin'
       OR me.is_active IS FALSE
       OR coalesce(me.status, 'active') = 'inactive'
       OR me.company_id IS NULL
       OR me.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Only an active admin in the same company can activate or deactivate people, from the Technicians page.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t activate or deactivate your own account. Ask another admin.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_update ON public.user_profiles;
CREATE TRIGGER protect_profile_update
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_update();

-- ---------------------------------------------------------------------------
-- BEFORE INSERT: a profile created from the browser is always an active tech
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.profile_change_is_trusted() THEN
    RETURN NEW;               -- the server (Add Technician) and the SQL editor work as before
  END IF;

  IF (to_jsonb(NEW) ->> 'super_admin') IN ('true', 't') THEN
    RAISE EXCEPTION 'Super admin can only be set by the app owner.'
      USING ERRCODE = '42501';
  END IF;

  NEW.role      := 'tech';
  NEW.is_active := true;
  NEW.status    := 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_insert ON public.user_profiles;
CREATE TRIGGER protect_profile_insert
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_insert();

-- =====================================================
-- ROLLBACK (one step: run these lines to undo this migration; no data is affected)
-- =====================================================
-- DROP TRIGGER IF EXISTS protect_profile_update ON public.user_profiles;
-- DROP TRIGGER IF EXISTS protect_profile_insert ON public.user_profiles;
-- DROP FUNCTION IF EXISTS public.protect_profile_update();
-- DROP FUNCTION IF EXISTS public.protect_profile_insert();
-- DROP FUNCTION IF EXISTS public.profile_change_is_trusted();
