/**
 * Database Room Test
 * Tests Supabase database room tables connection
 * 
 * Run: npx ts-node scripts/tests/test-db-room.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://peamiulkmcqzxhrnnwdb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BlYcGNYTzVJvPsJcVl4W6g_e1qbQhY4';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function testDatabaseRoom() {
  console.log('🧪 Testing Supabase Database Room...\n');

  // Test 1: Check if rooms table exists
  console.log('1️⃣  Testing rooms table...');
  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .limit(5);
    
    if (error) {
      console.log('❌ Rooms table error:', error.message);
    } else {
      console.log('✅ Rooms table connected!');
      console.log('   Found:', rooms?.length || 0, 'rooms\n');
    }
  } catch (error: unknown) {
    console.log('❌ Cannot connect to rooms table:', getErrorMessage(error));
  }

  // Test 2: Check if room_players table exists
  console.log('2️⃣  Testing room_players table...');
  try {
    const { data: players, error } = await supabase
      .from('room_players')
      .select('*')
      .limit(5);
    
    if (error) {
      console.log('❌ Room_players table error:', error.message);
    } else {
      console.log('✅ Room_players table connected!');
      console.log('   Found:', players?.length || 0, 'players\n');
    }
  } catch (error: unknown) {
    console.log('❌ Cannot connect to room_players table:', getErrorMessage(error));
  }

  // Test 3: Create a test room
  console.log('3️⃣  Testing create room...');
  const testRoomCode = 'TEST01';
  try {
    const { data: newRoom, error } = await supabase
      .from('rooms')
      .insert({
        room_code: testRoomCode,
        host_id: '00000000-0000-0000-0000-000000000001',
        subject: 'reading',
        difficulty: 'easy',
        status: 'waiting',
      })
      .select()
      .single();

    if (error) {
      console.log('❌ Create room error:', error.message);
    } else {
      console.log('✅ Room created successfully!');
      console.log('   Room ID:', newRoom?.id);
      console.log('   Room Code:', newRoom?.room_code, '\n');
    }
  } catch (error: unknown) {
    console.log('❌ Cannot create room:', getErrorMessage(error));
  }

  // Test 4: Read the test room
  console.log('4️⃣  Testing read room...');
  try {
    const { data: readRoom, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', testRoomCode)
      .single();

    if (error) {
      console.log('❌ Read room error:', error.message);
    } else {
      console.log('✅ Room read successfully!');
      console.log('   Room Code:', readRoom?.room_code);
      console.log('   Subject:', readRoom?.subject);
      console.log('   Difficulty:', readRoom?.difficulty);
      console.log('   Status:', readRoom?.status, '\n');
    }
  } catch (error: unknown) {
    console.log('❌ Cannot read room:', getErrorMessage(error));
  }

  // Test 5: Delete test room
  console.log('5️⃣  Testing delete room...');
  try {
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('room_code', testRoomCode);

    if (error) {
      console.log('❌ Delete room error:', error.message);
    } else {
      console.log('✅ Room deleted successfully!\n');
    }
  } catch (error: unknown) {
    console.log('❌ Cannot delete room:', getErrorMessage(error));
  }

  console.log('🏁 Database Room Test Complete!');
}

testDatabaseRoom();
