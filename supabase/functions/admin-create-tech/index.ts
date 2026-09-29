// Supabase Edge Function: admin-create-tech
// Lets a company admin add technicians (with or without an invite email), resend invites, and
// see technicians' sign-in status. The service role key stays here on the server; the browser
// only ever sends the signed-in admin's token. All logic and checks are in handler.ts.
//
// Deploy: see docs/ADMIN_CREATE_TECH.md

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleRequest } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
// Supabase provides SUPABASE_SERVICE_ROLE_KEY automatically. Projects that switched to the
// new API keys can instead store an sb_secret_... key as ADMIN_SECRET_KEY.
const serviceKey = Deno.env.get('ADMIN_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const env = {
  // Must match Authentication → Providers → Email → "Email OTP Expiration" (default 3600).
  inviteLinkSeconds: Number(Deno.env.get('INVITE_LINK_SECONDS') ?? '3600') || 3600,
  // e.g. https://warehouse-manage-chi.vercel.app — where invite links send people.
  siteUrl: Deno.env.get('SITE_URL') || undefined,
};

Deno.serve(async (req) => {
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'The function is missing its server settings (service key). See docs/ADMIN_CREATE_TECH.md.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    return await handleRequest(req, admin, env);
  } catch (err) {
    console.error('admin-create-tech crashed', err);
    return new Response(JSON.stringify({ ok: false, error: 'Unexpected server error. Try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
