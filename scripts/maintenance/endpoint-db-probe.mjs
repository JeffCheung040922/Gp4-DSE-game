import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const base = process.env.TEST_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5001';
const runTs = new Date().toISOString();

const tables = [
  'profiles',
  'characters',
  'inventory',
  'rooms',
  'room_players',
  'game_history',
  'user_progress',
];

async function tableCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { head: true, count: 'exact' });
  if (error) {
    return { ok: false, error: error.message, count: null };
  }
  return { ok: true, count: count ?? 0 };
}

async function req(pathname, options = {}) {
  const { method = 'GET', body, cookie } = options;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    setCookie: res.headers.get('set-cookie'),
  };
}

function endpointResult(name, res, note = '') {
  return {
    endpoint: name,
    status: res.status,
    ok: res.ok,
    note,
    response: res.json ?? res.text,
  };
}

async function main() {
  const before = {};
  for (const t of tables) before[t] = await tableCount(t);

  const uname = `probe_${Date.now()}`;
  const pwd = 'password123';

  const results = [];

  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: { username: uname, password: pwd, name: 'Probe User' },
  });
  results.push(endpointResult('POST /api/auth/register', reg));

  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { username: uname, password: pwd },
  });
  const cookie = login.setCookie ? login.setCookie.split(';')[0] : '';
  results.push(endpointResult('POST /api/auth/login', login, cookie ? 'cookie received' : 'no cookie'));

  const authed = async (path, method = 'GET', body = undefined) => req(path, { method, body, cookie });

  results.push(endpointResult('GET /api/character', await authed('/api/character')));
  results.push(endpointResult('POST /api/character', await authed('/api/character', 'POST', { classId: 'knight', name: 'Probe Hero' })));
  results.push(endpointResult('PATCH /api/character', await authed('/api/character', 'PATCH', { name: 'Probe Hero 2' })));
  results.push(endpointResult('DELETE /api/character', await authed('/api/character', 'DELETE')));

  results.push(endpointResult('GET /api/dashboard/stats', await authed('/api/dashboard/stats')));
  results.push(endpointResult('GET /api/dashboard/streak', await authed('/api/dashboard/streak')));
  results.push(endpointResult('GET /api/dashboard/wrong-questions-review', await authed('/api/dashboard/wrong-questions-review')));
  results.push(endpointResult('GET /api/live-boss-teaser', await authed('/api/live-boss-teaser?subject=reading')));

  results.push(endpointResult('GET /api/question-sets', await authed('/api/question-sets?subject=reading&difficulty=Easy')));
  results.push(endpointResult('GET /api/questions', await authed('/api/questions?setId=set-1')));
  results.push(endpointResult('POST /api/submit', await authed('/api/submit', 'POST', { setId: 'set-1', subject: 'reading', answers: [] })));

  results.push(endpointResult('GET /api/inventory', await authed('/api/inventory')));
  results.push(endpointResult('POST /api/inventory/add-gold', await authed('/api/inventory/add-gold', 'POST', { amount: 5 })));
  results.push(endpointResult('POST /api/inventory/use-potion', await authed('/api/inventory/use-potion', 'POST', { potionId: 'small_heal' })));
  results.push(endpointResult('POST /api/shop/buy-potion', await authed('/api/shop/buy-potion', 'POST', { potionId: 'small_heal' })));
  results.push(endpointResult('POST /api/shop/buy-weapon', await authed('/api/shop/buy-weapon', 'POST', { weaponId: 'wood_sword' })));

  const roomCreate = await authed('/api/room/create', 'POST', { subject: 'reading', difficulty: 'easy' });
  results.push(endpointResult('POST /api/room/create', roomCreate));
  if (roomCreate.ok && roomCreate.json?.roomCode) {
    const rc = roomCreate.json.roomCode;
    results.push(endpointResult('GET /api/room/:code', await authed(`/api/room/${rc}`)));
    results.push(endpointResult('POST /api/room/start', await authed('/api/room/start', 'POST', { roomCode: rc })));
    results.push(endpointResult('POST /api/room/leave', await authed('/api/room/leave', 'POST', { roomCode: rc })));
  }

  const after = {};
  for (const t of tables) after[t] = await tableCount(t);

  const deltas = {};
  for (const t of tables) {
    if (before[t].ok && after[t].ok) deltas[t] = after[t].count - before[t].count;
    else deltas[t] = null;
  }

  const output = {
    runAt: runTs,
    supabaseUrl: SUPABASE_URL,
    endpointResults: results,
    tableCountsBefore: before,
    tableCountsAfter: after,
    tableDeltas: deltas,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
