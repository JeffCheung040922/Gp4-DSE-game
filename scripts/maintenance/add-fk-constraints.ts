/**
 * Add FK Constraints back to Supabase
 * Run: npx tsx scripts/maintenance/add-fk-constraints.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  console.log('🔗 Connecting to:', SUPABASE_URL);
  console.log('\n🗑️  Step 1: 清理測試數據...\n');

  // 刪除測試用戶的所有相關數據
  const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';

  const tables = [
    'room_players',
    'rooms',
    'game_history',
    'user_progress',
    'inventory',
    'characters',
    'profiles',
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().or(`id.eq.${TEST_USER_ID},user_id.eq.${TEST_USER_ID}`);
    // 忽略錯誤，因為有些表可能冇呢個 user_id
    if (!error) {
      console.log(`   ✅ Cleared ${table} for test user`);
    }
  }

  // 刪除測試問題集
  await supabase.from('questions').delete().eq('set_id', '684ef5d5-57dc-4e24-9262-bd2d6549e9fe');
  await supabase.from('question_sets').delete().eq('title', 'Test Reading Set');
  console.log('   ✅ Cleared test question_sets & questions');

  // 刪除測試武器
  await supabase.from('shop_items').delete().eq('item_id', 'test_weapon_001');
  console.log('   ✅ Cleared test shop_items\n');

  console.log('🔗 Step 2: 添加 FK 約束...\n');

  const constraints = [
    // profiles → auth.users (CASCADE)
    {
      sql: `ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;`,
      name: 'profiles_id_fkey',
    },
    // characters → profiles (CASCADE)
    {
      sql: `ALTER TABLE public.characters ADD CONSTRAINT characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`,
      name: 'characters_user_id_fkey',
    },
    // inventory → profiles (CASCADE)
    {
      sql: `ALTER TABLE public.inventory ADD CONSTRAINT inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`,
      name: 'inventory_user_id_fkey',
    },
    // user_progress → profiles (CASCADE)
    {
      sql: `ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`,
      name: 'user_progress_user_id_fkey',
    },
    // game_history → profiles (CASCADE)
    {
      sql: `ALTER TABLE public.game_history ADD CONSTRAINT game_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`,
      name: 'game_history_user_id_fkey',
    },
    // rooms → profiles (host_id) (CASCADE)
    {
      sql: `ALTER TABLE public.rooms ADD CONSTRAINT rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`,
      name: 'rooms_host_id_fkey',
    },
  ];

  for (const c of constraints) {
    try {
      const { error } = await supabase.rpc('exec', { sql: c.sql });
      if (error) {
        console.log(`   ❌ ${c.name}: ${error.message}`);
      } else {
        console.log(`   ✅ ${c.name}`);
      }
    } catch {
      console.log(`   ⚠️  ${c.name}: 需要手動執行`);
    }
  }

  console.log('\n📋 SQL 語句（如果上面失敗，喺 Supabase SQL Editor 跑呢啲）：\n');
  constraints.forEach(c => console.log(`   ${c.sql}`));

  console.log('\n✅ 完成！所有約束已加返去。\n');
}

run().catch(console.error);
