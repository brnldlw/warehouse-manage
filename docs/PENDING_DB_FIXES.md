# Pending database fixes

Changes that need the database (security rules or functions), so they are **not** applied by
app code. Each needs its own reviewed migration in `supabase/migrations/`, tested on staging
first, per CLAUDE.md. Nothing here has been applied.

Status key: **UNCONFIRMED** = suspected from reading the code; the read-only check listed under
it will confirm or rule it out.

---

## 1. New users can't look up their company before they are signed in — UNCONFIRMED

**Symptom:** Tech (or admin) sign-up says the company can't be found even though the name is
right — for everyone, not just one person.

**Why:** The sign-up form looks the company up by name *before* the person has an account, so
the database sees an anonymous visitor. If the `companies` table's security rule only lets
signed-in users read it, the lookup always returns nothing. (The opposite is also a problem: if
anonymous visitors can read `companies`, anyone on the internet can list every customer company.)

**Check (read-only):** see "Checks" below, query A.

**Proposed fix:** a small database function that answers only "which company id has exactly this
name?", callable by anonymous visitors, instead of opening up the whole table. Sketch:

```sql
-- NOT APPLIED. Draft for review.
create or replace function public.find_company_for_signup(p_name text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.companies
  where lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))
    and is_active is not false
  limit 2  -- caller treats 2 results as "ambiguous"
$$;
revoke all on function public.find_company_for_signup(text) from public;
grant execute on function public.find_company_for_signup(text) to anon, authenticated;
-- Rollback: drop function public.find_company_for_signup(text);
```
(Would need to return a set to detect duplicates; finalize when writing the migration.) The app
would then call `supabase.rpc('find_company_for_signup', …)` in `src/lib/companyLookup.ts`.

## 2. Profiles should be created by the database, not the browser — UNCONFIRMED

**Symptom:** "Your account was created, but a database security rule stopped your profile from
being saved", or a sign-up that seems to work but the person can't use the app afterwards.

**Why:** Today the browser inserts the new `user_profiles` row itself, choosing its own `role`
and `company_id`. That breaks two ways:
- If the `user_profiles` insert rule doesn't allow it (especially while the user still has to
  confirm their email and so isn't signed in yet), the profile is never created.
  *App-side mitigation already in this batch:* the sign-up details are stored on the auth account
  and the profile is created on first sign-in instead.
- If the rule *does* allow it, anyone calling the API directly could create a profile with
  `role = 'admin'` in any company. CLAUDE.md requires that users can never set their own role or
  company.

**Check (read-only):** queries A and B below.

**Proposed fix:** a trigger on `auth.users` (`after insert`) that creates the profile from the
sign-up details with `role` forced to `'tech'` and `company_id` validated against `companies`;
and an insert rule on `user_profiles` that no longer lets users insert/choose role or company
themselves. Draft to be written with the migration, including rollback.

## 3. Barcodes are unique across ALL companies, not per company — CONFIRMED (schema dump)

**Symptom:** "CAP-00012 is already used by a tool in another company" when assigning a code,
even though no tool in *your* company has it.

**Why:** `inventory_items.barcode` has a database-wide `UNIQUE` rule (see `database.sql`). Two
companies whose names give the same prefix (e.g. "Caplinger" and "Capital Plumbing" → `CAP`)
compete for the same numbers, and a real product barcode (UPC) on the same model of tool can only
be stored once in the whole app.
*App-side mitigation already in place:* the app checks your own company first (and names the tool
that has the code); bulk coding skips numbers another company uses.

**Proposed fix:** replace the single-column rule with one per company:
```sql
-- NOT APPLIED. Draft for review.
alter table public.inventory_items drop constraint inventory_items_barcode_key; -- Postgres' default name; confirm first
create unique index inventory_items_company_barcode_key
  on public.inventory_items (company_id, lower(barcode)) where barcode is not null;
-- Rollback (only works if no two companies share a barcode by then):
-- drop index public.inventory_items_company_barcode_key;
-- alter table public.inventory_items add constraint inventory_items_barcode_key unique (barcode);
```
(Same pattern applies to `categories.name` and `trucks.identifier`, which are also unique across
all companies: two companies can't both have a "Ladders" category or a van with plate "ABC-123".)

## 4. Every tool transfer is logged twice — CONFIRMED (migration 001 + app code)

**Why:** the database trigger `trigger_log_tool_transfer` writes a `tool_transfer` row per tool,
and the app also writes a `transferred` row per move (`InventoryManager.tsx`).
*App-side mitigation already in place:* the Tool Usage report counts each transfer once. The
older screens (Reports activity list, Technicians "Recent activities") only read `transferred`.

**Proposed fix (later, with the custody rebuild's `tool_events` table):** keep one source of truth —
the database — and have the screens read it; stop the app-side `transferred` insert in the same
release. No change needed until then.

## 5. Bulk return/move isn't one all-or-nothing database step — BY DESIGN for now

**Why:** CLAUDE.md wants every tool movement to go through a database function that does it
atomically and checks role server-side. Bulk "Return to warehouse / Move to another van"
(Caplinger fixes 6) was built without schema changes, the same way as the existing single-tool
Transfer: the browser updates `inventory_items` in batches of 50 and writes one `transferred`
history row per tool (plus a `batch_id`, used by Undo).
*App-side mitigation:* every tool is reported as moved, skipped or failed (by name, with the
reason); failed ones stay selected to retry; nothing fails silently. RLS still limits it to the
user's own company. Undo puts exactly those tools back.
**What's not covered:** if the browser is closed mid-batch, earlier batches stay moved (each tool
is either moved or not — never half-moved — and its history row is written right after); and any
signed-in user whose RLS allows updating tools can move them (no role check).

**Proposed fix (with the custody rebuild):** a `move_tools(p_item_ids uuid[], p_to_truck uuid,
p_condition text, p_note text)` function (`security definer`, checks company + role, writes
`tool_events`), and point `src/lib/toolMoves.ts` at it. The screens don't change.

## 6. A tech can probably make themselves an admin from the browser — LIKELY (code evidence; confirm with check C)

**In plain English:** the app's own code updates `user_profiles` straight from the browser, and it
works in production, so the database lets a signed-in person update **their own** profile row.
Database row rules (RLS) can only say *which rows* someone may change, not *which columns*. So
unless something else blocks it, any signed-in tech can open the browser console and run
```js
supabase.from('user_profiles').update({ role: 'admin' }).eq('id', '<their own id>')
```
and become an admin. The same hole would let someone move themselves into **another company**
(`company_id`), or switch themselves back to active after being deactivated (`status`, `is_active`).

**Evidence:**
- `src/components/auth/CompanySelector.tsx` updates the user's own `company_id` from the browser,
  so self-updates of `user_profiles` are allowed.
- `src/components/TechManagement.tsx` (Activate/Deactivate) updates *other people's* profiles from
  the browser, so some rule also lets admins (or possibly anyone in the company) update others.
- Nothing in `supabase/migrations/` protects the `role`, `company_id` or `status` columns, and
  `DATABASE_SETUP.md` shows the original rule: `FOR UPDATE USING (auth.uid() = id)`, no check on
  what the new values are.
- Not confirmed against the live database: that needs check C below (read-only). Ask me to run it,
  or paste it into Supabase → SQL Editor yourself.

**What this batch already does:** role changes from the app now go through the server
(admin-create-tech, `set_role`), with every rule checked there. That doesn't close the hole by
itself, because the hole is the direct table update.

**Proposed fix (a new migration, not applied):** a trigger that refuses changes to `role`,
`company_id`, `status` and `is_active` unless they come from the server (service role) or, for
`status`/`is_active` only, from an active admin of the same company. The one browser change
still needed (a brand-new user picking their company once, while `company_id` is empty) stays
allowed. The app's Activate/Deactivate button keeps working; role changes keep working through
the Edge Function.
```sql
-- NOT APPLIED. Draft for review (would be 005_protect_profile_columns.sql).
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare me record;
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;  -- Edge Functions
  select role, company_id, is_active, status into me from public.user_profiles where id = auth.uid();
  if new.role is distinct from old.role then
    raise exception 'Roles can only be changed by an admin in the app.' using errcode = '42501';
  end if;
  if new.company_id is distinct from old.company_id
     and not (old.company_id is null and new.id = auth.uid()) then  -- first-time company pick only
    raise exception 'The company can''t be changed.' using errcode = '42501';
  end if;
  if (new.status is distinct from old.status or new.is_active is distinct from old.is_active)
     and not (me.role = 'admin' and me.company_id = old.company_id
              and me.is_active is not false and coalesce(me.status, 'active') <> 'inactive'
              and new.id <> auth.uid()) then
    raise exception 'Only an admin can activate or deactivate people.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_profile_columns before update on public.user_profiles
  for each row execute function public.protect_profile_columns();
-- Rollback:
-- drop trigger if exists protect_profile_columns on public.user_profiles;
-- drop function if exists public.protect_profile_columns();
```
Also needed with it: item 2 (profiles created by the database), because the browser's first-time
profile **insert** could otherwise still choose `role = 'admin'`.

## 7. super_admin (platform owner) — HOOK READY, NOT SWITCHED ON

The role-change code in `supabase/functions/admin-create-tech/handler.ts` has a switch,
`SUPER_ADMIN_CAN_SET_ROLES` (now `false`). When on, someone whose profile role is `super_admin`
can change roles in **any** company by sending `companyId` with `set_role`; every other rule still
applies (only tech/admin, never their own role, never the last active admin, logged in the target
company's history with `changed_by_role: super_admin`).
**Before switching it on:** item 6 must be applied (otherwise anyone could give themselves
`super_admin`), the `user_profiles.role` values must allow `super_admin`, and the super admin
needs a screen to pick the company. Then flip the switch and redeploy the function.

---

## Checks (read-only, to run in Supabase → SQL Editor or via `psql`)

A. Security rules on `companies` and `user_profiles`:
```sql
select c.relname as table_name, c.relrowsecurity as rls_on,
       p.policyname, p.cmd, p.roles, p.qual, p.with_check
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relname in ('companies', 'user_profiles')
order by 1, 3;
```

B. Anything that already runs when a new auth user is created:
```sql
select tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where tgrelid = 'auth.users'::regclass and not tgisinternal;
```

C. Can people update their own role? (item 6) — the update rules on `user_profiles`, any column
permissions, and any triggers already guarding it. If the UPDATE rule's `qual` is like
`auth.uid() = id` with no `with_check` limiting `role`, and C2/C3 show nothing protecting `role`,
the hole is confirmed.
```sql
-- C1: update rules
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and cmd in ('UPDATE', 'ALL');
-- C2: columns signed-in users may update (if `role` is listed, the permission allows changing it)
select column_name from information_schema.column_privileges
where table_schema = 'public' and table_name = 'user_profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE';
-- C3: triggers on user_profiles
select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.user_profiles'::regclass and not tgisinternal;
```
