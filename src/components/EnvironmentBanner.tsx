import { IS_PRODUCTION, PROJECT_REF } from '@/lib/env';

// Bright banner shown on every page whenever the app is NOT connected to the
// production Supabase project, so staging data is never mistaken for real data.
export const EnvironmentBanner = () => {
  if (IS_PRODUCTION) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-[9999] w-full bg-yellow-400 px-4 py-1.5 text-center text-sm font-bold uppercase tracking-wider text-black border-b-4 border-black"
    >
      STAGING — not production · Supabase project: {PROJECT_REF ?? 'unknown'}
    </div>
  );
};
