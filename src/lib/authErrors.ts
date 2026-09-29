// Turn Supabase auth/database errors into plain-English messages people can act on.
// Uses the error `code` Supabase sends (stable), falling back to the message text.

import { isAuthRetryableFetchError } from '@supabase/supabase-js';

export const MIN_PASSWORD_LENGTH = 8;

type AnyError = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
  reasons?: string[];
  details?: string;
  hint?: string;
} | null | undefined;

const WEAK_REASONS: Record<string, string> = {
  length: `use at least ${MIN_PASSWORD_LENGTH} characters`,
  characters: 'mix upper- and lower-case letters, numbers and symbols',
  pwned: 'choose one that has not appeared in a known data breach',
};

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (isAuthRetryableFetchError(error)) return true;
  const msg = String((error as AnyError)?.message ?? error).toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')
    || msg.includes('load failed');
}

/** A sentence to show the user. `context` only changes wording where it matters. */
export function explainAuthError(error: unknown, context: 'login' | 'signup' | 'reset' | 'newPassword' = 'login'): string {
  if (!error) return 'Something went wrong. Please try again.';
  if (isNetworkError(error)) return "Couldn't reach the server. Check your internet connection and try again.";

  const e = error as AnyError;
  const code = e?.code ?? '';
  const msg = (e?.message ?? String(error)).toLowerCase();

  switch (code) {
    case 'invalid_credentials':
      return 'Wrong email or password. Check both and try again, or use "Forgot password?".';
    case 'email_not_confirmed':
      return 'Your email address is not confirmed yet. Open the confirmation link we emailed you (check spam), then sign in.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead, or use "Forgot password?" on the sign-in page.';
    case 'weak_password': {
      const tips = (e?.reasons ?? []).map((r) => WEAK_REASONS[r]).filter(Boolean);
      return `That password is too weak${tips.length ? `: ${tips.join('; ')}` : ''}.`;
    }
    case 'same_password':
      return 'Your new password must be different from your current one.';
    case 'over_email_send_rate_limit':
      return "Too many emails have been sent from this app in the last hour, so this one wasn't sent. Wait an hour and try again, or tell your admin (the app needs its own email service set up).";
    case 'over_request_rate_limit':
      return 'Too many attempts in a short time. Wait a minute and try again.';
    case 'email_address_not_authorized':
      return "The app's email service isn't allowed to send to this address yet, so the account couldn't be created. Tell your admin: the app needs its own email (SMTP) settings in Supabase.";
    case 'email_address_invalid':
    case 'validation_failed':
      return 'That email address was rejected as invalid. Check it for typos, or try a different address.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New sign-ups are turned off right now. Ask your admin to turn them on or create your account.';
    case 'captcha_failed':
      return 'The security check failed. Reload the page and try again.';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return context === 'newPassword'
        ? 'This password-reset link has expired or was already used. Request a new one from the sign-in page.'
        : 'Your session has expired. Please sign in again.';
    case 'reauthentication_needed':
      return 'For security, sign in again before changing your password.';
    case 'user_banned':
      return 'This account has been disabled. Ask your admin.';
    // Database (PostgREST) errors that can happen while saving a new profile
    case '42501':
      return 'Your account was created, but a database security rule stopped your profile from being saved. Ask your admin — this needs a fix on the server (see docs/PENDING_DB_FIXES.md).';
    case '23503':
      return 'Your profile could not be linked to the account or company. Ask your admin.';
    case '23505':
      return 'An account with these details already exists. Try signing in instead.';
  }

  // Older servers / messages without a code
  if (msg.includes('invalid login credentials')) return explainAuthError({ code: 'invalid_credentials' });
  if (msg.includes('email not confirmed')) return explainAuthError({ code: 'email_not_confirmed' });
  if (msg.includes('already registered')) return explainAuthError({ code: 'user_already_exists' });
  if (msg.includes('rate limit')) return explainAuthError({ code: msg.includes('email') ? 'over_email_send_rate_limit' : 'over_request_rate_limit' });
  if (msg.includes('row-level security')) return explainAuthError({ code: '42501' });
  if (msg.includes('password should be') || msg.includes('password is')) return `Password problem: ${e?.message}`;

  const prefix = context === 'signup' ? 'Sign-up failed' : context === 'reset' ? 'Could not send the reset email' : 'Something went wrong';
  return `${prefix}: ${e?.message ?? String(error)}`;
}

/** Password rules checked before we even ask the server. Returns an error sentence or null. */
export function checkNewPassword(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (confirm !== undefined && password !== confirm) return "The two passwords don't match.";
  return null;
}
