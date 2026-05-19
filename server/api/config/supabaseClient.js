// server/api/config/supabaseClient.js
// Service-role Supabase client — bypasses RLS for backend operations

import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

let _client = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}

export const supabase = getSupabaseClient();
