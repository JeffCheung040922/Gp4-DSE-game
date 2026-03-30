import { createClient } from '@supabase/supabase-js';

// ─── Required env vars ────────────────────────────────────────────────────────
// Railway injects env vars automatically as process.env.
// No local .env loading needed — Railway handles this in production.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('  Missing Supabase environment variables!');
  console.error('  SUPABASE_URL:', supabaseUrl ? '✅' : '❌ NOT SET');
  console.error('  SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅' : '❌ NOT SET');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅' : '❌ NOT SET');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('  FIX: Add these variables to Railway Environment Variables');
  console.error('  See DEPLOYMENT_GUIDE.md for step-by-step instructions.');
  console.error('═══════════════════════════════════════════════════════════════');
  // Don't throw — let the server start so Railway health check can detect it
  // The actual API calls will fail with a clear error when Supabase is not configured
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder');

export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl!, supabaseServiceKey)
  : createClient(supabaseUrl || 'https://placeholder.supabase.co', 'placeholder');

