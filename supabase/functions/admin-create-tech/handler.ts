// Logic for the admin-create-tech Edge Function, kept free of Deno-specific code so it can be
// tested with a fake Supabase client. index.ts wires it to Deno.serve.
//
// Actions (POST JSON body { action, ... }), all limited to the CALLER's company:
//   create  – add a technician: send an invite email, or create the login without email
//   resend  – re-send the invite (or a "set your password" email) to a tech who never signed in
//   status  – sign-in status (last sign-in, invited, confirmed) for the company's technicians
//
// Security: the caller's JWT is checked with the Auth server; the caller must be an active
// admin; the company always comes from the caller's own profile, never from the request.

// deno-lint-ignore-file no-explicit-any
type Admin = any; // Supabase client created with the service role key

export interface Env {
  inviteLinkSeconds: number;
  siteUrl?: string;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const fail = (status: number, error: string, code?: string) => json(status, { ok: false, error, code });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 40) + 'aA1!';
}

/** Plain-English message for errors from the Supabase Auth admin API. */
export function explainAuthAdminError(err: any): { status: number; message: string; code: string } {
  const code = err?.code ?? '';
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  if (code === 'email_exists' || code === 'user_already_exists' || msg.includes('already been registered') || msg.includes('already registered')) {
    return { status: 409, code: 'email_exists', message: 'This email address already has a login.' };
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || msg.includes('invalid format') || msg.includes('is invalid')) {
    return { status: 400, code: 'email_invalid', message: 'That email address was rejected as invalid. Check it for typos.' };
  }
  if (code === 'email_address_not_authorized' || msg.includes('not authorized')) {
    return { status: 400, code: 'email_not_authorized', message: "Supabase's built-in email service won't send to this address. Set up custom SMTP in Supabase (Authentication → Emails), or use \"Create without sending email\"." };
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
    return { status: 429, code: 'rate_limited', message: 'Too many emails have been sent in the last hour. Wait and try again, or use "Create without sending email".' };
  }
  if (code === 'weak_password') {
    return { status: 400, code: 'weak_password', message: 'Supabase rejected the generated password. Try again.' };
  }
  return { status: 500, code: code || 'auth_error', message: `Supabase Auth error: ${err?.message ?? 'unknown error'}` };
}

const fullName = (p: { first_name?: string; last_name?: string; email?: string }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'this person';

async function logActivity(admin: Admin, companyId: string, callerId: string, action: string, details: Record<string, unknown>) {
  const { error } = await admin.from('activity_logs').insert({ company_id: companyId, user_id: callerId, action, details });
  if (error) console.error('activity log failed', error);
}

export async function handleRequest(req: Request, admin: Admin, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST.');

  // --- who is calling? ---
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'You need to be signed in.', 'not_signed_in');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (userError || !caller) return fail(401, 'Your sign-in has expired. Sign in again and retry.', 'not_signed_in');

  const { data: callerProfile, error: profileError } = await admin
    .from('user_profiles').select('id, role, company_id, is_active, status, first_name, last_name, email')
    .eq('id', caller.id).maybeSingle();
  if (profileError) return fail(500, `Couldn't check your account: ${profileError.message}`);
  const callerActive = callerProfile && callerProfile.is_active !== false && callerProfile.status !== 'inactive';
  if (!callerProfile || callerProfile.role !== 'admin' || !callerActive) {
    return fail(403, 'Only admins can manage technicians.', 'not_admin');
  }
  const companyId: string | null = callerProfile.company_id;
  if (!companyId) return fail(403, 'Your admin account is not linked to a company.', 'no_company');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'The request was not valid JSON.'); }

  const redirectTo = env.siteUrl
    ? `${env.siteUrl.replace(/\/$/, '')}/reset-password`
    : (clean(body.redirectTo, 500) || undefined);

  switch (body.action) {
    case 'create': return createTech(admin, env, body, caller.id, companyId, redirectTo);
    case 'resend': return resendInvite(admin, env, body, caller.id, companyId, redirectTo);
    case 'status': return techStatus(admin, companyId);
    default: return fail(400, 'Unknown action.');
  }
}

async function createTech(admin: Admin, env: Env, body: Record<string, unknown>, callerId: string, companyId: string, redirectTo?: string) {
  const email = clean(body.email, 254).toLowerCase();
  const firstName = clean(body.firstName, 100);
  const lastName = clean(body.lastName, 100);
  const phone = clean(body.phone, 40);
  const specialty = clean(body.specialty, 100);
  const truckId = clean(body.truckId, 64) || null;
  const mode = body.mode === 'no_email' ? 'no_email' : 'invite';

  if (!email) return fail(400, 'Email is required.', 'email_required');
  if (!EMAIL_RE.test(email)) return fail(400, 'That email address doesn’t look right. Check it for typos.', 'email_invalid');

  // Van must belong to the caller's company.
  let truck: { id: string; name: string } | null = null;
  if (truckId) {
    const { data, error } = await admin.from('trucks').select('id, name').eq('id', truckId).eq('company_id', companyId).maybeSingle();
    if (error) return fail(500, `Couldn't check the van: ${error.message}`);
    if (!data) return fail(400, 'That van isn’t in your company.', 'truck_not_found');
    truck = data;
  }

  // Already has a profile? Say where, but only name the company if it's the caller's own.
  const { data: existing, error: existingError } = await admin
    .from('user_profiles').select('id, company_id, first_name, last_name, email, role')
    .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`)) // case-insensitive, no wildcards
    .limit(1);
  if (existingError) return fail(500, `Couldn't check for an existing account: ${existingError.message}`);
  if (existing?.length) {
    const p = existing[0];
    return p.company_id === companyId
      ? fail(409, `${email} is already registered in your company as ${fullName(p)} (${p.role}).`, 'already_in_company')
      : fail(409, `${email} is already registered with another company. Use a different email address for this technician.`, 'other_company');
  }

  const metadata = { first_name: firstName, last_name: lastName, phone, specialty, company_id: companyId };
  let userId: string;
  if (mode === 'invite') {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: metadata });
    if (error) {
      const e = explainAuthAdminError(error);
      if (e.code === 'email_exists') {
        return fail(409, `${email} already has a login from an earlier sign-up, but it isn't linked to a company. Ask them to sign in (or use "Forgot password?"), or contact the app admin.`, 'orphan_login');
      }
      return fail(e.status, e.message, e.code);
    }
    userId = data.user.id;
  } else {
    // A random password nobody sees; the tech sets their own with "Forgot password?" or a
    // "Resend invite" (which sends a set-password email).
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password: randomPassword(), user_metadata: metadata });
    if (error) {
      const e = explainAuthAdminError(error);
      if (e.code === 'email_exists') {
        return fail(409, `${email} already has a login from an earlier sign-up, but it isn't linked to a company. Ask them to sign in (or use "Forgot password?"), or contact the app admin.`, 'orphan_login');
      }
      return fail(e.status, e.message, e.code);
    }
    userId = data.user.id;
  }

  // Profile: role is always 'tech', company is always the caller's.
  const { error: insertError } = await admin.from('user_profiles').upsert({
    id: userId, email, first_name: firstName, last_name: lastName, phone, specialty,
    role: 'tech', is_active: true, status: 'active', company_id: companyId,
  });
  if (insertError) {
    // Don't leave a login without a profile behind.
    await admin.auth.admin.deleteUser(userId);
    return fail(500, `The login was created but the profile couldn't be saved, so it was undone: ${insertError.message}`, 'profile_failed');
  }

  let warning: string | undefined;
  if (truck) {
    const { error } = await admin.from('user_truck_assignments').insert({ user_id: userId, truck_id: truck.id, company_id: companyId, assigned_by: callerId });
    if (error) warning = `The technician was added, but assigning ${truck.name} failed: ${error.message}. Assign the van on the Assignments page.`;
  }

  const name = fullName({ first_name: firstName, last_name: lastName, email });
  await logActivity(admin, companyId, callerId, 'technician_added', {
    tech_id: userId, tech_name: name, email, mode, truck_name: truck?.name ?? null,
  });

  return json(200, {
    ok: true, techId: userId, name, mode, emailSent: mode === 'invite',
    inviteLinkSeconds: env.inviteLinkSeconds, vanAssigned: !!truck && !warning, warning,
  });
}

async function resendInvite(admin: Admin, env: Env, body: Record<string, unknown>, callerId: string, companyId: string, redirectTo?: string) {
  const techId = clean(body.techId, 64);
  if (!techId) return fail(400, 'Which technician?');
  const { data: tech, error } = await admin.from('user_profiles')
    .select('id, email, first_name, last_name, role, company_id').eq('id', techId).eq('company_id', companyId).maybeSingle();
  if (error) return fail(500, `Couldn't find the technician: ${error.message}`);
  if (!tech || tech.role !== 'tech') return fail(404, 'That technician isn’t in your company.', 'not_found');

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(techId);
  if (authError || !authData?.user) return fail(404, `${fullName(tech)} has no login. Remove and re-add them.`, 'no_login');
  const u = authData.user;
  if (u.last_sign_in_at) {
    return fail(409, `${fullName(tech)} has already signed in. If they forgot their password, they can use "Forgot password?" on the sign-in page.`, 'already_signed_in');
  }

  // Never accepted an invite -> send the invite again. Created without email (already
  // confirmed) -> send a "set your password" email instead.
  const result = u.email_confirmed_at
    ? await admin.auth.resetPasswordForEmail(u.email, { redirectTo })
    : await admin.auth.admin.inviteUserByEmail(u.email, { redirectTo });
  if (result.error) {
    const e = explainAuthAdminError(result.error);
    return fail(e.status, e.message, e.code);
  }
  await logActivity(admin, companyId, callerId, 'technician_invite_resent', { tech_id: techId, tech_name: fullName(tech), email: u.email });
  return json(200, { ok: true, email: u.email, inviteLinkSeconds: env.inviteLinkSeconds });
}

async function techStatus(admin: Admin, companyId: string) {
  const { data: techs, error } = await admin.from('user_profiles').select('id').eq('company_id', companyId).eq('role', 'tech');
  if (error) return fail(500, `Couldn't list technicians: ${error.message}`);
  const wanted = new Set((techs ?? []).map((t: { id: string }) => t.id));
  const statuses: Record<string, unknown>[] = [];
  // listUsers is project-wide; only this company's technicians are returned.
  for (let page = 1; wanted.size > statuses.length; page++) {
    const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) return fail(500, `Couldn't read sign-in status: ${listError.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (wanted.has(u.id)) {
        statuses.push({ id: u.id, lastSignInAt: u.last_sign_in_at ?? null, invitedAt: u.invited_at ?? null, emailConfirmedAt: u.email_confirmed_at ?? null });
      }
    }
    if (users.length < 1000) break;
  }
  return json(200, { ok: true, statuses });
}
