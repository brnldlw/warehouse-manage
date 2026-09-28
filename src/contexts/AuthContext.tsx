import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SUPABASE_URL } from '@/lib/env';
import { openedFromRecoveryLink } from '@/lib/authRedirect';
import { isAuthRetryableFetchError, Session, User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  company_id?: string;
}

/**
 * loading      – checking for a saved login (first moments after the page opens)
 * reconnecting – a saved login exists but the server can't be reached yet (offline, laptop
 *                just woke up); we keep retrying and never show the sign-in page for this
 * signedIn / signedOut
 */
export type AuthStatus = 'loading' | 'reconnecting' | 'signedIn' | 'signedOut';

/** Why the profile isn't available: missing row, or couldn't load it after several retries. */
export type ProfileProblem = 'missing' | 'unreachable' | null;

export interface SignUpResult {
  error?: unknown;
  /** true when Supabase wants the user to click the confirmation email before signing in */
  needsEmailConfirmation?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  /** true until we know whether someone is signed in (includes reconnecting) */
  loading: boolean;
  status: AuthStatus;
  profileProblem: ProfileProblem;
  /** Try loading the profile again (e.g. from a "Retry" button). */
  loadUserProfile: (userId?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: unknown }>;
  signUp: (email: string, password: string, userData?: Record<string, string | undefined>) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isTech: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PROFILE_RETRIES = 5; // ~30 s of retrying (1+2+4+8+16) before showing a Retry screen

// Where supabase-js keeps the login in localStorage (its default key).
const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

// Profile fields a new user chose on the sign-up form, kept on their auth account
// (user_metadata) so the profile can be created on first sign-in if it couldn't be
// created at sign-up (e.g. when they first had to confirm their email).
const PROFILE_FIELDS = ['first_name', 'last_name', 'phone', 'specialty', 'company_id'] as const;

/**
 * Load the user's profile. If there is none yet but they signed up through the app,
 * create it from what they entered at sign-up. Self sign-up always creates a 'tech'
 * (same as before); only an admin can change roles.
 */
async function fetchOrCreateProfile(user: User): Promise<{ profile: UserProfile | null; error: unknown }> {
  const first = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
  if (first.error) return { profile: null, error: first.error };
  if (first.data) return { profile: first.data as UserProfile, error: null };

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (!meta.company_id) return { profile: null, error: null };

  const row: Record<string, unknown> = { id: user.id, email: user.email, role: 'tech', is_active: true };
  for (const f of PROFILE_FIELDS) row[f] = typeof meta[f] === 'string' ? meta[f] : '';
  const created = await supabase.from('user_profiles').upsert(row).select('*').maybeSingle();
  if (created.error) return { profile: null, error: created.error };
  return { profile: (created.data as UserProfile) ?? null, error: null };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profileProblem, setProfileProblem] = useState<ProfileProblem>(null);

  // Which user the current profile belongs to; guards against stale async results.
  const userIdRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);

  const loadProfileFor = useCallback(async (u: User) => {
    setProfileProblem(null);
    for (let attempt = 0; ; attempt++) {
      const { profile, error } = await fetchOrCreateProfile(u);
      if (userIdRef.current !== u.id) return; // signed out or switched user meanwhile
      if (!error) {
        setUserProfile(profile);
        setProfileProblem(profile ? null : 'missing');
        return;
      }
      console.error('Failed to load user profile (will retry):', error);
      if (attempt >= PROFILE_RETRIES - 1) {
        // Keep the user signed in; the page shows a Retry button instead of kicking them out.
        setProfileProblem('unreachable');
        return;
      }
      await sleep(1000 * 2 ** attempt);
    }
  }, []);

  const loadUserProfile = useCallback(async (userId?: string) => {
    const u = userRef.current;
    if (u && (!userId || userId === u.id)) await loadProfileFor(u);
  }, [loadProfileFor]);

  const applySession = useCallback((session: Session) => {
    const u = session.user;
    userRef.current = u;
    setUser((prev) => (prev?.id === u.id ? prev : u)); // same person: don't re-render everything
    setStatus('signedIn');
    if (userIdRef.current !== u.id) {
      userIdRef.current = u.id;
      setUserProfile(null);
      // Run outside the auth callback: Supabase advises against calling it from inside one.
      setTimeout(() => loadProfileFor(u), 0);
    }
  }, [loadProfileFor]);

  const clearSession = useCallback(() => {
    userIdRef.current = null;
    userRef.current = null;
    setUser(null);
    setUserProfile(null);
    setProfileProblem(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let attempt = 0;

    // Decide the starting state. getSession() tells us *why* there is no session: a
    // network error while refreshing an old login means "offline", not "signed out".
    const init = async () => {
      window.clearTimeout(retryTimer);
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        attempt = 0;
        applySession(session);
        if (openedFromRecoveryLink && window.location.pathname !== '/reset-password') {
          window.location.replace('/reset-password');
        }
      } else if (error && isAuthRetryableFetchError(error)) {
        setStatus((s) => (s === 'signedIn' ? s : 'reconnecting'));
        retryTimer = window.setTimeout(init, Math.min(30000, 2000 * 2 ** attempt++));
      } else {
        clearSession();
      }
    };
    init();

    const retryNow = () => {
      if (userRef.current === null && !cancelled) { attempt = 0; init(); }
    };
    window.addEventListener('online', retryNow);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION is handled by init(), which can tell "offline" from "signed out".
      if (event === 'INITIAL_SESSION') return;
      // Only a real sign-out (Log out button, or the server rejecting the login) clears the
      // user. Token refreshes, tab re-focus and network errors never do.
      if (event === 'SIGNED_OUT') { clearSession(); return; }
      if (session) applySession(session);
      // A reset link that landed on another page (e.g. the Site URL) still gets the reset form.
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.replace('/reset-password');
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.removeEventListener('online', retryNow);
      subscription.unsubscribe();
    };
  }, [applySession, clearSession]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return { error: error ?? null };
    } catch (error) {
      return { error };
    }
  };

  /**
   * Create the auth account. The profile details are stored on the account itself so the
   * profile row can be created as soon as the user has a session: right away if Supabase
   * signs them in immediately, or on first sign-in after they confirm their email.
   */
  const signUp = async (email: string, password: string, userData: Record<string, string | undefined> = {}): Promise<SignUpResult> => {
    try {
      const metadata: Record<string, string> = {};
      for (const f of PROFILE_FIELDS) if (userData[f]) metadata[f] = String(userData[f]);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: metadata, emailRedirectTo: window.location.origin },
      });
      if (error) return { error };

      // With email confirmation on, Supabase hides whether an address is taken: it
      // "succeeds" but returns a user with no identities. Say so plainly.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: { code: 'user_already_exists', message: 'User already registered' } };
      }

      if (!data.session) return { needsEmailConfirmation: true };

      // Signed in immediately: create the profile now so any problem shows on the form.
      if (data.user) {
        const { error: profileError } = await fetchOrCreateProfile(data.user);
        if (profileError) return { error: profileError };
      }
      return { needsEmailConfirmation: false };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    // scope 'local' = log out this browser only. The old default ('global') logged the
    // user out of every other computer and phone too, which is how people got kicked
    // out after stepping away when someone else used the same login elsewhere.
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      // Offline: the server can't be told, but this browser must still log out.
      console.error('Sign out error (clearing this browser anyway):', error);
      try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* storage unavailable */ }
    }
    clearSession();
  };

  const isAdmin = userProfile?.role === 'admin';
  const isTech = userProfile?.role === 'tech';

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading: status === 'loading' || status === 'reconnecting',
      status,
      profileProblem,
      loadUserProfile,
      signIn,
      signUp,
      signOut,
      isAdmin,
      isTech,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
