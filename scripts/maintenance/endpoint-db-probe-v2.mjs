/**
 * Improved Supabase Endpoint CRUD Probe (v2)
 * Tests if endpoints actually write to database with proper auth flow
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('❌ .env file not found at backend/.env');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_URL = process.env.TEST_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5001';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

console.log('🔗 Connecting to:', SUPABASE_URL);
console.log('🖥️  Backend URL:', BACKEND_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const results = [];
let authToken = null;
let testUserId = null;
let testUsername = null;
let testPassword = null;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    results.push({ name, status: 'PASS', detail: '' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ ${name}`);
    console.log(`   → ${msg}`);
    results.push({ name, status: 'FAIL', detail: msg });
  }
}

async function getTableCounts() {
  const tables = ['profiles', 'characters', 'inventory', 'rooms', 'room_players', 'game_history', 'user_progress'];
  const counts = {};
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('id', { head: true, count: 'exact' });
    counts[table] = { ok: !error, count: count || 0, error: error?.message };
  }
  return counts;
}

async function run() {
  console.log('\n═══════════════════════════════════════════');
  console.log('   Endpoint DB Probe v2 (with Auth)');
  console.log('═══════════════════════════════════════════\n');

  // Get initial table counts
  console.log('📊 Measuring initial table counts...');
  const countsBefore = await getTableCounts();
  console.log('Before:', Object.entries(countsBefore).map(([t, { count }]) => `${t}:${count}`).join(', '));

  // Test 1: Register new user
  await test('1. Register user', async () => {
    testUsername = 'probe_test_' + Date.now();
    testPassword = 'probe_password_123';

    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUsername,
        password: testPassword,
        name: 'Probe Test User',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }

    testUserId = data.userId;
    // Extract token from Set-Cookie header
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      authToken = setCookie.split(';')[0];
    }
    console.log(`   → User ID: ${testUserId}, Username: ${data.username}`);
  });

  // Test 2: Login with same user
  let loginHeaders = {};
  await test('2. Login user', async () => {
    if (!testUsername || !testPassword) {
      throw new Error('No credentials from registration');
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUsername,
        password: testPassword,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }

    // Extract token from Set-Cookie header
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      loginHeaders['cookie'] = setCookie.split(';')[0];
    }
    console.log(`   → Logged in as: ${data.username}`);
  });

  // Test 3: Create character
  await test('3. Create character', async () => {
    if (!testUserId) throw new Error('No user ID');

    const response = await fetch(`${BACKEND_URL}/api/character`, {
      method: 'POST',
      headers: { ...loginHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: 'knight',
        name: 'Probe Knight',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }
    console.log(`   → Created: ${data.name} (${data.classId})`);
  });

  // Test 4: Get character
  await test('4. Get character', async () => {
    if (!testUserId) throw new Error('No user ID');

    const response = await fetch(`${BACKEND_URL}/api/character`, {
      headers: loginHeaders,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }
    console.log(`   → Retrieved: ${data.name}`);
  });

  // Test 5: Get question sets
  await test('5. Get question sets', async () => {
    if (!testUserId) throw new Error('No user ID');

    const response = await fetch(`${BACKEND_URL}/api/question-sets?subject=reading&difficulty=Easy`, {
      headers: loginHeaders,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }
    console.log(`   → Retrieved: ${(Array.isArray(data) ? data.length : 0)} sets`);
  });

  // Test 6: Get inventory
  await test('6. Get inventory', async () => {
    if (!testUserId) throw new Error('No user ID');

    const response = await fetch(`${BACKEND_URL}/api/inventory`, {
      headers: loginHeaders,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }
    console.log(`   → Gold: ${data.gold}, Weapons: ${data.ownedWeaponIds.length}`);
  });

  // Test 7: Get dashboard stats
  await test('7. Get dashboard stats', async () => {
    if (!testUserId) throw new Error('No user ID');

    const response = await fetch(`${BACKEND_URL}/api/dashboard/stats`, {
      headers: loginHeaders,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${data.error}`);
    }
    console.log(`   → Level: ${data.level}, XP: ${data.totalXp}, Gold: ${data.totalGold}`);
  });

  // Get final table counts
  console.log('\n📊 Measuring final table counts...');
  const countsAfter = await getTableCounts();
  console.log('After:', Object.entries(countsAfter).map(([t, { count }]) => `${t}:${count}`).join(', '));

  // Calculate deltas
  const deltas = {};
  Object.keys(countsBefore).forEach(table => {
    deltas[table] = (countsAfter[table].count || 0) - (countsBefore[table].count || 0);
  });

  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log('   Test Summary');
  console.log('═══════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`✅ Passed: ${passed} | ❌ Failed: ${failed}`);

  console.log('\n📈 Table Deltas (rows added):');
  Object.entries(deltas).forEach(([table, delta]) => {
    console.log(`   ${table}: ${delta > 0 ? '+' : ''}${delta}`);
  });

  const hasChanges = Object.values(deltas).some(d => d !== 0);
  console.log(`\n${hasChanges ? '✅ Database writes detected!' : '❌ No database writes detected'}`);

  console.log('\n═══════════════════════════════════════════\n');
}

run().catch(console.error);
