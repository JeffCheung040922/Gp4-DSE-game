/**
 * Supabase Database CRUD Test Script
 * Run: npx tsx scripts/tests/test-supabase.ts
 *
 * 用 Service Role Key 直接喺 auth.users 創建用戶，繞過 RLS
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

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

console.log('🔗 Connecting to:', SUPABASE_URL);

// 普通 client（用於 public tables）
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// 直接喺 auth schema 操作（auth.users 表）
const results: { name: string; status: 'PASS' | 'FAIL'; detail: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅  ${name}`);
    results.push({ name, status: 'PASS', detail: '' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌  ${name}`);
    console.log(`    → ${msg}`);
    results.push({ name, status: 'FAIL', detail: msg });
  }
}

const TEST_EMAIL = 'test@example.com';
const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';

async function ensureTestUser(): Promise<string> {
  console.log('\n🔧 Step 0: 創建 auth.users 測試用戶...\n');

  const { error: insertErr } = await supabase.auth.admin.createUser({
    id: TEST_USER_ID,
    email: TEST_EMAIL,
    password: 'password123',
    email_confirm: true,
  });

  if (insertErr) {
    if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
      console.log(`   (用戶已存在，繼續使用現有 ID)`);
    } else {
      console.log(`   ⚠️  auth.users insert: ${insertErr.message}`);
    }
  } else {
    console.log(`   ✅ auth.users 插入成功`);
  }

  console.log(`   Test User ID: ${TEST_USER_ID}`);
  return TEST_USER_ID;
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('   Supabase CRUD Test');
  console.log('═══════════════════════════════════════════');

  let testUserId: string;
  try {
    testUserId = await ensureTestUser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 無法創建測試用戶: ${msg}`);
    process.exit(1);
  }

  // ── 1. profiles ──────────────────────────────────────────────
  await test('1. profiles SELECT', async () => {
    const { data, error } = await supabase.from('profiles').select('id, username, name, level, xp, gold');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
    data?.forEach((p: Record<string, unknown>) => {
      console.log(`   - ${p.username} | Lv.${p.level} | XP:${p.xp} | Gold:${p.gold}`);
    });
  });

  await test('2. profiles INSERT (upsert)', async () => {
    const { data, error } = await supabase.from('profiles').upsert({
      id: testUserId,
      username: 'testplayer',
      name: 'Test Player',
      avatar: 'knight',
      level: 3,
      xp: 500,
      gold: 200,
    }, { onConflict: 'id' }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: ${data.username} | Lv.${data.level} | XP:${data.xp} | Gold:${data.gold}`);
  });

  // ── 2. characters ─────────────────────────────────────────────
  await test('3. characters SELECT', async () => {
    const { data, error } = await supabase.from('characters').select('*');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
    data?.forEach((c: Record<string, unknown>) => {
      console.log(`   - ${c.name} (${c.character_type}) | HP:${c.health} ATK:${c.attack} DEF:${c.defense}`);
    });
  });

  await test('4. characters INSERT', async () => {
    const { data, error } = await supabase.from('characters').upsert({
      user_id: testUserId,
      name: 'Sir Test',
      character_type: 'knight',
      level: 3,
      xp: 500,
      health: 110,
      attack: 15,
      defense: 8,
    }, { onConflict: 'user_id' }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: ${data.name} | HP:${data.health} ATK:${data.attack} DEF:${data.defense}`);
  });

  // ── 3. question_sets ─────────────────────────────────────────
  await test('5. question_sets SELECT', async () => {
    const { data, error } = await supabase.from('question_sets').select('id, title, subject, difficulty, question_count, xp_reward, gold_reward');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
    data?.forEach((s: Record<string, unknown>) => {
      console.log(`   - ${s.title} | ${s.subject} | ${s.difficulty} | ${s.question_count}Q`);
    });
  });

  let testSetId = '';
  await test('6. question_sets INSERT', async () => {
    const { data, error } = await supabase.from('question_sets').insert({
      title: 'Test Reading Set',
      subject: 'reading',
      difficulty: 'Easy',
      question_count: 3,
      xp_reward: 50,
      gold_reward: 20,
      duration_minutes: 10,
    }).select().single();
    if (error) throw new Error(error.message);
    testSetId = data.id;
    console.log(`   ✅ Inserted: ${data.title} (ID: ${data.id})`);
  });

  // ── 4. questions ─────────────────────────────────────────────
  await test('7. questions SELECT', async () => {
    const { data, error } = await supabase.from('questions').select('id, set_id, question_no, question_text').limit(5);
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
  });

  await test('8. questions INSERT', async () => {
    if (!testSetId) throw new Error('No testSetId from step 6');
    const { data, error } = await supabase.from('questions').insert({
      set_id: testSetId,
      question_no: 1,
      question_text: 'The word "abundant" means?',
      option_a: 'Very scarce',
      option_b: 'Existing in large quantities',
      option_c: 'Completely empty',
      option_d: 'Impossible to find',
      correct_answer: 'B',
      explanation: '"Abundant" means plentiful or existing in large amounts.',
    }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: Q${data.question_no} - ${data.question_text.substring(0, 50)}...`);
  });

  // ── 5. shop_items ────────────────────────────────────────────
  await test('9. shop_items SELECT', async () => {
    const { data, error } = await supabase.from('shop_items').select('item_id, name, item_type, price, effect_type, effect_value');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
    data?.forEach((s: Record<string, unknown>) => {
      console.log(`   - ${s.item_id}: ${s.name} | $${s.price} | ${s.effect_type}:+${s.effect_value}`);
    });
  });

  await test('10. shop_items INSERT', async () => {
    const { data, error } = await supabase.from('shop_items').upsert({
      item_id: 'test_weapon_001',
      name: 'Test Sword',
      description: 'A test weapon for verification.',
      item_type: 'weapon',
      price: 999,
      effect_type: 'attack',
      effect_value: 99,
    }, { onConflict: 'item_id' }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: ${data.name} | $${data.price} | ATK:+${data.effect_value}`);
  });

  // ── 6. inventory ─────────────────────────────────────────────
  await test('11. inventory SELECT', async () => {
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
    data?.forEach((i: Record<string, unknown>) => {
      console.log(`   - ${i.item_name} x${i.quantity} (${i.item_type})`);
    });
  });

  await test('12. inventory INSERT', async () => {
    const { data, error } = await supabase.from('inventory').upsert({
      user_id: testUserId,
      item_id: 'test_weapon_001',
      item_name: 'Test Sword',
      item_type: 'weapon',
      quantity: 1,
    }, { onConflict: 'user_id,item_id' }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: ${data.item_name} x${data.quantity}`);
  });

  // ── 7. user_progress ────────────────────────────────────────
  await test('13. user_progress SELECT', async () => {
    const { data, error } = await supabase.from('user_progress').select('user_id, subject, difficulty, total_questions_attempted, total_correct, accuracy_percentage');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
  });

  await test('14. user_progress INSERT', async () => {
    const { data, error } = await supabase.from('user_progress').upsert({
      user_id: testUserId,
      subject: 'reading',
      difficulty: 'Easy',
      total_questions_attempted: 5,
      total_correct: 4,
      accuracy_percentage: 80,
      last_played_at: new Date().toISOString(),
    }, { onConflict: 'user_id,subject,difficulty' }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: ${data.subject} ${data.difficulty} | Acc:${data.accuracy_percentage}%`);
  });

  // ── 8. game_history ──────────────────────────────────────────
  await test('15. game_history SELECT', async () => {
    const { data, error } = await supabase.from('game_history').select('id, user_id, score, total_questions, xp_earned, gold_earned, accuracy');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
  });

  await test('16. game_history INSERT', async () => {
    const { data, error } = await supabase.from('game_history').insert({
      user_id: testUserId,
      score: 80,
      total_questions: 5,
      xp_earned: 50,
      gold_earned: 20,
      accuracy: 80,
      played_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: Score:${data.score} | XP:+${data.xp_earned} | Gold:+${data.gold_earned} | Acc:${data.accuracy}%`);
  });

  // ── 9. rooms ─────────────────────────────────────────────────
  await test('17. rooms SELECT', async () => {
    const { data, error } = await supabase.from('rooms').select('room_code, name, status, game_mode');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
    data?.forEach((r: Record<string, unknown>) => {
      console.log(`   - ${r.room_code}: ${r.name} | ${r.status} | ${r.game_mode}`);
    });
  });

  let testRoomId = '';
  await test('18. rooms INSERT', async () => {
    const { data, error } = await supabase.from('rooms').insert({
      room_code: 'TESTDB',
      name: 'Test Room',
      host_id: testUserId,
      max_players: 4,
      game_mode: 'PvP',
      status: 'waiting',
    }).select().single();
    if (error) throw new Error(error.message);
    testRoomId = data.id;
    console.log(`   ✅ Inserted: ${data.room_code} | ${data.name} | ${data.status}`);
  });

  // ── 10. room_players ────────────────────────────────────────
  await test('19. room_players SELECT', async () => {
    const { data, error } = await supabase.from('room_players').select('*');
    if (error) throw new Error(error.message);
    console.log(`   Rows: ${data?.length ?? 0}`);
  });

  await test('20. room_players INSERT', async () => {
    if (!testRoomId) throw new Error('No testRoomId from step 18');
    const { error } = await supabase.from('room_players').upsert({
      room_id: testRoomId,
      user_id: testUserId,
      score: 0,
    }, { onConflict: 'room_id,user_id' }).select().single();
    if (error) throw new Error(error.message);
    console.log(`   ✅ Inserted: room:${testRoomId.substring(0, 8)}...`);
  });

  // ── Summary ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('   Test Summary');
  console.log('═══════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`   ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed > 0) {
    console.log('\n   Failed:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   ❌ ${r.name}`);
      console.log(`      ${r.detail}`);
    });
  }
  console.log('\n   Test data:');
  console.log(`   - profile ID:  ${testUserId}`);
  console.log(`   - question set: ${testSetId || '(none)'}`);
  console.log('═══════════════════════════════════════════\n');
}

run().catch(console.error);
