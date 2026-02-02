import { createClient } from '@supabase/supabase-js';

// Updated Supabase configuration with correct API key
const supabaseUrl = 'https://actgfkpgwcfwxaecplhi.supabase.co';
const supabaseKey = 'sb_publishable_VQo_FaEwXivMv3Cdk7Jy3Q_FN1bc6We';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});