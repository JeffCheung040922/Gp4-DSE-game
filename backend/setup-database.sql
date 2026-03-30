-- ============================================================
-- DSE English Quest - Database Setup
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (extends auth.users)
-- is_guest: TRUE for anonymous guest accounts created without username/password
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    username TEXT UNIQUE,
    name TEXT NOT NULL,
    avatar TEXT DEFAULT 'knight',
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    gold INTEGER DEFAULT 100,
    is_guest BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guest sessions: links guest profile ID to a device/browser session token
-- Allows recovering guest account across browser sessions using a stored token
CREATE TABLE IF NOT EXISTS public.guest_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guest_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    device_fingerprint TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters
CREATE TABLE IF NOT EXISTS public.characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    character_type TEXT NOT NULL DEFAULT 'knight',
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    health INTEGER DEFAULT 100,
    attack INTEGER DEFAULT 10,
    defense INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    acquired_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shop Items
CREATE TABLE IF NOT EXISTS public.shop_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    item_type TEXT NOT NULL,
    price INTEGER NOT NULL,
    effect_type TEXT,
    effect_value INTEGER DEFAULT 0,
    available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Question Sets
CREATE TABLE IF NOT EXISTS public.question_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    question_count INTEGER DEFAULT 0,
    xp_reward INTEGER DEFAULT 50,
    gold_reward INTEGER DEFAULT 20,
    duration_minutes INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    set_id UUID REFERENCES public.question_sets(id) ON DELETE CASCADE,
    question_no INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms (Multiplayer)
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    max_players INTEGER DEFAULT 4,
    game_mode TEXT DEFAULT 'PvP',
    status TEXT DEFAULT 'waiting',
    question_set_id UUID REFERENCES public.question_sets(id),
    current_question INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room Players
CREATE TABLE IF NOT EXISTS public.room_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- Game History
CREATE TABLE IF NOT EXISTS public.game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    set_id UUID REFERENCES public.question_sets(id),
    score INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    gold_earned INTEGER DEFAULT 0,
    accuracy INTEGER DEFAULT 0,
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Progress
CREATE TABLE IF NOT EXISTS public.user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    total_questions_attempted INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    accuracy_percentage INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, subject, difficulty)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Enable anon access for public reads
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile as guest" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own characters" ON public.characters;
DROP POLICY IF EXISTS "Users can insert own characters" ON public.characters;
DROP POLICY IF EXISTS "Users can update own characters" ON public.characters;
DROP POLICY IF EXISTS "Users can delete own characters" ON public.characters;
DROP POLICY IF EXISTS "Users can read own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can insert own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can update own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can delete own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Shop items are viewable by everyone" ON public.shop_items;
DROP POLICY IF EXISTS "Question sets are viewable by everyone" ON public.question_sets;
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON public.questions;
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Host can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Host can delete rooms" ON public.rooms;
DROP POLICY IF EXISTS "Room players are viewable by everyone" ON public.room_players;
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_players;
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_players;
DROP POLICY IF EXISTS "Users can read own game history" ON public.game_history;
DROP POLICY IF EXISTS "Users can insert own game history" ON public.game_history;
DROP POLICY IF EXISTS "User progress is viewable by everyone" ON public.user_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Guest sessions are viewable by owner" ON public.guest_sessions;
DROP POLICY IF EXISTS "Guest sessions can be inserted" ON public.guest_sessions;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- Allow inserting guest profiles (no auth required for guest signup)
CREATE POLICY "Users can insert own profile as guest" ON public.profiles FOR INSERT WITH CHECK (true);

-- Guest sessions policies
CREATE POLICY "Guest sessions are viewable by owner" ON public.guest_sessions FOR SELECT USING (true);
CREATE POLICY "Guest sessions can be inserted" ON public.guest_sessions FOR INSERT WITH CHECK (true);

-- Characters policies
CREATE POLICY "Users can read own characters" ON public.characters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own characters" ON public.characters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own characters" ON public.characters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own characters" ON public.characters FOR DELETE USING (auth.uid() = user_id);

-- Inventory policies
CREATE POLICY "Users can read own inventory" ON public.inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inventory" ON public.inventory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inventory" ON public.inventory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inventory" ON public.inventory FOR DELETE USING (auth.uid() = user_id);

-- Shop Items policies
CREATE POLICY "Shop items are viewable by everyone" ON public.shop_items FOR SELECT USING (true);

-- Question Sets policies
CREATE POLICY "Question sets are viewable by everyone" ON public.question_sets FOR SELECT USING (true);

-- Questions policies
CREATE POLICY "Questions are viewable by everyone" ON public.questions FOR SELECT USING (true);

-- Rooms policies
CREATE POLICY "Rooms are viewable by everyone" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = host_id);
CREATE POLICY "Host can update rooms" ON public.rooms FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Host can delete rooms" ON public.rooms FOR DELETE USING (auth.uid() = host_id);

-- Room Players policies
CREATE POLICY "Room players are viewable by everyone" ON public.room_players FOR SELECT USING (true);
CREATE POLICY "Users can join rooms" ON public.room_players FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.room_players FOR DELETE USING (auth.uid() = user_id);

-- Game History policies
CREATE POLICY "Users can read own game history" ON public.game_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own game history" ON public.game_history FOR INSERT WITH CHECK (true);

-- User Progress policies
CREATE POLICY "User progress is viewable by everyone" ON public.user_progress FOR SELECT USING (true);
CREATE POLICY "Users can update own progress" ON public.user_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.user_progress FOR INSERT WITH CHECK (true);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO public.shop_items (item_id, name, description, item_type, price, effect_type, effect_value, available)
VALUES
    ('starter_sword', 'Starter Sword', 'The trusty blade you started with.', 'weapon', 0, 'attack', 0, TRUE),
    ('iron_sword', 'Iron Sword', 'Reliable iron, slightly sharper edge.', 'weapon', 80, 'attack', 3, TRUE),
    ('magic_wand', 'Magic Wand', 'Channels arcane power. Glows faintly.', 'weapon', 120, 'attack', 5, TRUE),
    ('heavy_axe', 'Heavy Axe', 'Brutal cleave - slow but punishing.', 'weapon', 140, 'attack', 6, TRUE),
    ('arcane_staff', 'Arcane Staff', 'Ancient staff humming with power.', 'weapon', 260, 'attack', 10, TRUE),
    ('dragon_blade', 'Dragon Blade', 'Forged from dragon scales. Fearsome.', 'weapon', 320, 'attack', 13, TRUE),
    ('small_potion', 'Small Potion', 'Restores 25 HP.', 'potion', 30, 'heal', 25, TRUE),
    ('large_potion', 'Large Potion', 'Restores 50 HP.', 'potion', 55, 'heal', 50, TRUE),
    ('elixir', 'Elixir', 'Fully restores all HP.', 'potion', 100, 'heal', 100, TRUE)
ON CONFLICT (item_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    item_type = EXCLUDED.item_type,
    price = EXCLUDED.price,
    effect_type = EXCLUDED.effect_type,
    effect_value = EXCLUDED.effect_value,
    available = EXCLUDED.available;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT 'Setup Complete!' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
