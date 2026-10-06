# admin-create-tech (Edge Function): deploy and test

Lets an **admin** add technicians from the Technicians page, resend invites, see each
person's last sign-in, and **change roles** (make someone an admin, or a tech again). It runs on Supabase's servers because creating someone else's login
needs the **service role key**, which must never be in the website.

Code: `supabase/functions/admin-create-tech/` (`index.ts` = entry point, `handler.ts` = all checks).

What it guarantees:
- The caller must be signed in, and must be an **active admin** (checked on the server).
- The company is always the **admin's own company** (anything the browser sends is ignored).
- New people are always role **tech**, active.
- Vans and technicians from other companies are refused.
- If the profile can't be saved, the new login is deleted again (no half-created accounts).
- Every add / resend is written to `activity_logs`.
- **Role changes** (`set_role`): only `tech` ↔ `admin`; only people in the admin's own company;
  never your own role; never the last active admin; each change logged as `role_changed` with
  who changed whom, from what, to what. (A switched-off hook for a future platform-owner
  `super_admin` is described in `docs/PENDING_DB_FIXES.md`, item 7.)

### Updating it (after a new version of the code, e.g. Caplinger fixes 7)

Only step 5 below is needed — the settings from the first deploy stay:
```powershell
npx supabase@latest functions deploy admin-create-tech --project-ref actgfkpgwcfwxaecplhi --no-verify-jwt --use-api
```
Until it's redeployed, the Role buttons on Technicians show the server's "Unknown action" message
and nothing changes.

Until it's deployed, the Technicians page still works; "Add Technician" shows
"not deployed yet", and Last sign-in / Resend invite are hidden.

---

## Before you deploy (Supabase dashboard)

1. **Custom SMTP is required for real use.** Supabase's built-in email only sends to members of
   your Supabase team, about 2 emails an hour. Invites *and* "Forgot password?" both need email.
   Authentication → Emails → SMTP Settings (e.g. SendGrid: host `smtp.sendgrid.net`, port `587`,
   user `apikey`, password = your SendGrid API key).
2. **How long invite links last:** Authentication → Providers → Email → **Email OTP Expiration**
   (seconds; default `3600` = 1 hour, maximum `86400` = 24 hours). This one setting applies to
   invite links *and* password-reset links. For invites, 86400 is friendlier; 3600 is safer for
   resets. Whatever you choose, use the same number for `INVITE_LINK_SECONDS` below.
3. **Redirect URLs** (from the previous batch): Authentication → URL Configuration must include
   `https://warehouse-manage-chi.vercel.app/**` so invite links land on the "choose your password" page.

## Deploy (PowerShell, from the project folder)

Per CLAUDE.md, do this on **staging first** once it exists (use the staging project ref), test,
then repeat with the production ref `actgfkpgwcfwxaecplhi`. The function is new and only admins
can call it, so it can't affect existing screens.

```powershell
# 1. Check the Supabase CLI runs (npx downloads it; no global install, no Docker needed)
npx supabase@latest --version

# 2. Log in (opens your browser)
npx supabase@latest login

# 3. Link this folder to the project (press Enter if asked for the database password)
npx supabase@latest link --project-ref actgfkpgwcfwxaecplhi

# 4. Settings the function reads
npx supabase@latest secrets set SITE_URL=https://warehouse-manage-chi.vercel.app INVITE_LINK_SECONDS=3600 --project-ref actgfkpgwcfwxaecplhi

# 5. Deploy
npx supabase@latest functions deploy admin-create-tech --project-ref actgfkpgwcfwxaecplhi --no-verify-jwt --use-api
```

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically. **If your
  project has turned off the legacy keys**, add a secret named `ADMIN_SECRET_KEY` containing an
  `sb_secret_…` key (Project Settings → API Keys → Secret keys). Add it in the dashboard
  (Edge Functions → Secrets) rather than typing it in PowerShell, so it isn't saved in your
  command history.
- `--no-verify-jwt`: the function checks the caller's sign-in itself (step 1 in `handler.ts`),
  which also works with Supabase's newer signing keys. Requests without a valid sign-in get 401.
- `--use-api`: bundles on Supabase's servers, so Docker isn't needed. If your CLI says it doesn't
  know that flag, run the command with `@latest` as shown.

**Undo:** `npx supabase@latest functions delete admin-create-tech --project-ref actgfkpgwcfwxaecplhi`
(the app goes back to "not deployed yet"; nothing else changes).

## Test

1. Sign in as an admin → **Technicians**. The **Last sign-in** column fills in (if it says it's
   not available, read the message: usually "not deployed yet").
2. **Add Technician** → use an email you can read (e.g. `you+tech1@gmail.com`), pick a van,
   leave **Send invite email** → *Add and send invite*. You'll see how many seconds the link lasts.
3. Open the email → the link opens "Welcome! Choose your password" → set one → you're signed in
   as that technician, on the chosen van.
4. Back as admin: the new tech shows **Never** under Last sign-in until they sign in, with a
   **Resend invite** button.
5. Try an email that's already in your company → the message names the person.
6. Try **Create without sending email** → no email arrives; the tech signs in first via
   "Forgot password?" (or you use Resend invite, which emails them a set-password link).
7. Logs: Dashboard → Edge Functions → admin-create-tech → Logs.
