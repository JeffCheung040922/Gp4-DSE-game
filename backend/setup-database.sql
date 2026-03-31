-- ============================================================
-- DSE English Quest - Database Setup (FIXED for JWT-based auth)
-- Run this in Supabase SQL Editor
-- IMPORTANT: This project uses its own JWT auth (NOT Supabase Auth)
-- RLS is bypassed by the backend via service_role key
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
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Guest sessions: links guest profile ID to a device/browser session token
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

-- Inventory (FIXED: added unique constraint for upsert)
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, item_id)
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
-- Since this project uses custom JWT auth (NOT Supabase Auth),
-- the backend uses service_role key to bypass RLS entirely.
-- These policies are permissive to allow all operations via service_role.
-- ============================================================

-- Disable RLS on all tables (backend handles auth via JWT, not Supabase RLS)
-- This is the safest approach since supabaseAdmin uses service_role key
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_sets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress DISABLE ROW LEVEL SECURITY;

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
