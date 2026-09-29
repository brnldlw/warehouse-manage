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
