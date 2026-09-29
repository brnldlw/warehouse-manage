// Browser side of the admin-create-tech Edge Function (supabase/functions/admin-create-tech).
// The browser only sends the signed-in admin's token; the server decides the company and role.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const FUNCTION = 'admin-create-tech';

export interface CreateTechInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialty: string;
  truckId?: string;
  mode: 'invite' | 'no_email';
}

export interface CreateTechResult {
  techId: string;
  name: string;
  emailSent: boolean;
  inviteLinkSeconds: number;
  vanAssigned: boolean;
  warning?: string;
}

export interface TechSignInStatus {
  id: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
}

export class AdminTechError extends Error {
  constructor(message: string, public code?: string, public notDeployed = false) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    body: { ...body, redirectTo: `${window.location.origin}/reset-password` },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let payload: { error?: string; code?: string; message?: string } = {};
      try { payload = await res.json(); } catch { /* not JSON */ }
      if (res.status === 404 && !payload.error) {
        throw new AdminTechError('The technician service (admin-create-tech) is not deployed yet. See docs/ADMIN_CREATE_TECH.md.', 'not_deployed', true);
      }
      throw new AdminTechError(payload.error ?? payload.message ?? `The server returned an error (${res.status}).`, payload.code);
    }
    if (error instanceof FunctionsFetchError) {
      throw new AdminTechError("Couldn't reach the technician service. Check your internet connection. If this keeps happening, the service may not be deployed yet.", 'unreachable', true);
    }
    throw new AdminTechError(error.message ?? 'Unexpected error.');
  }
  if (!data?.ok) throw new AdminTechError(data?.error ?? 'Unexpected response from the server.', data?.code);
  return data as T;
}

export const createTechnician = (input: CreateTechInput) => call<CreateTechResult>({ action: 'create', ...input });

export const resendTechInvite = (techId: string) =>
  call<{ email: string; inviteLinkSeconds: number }>({ action: 'resend', techId });

export const getTechSignInStatus = async (): Promise<TechSignInStatus[]> =>
  (await call<{ statuses: TechSignInStatus[] }>({ action: 'status' })).statuses;

/** "3600 seconds (1 hour)" */
export function describeLinkLifetime(seconds: number): string {
  const hours = seconds / 3600;
  const friendly = seconds % 3600 === 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${Math.round(seconds / 60)} minutes`;
  return `${seconds.toLocaleString('en-US')} seconds (${friendly})`;
}
