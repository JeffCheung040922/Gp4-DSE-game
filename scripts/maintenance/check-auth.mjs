import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing env');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const raw = fs.readFileSync(path.join(process.cwd(), 'backend', 'data', 'password-store.json'), 'utf8');
const store = JSON.parse(raw);
const ids = new Set(Object.keys(store));

const { data: profiles, error } = await supabase.from('profiles').select('id,username,name').order('created_at', { ascending: false }).limit(30);
if (error) throw error;

console.log('Profiles missing password hash:');
for (const p of profiles || []) {
  if (!ids.has(p.id)) {
    console.log(`- ${p.username} (${p.id})`);
  }
}
