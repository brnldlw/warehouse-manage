// What the address bar looked like when the app first loaded. Email links from Supabase
// (password reset, sign-up confirmation) put their details in the URL, and supabase-js
// clears them once it has used them, so they are captured here, at startup.
// Imported first thing in main.tsx.

const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
const search = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
const params = new URLSearchParams(`${search}&${hash}`);

/** The page was opened from an invite email (an admin added this technician). */
export const openedFromInviteLink = params.get('type') === 'invite';

/** The page was opened from a link whose next step is choosing a password (reset or invite). */
export const openedFromRecoveryLink = params.get('type') === 'recovery' || openedFromInviteLink;

/** Error Supabase reported for an email link (e.g. expired), as plain text, or null. */
export const emailLinkError: { code: string; description: string } | null = params.get('error')
  ? {
      code: params.get('error_code') ?? params.get('error') ?? '',
      description: params.get('error_description') ?? 'The link is invalid or has expired.',
    }
  : null;
