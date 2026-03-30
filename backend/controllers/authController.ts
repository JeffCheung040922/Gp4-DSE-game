import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../lib/supabase';
import type { LoginRequest, RegisterRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PASSWORD_STORE_PATH = join(__dirname, '..', 'data', 'password-store.json');

// Simple in-memory password store for testing (in production, use proper auth)
const passwordStore = new Map<string, string>();
let passwordStoreLoaded = false;

async function loadPasswordStore() {
  if (passwordStoreLoaded) return;
  try {
    const raw = await fs.readFile(PASSWORD_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    Object.entries(parsed).forEach(([userId, hash]) => {
      if (typeof hash === 'string' && hash.length > 0) {
        passwordStore.set(userId, hash);
      }
    });
  } catch {
    // First run or missing file is expected.
  } finally {
    passwordStoreLoaded = true;
  }
}

async function persistPasswordStore() {
  await fs.mkdir(join(__dirname, '..', 'data'), { recursive: true });
  const serialized = JSON.stringify(Object.fromEntries(passwordStore), null, 2);
  await fs.writeFile(PASSWORD_STORE_PATH, serialized, 'utf8');
}

// ─── Guest Session helpers ────────────────────────────────────────────────────

function generateGuestName(): string {
  const adjectives = ['Brave', 'Swift', 'Mighty', 'Clever', 'Bold', 'Keen', 'Noble', 'Wise']
  const nouns = ['Learner', 'Student', 'Scholar', 'Voyager', 'Explorer', 'Knight', 'Hero', 'Warrior']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj} ${noun}`
}

function issueGuestToken(guestId: string, sessionToken: string): string {
  return jwt.sign(
    { userId: guestId, isGuest: true, sessionToken },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
}

// ─── Auth endpoints ────────────────────────────────────────────────────────────

// authController: handles login/register/logout/guest endpoints
// IMPLEMENTED: Uses Supabase profiles table for persistence
// Login: Query profiles by username → verify bcrypt password → generate JWT
// Register: Generate UUID → hash password with bcrypt → insert into profiles table
// Guest: Create guest profile → issue guest JWT → return session token for recovery
export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginRequest;

  try {
    await loadPasswordStore();

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Query profiles table for user
    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, name')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password from in-memory store
    const storedHashedPassword = passwordStore.get(user.id);
    if (!storedHashedPassword) {
      return res.status(401).json({ error: 'Account password not initialized. Please register with the same username once to set it.' });
    }

    const passwordMatch = await bcrypt.compare(password, storedHashedPassword);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ userId: user.id, name: user.name, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function register(req: Request, res: Response) {
  const { username, password, name } = req.body as RegisterRequest;

  try {
    await loadPasswordStore();

    // Validate input
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name required' });
    }

    // Check if username already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id, username, name')
      .eq('username', username)
      .single();

    if (existingUser) {
      const existingPasswordHash = passwordStore.get(existingUser.id);
      if (existingPasswordHash) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      // User profile exists (maybe from guest-to-registered migration) — set password
      const seededHash = await bcrypt.hash(password, 10);
      passwordStore.set(existingUser.id, seededHash);
      await persistPasswordStore();

      const token = jwt.sign({ userId: existingUser.id, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({ userId: existingUser.id, name: existingUser.name, username: existingUser.username });
    }

    // Create new user with proper UUID
    const userId = randomUUID();

    // Hash password and store in memory
    const hashedPassword = await bcrypt.hash(password, 10);
    passwordStore.set(userId, hashedPassword);

    // Insert new user into profiles table
    const { data: newUser, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        username,
        name,
        avatar: 'knight',
        level: 1,
        xp: 0,
        gold: 100,
        is_guest: false,
      })
      .select('id, username, name')
      .single();

    if (error || !newUser) {
      console.error('Register error:', error);
      passwordStore.delete(userId);
      await persistPasswordStore();
      return res.status(500).json({ error: 'Failed to register user' });
    }

    await persistPasswordStore();

    // Generate JWT token
    const token = jwt.sign({ userId: newUser.id, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ userId: newUser.id, name: newUser.name, username: newUser.username });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/auth/guest
 * Creates a guest session. If sessionToken is provided, attempts to recover
 * an existing guest account so progress is preserved across browser sessions.
 * Returns: { userId, name, sessionToken, isGuest: true }
 */
export async function createGuestSession(req: Request, res: Response) {
  const { sessionToken, deviceFingerprint } = req.body as {
    sessionToken?: string
    deviceFingerprint?: string
  }

  try {
    const guestId = randomUUID()
    const newSessionToken = randomUUID()

    // ── Attempt to recover existing guest session ────────────────────────────
    if (sessionToken) {
      const { data: existingSession } = await supabaseAdmin
        .from('guest_sessions')
        .select('guest_id')
        .eq('session_token', sessionToken)
        .single()

      if (existingSession) {
        // Recover existing guest profile
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id, name')
          .eq('id', existingSession.guest_id)
          .eq('is_guest', true)
          .single()

        if (existingProfile) {
          // Session token unchanged — reuse it
          const token = issueGuestToken(existingProfile.id, sessionToken)
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
          })

          // Update last active timestamp
          await supabaseAdmin
            .from('guest_sessions')
            .update({ last_active_at: new Date().toISOString() })
            .eq('session_token', sessionToken)

          return res.json({
            userId: existingProfile.id,
            name: existingProfile.name,
            sessionToken,
            isGuest: true,
          })
        }
      }
    }

    // ── Create new guest account ─────────────────────────────────────────────
    const guestName = generateGuestName()

    // Insert guest profile
    const guestUsername = `guest_${guestId.replace(/-/g, '').slice(0, 12)}`
    const { data: newProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: guestId,
        username: guestUsername,
        name: guestName,
        avatar: 'knight',
        level: 1,
        xp: 0,
        gold: 50,
        is_guest: true,
      })
      .select('id, name')
      .single()

    if (profileError || !newProfile) {
      console.error('Guest profile creation error:', profileError)
      return res.status(500).json({ error: 'Failed to create guest account' })
    }

    // Insert guest session record
    await supabaseAdmin
      .from('guest_sessions')
      .insert({
        guest_id: newProfile.id,
        session_token: newSessionToken,
        device_fingerprint: deviceFingerprint ?? null,
      })

    // Also give them the starter sword in inventory
    await supabaseAdmin
      .from('inventory')
      .insert({
        user_id: newProfile.id,
        item_id: 'starter_sword',
        item_name: 'Starter Sword',
        item_type: 'weapon',
        quantity: 1,
      })

    // Issue JWT
    const token = issueGuestToken(newProfile.id, newSessionToken)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })

    return res.json({
      userId: newProfile.id,
      name: newProfile.name,
      sessionToken: newSessionToken,
      isGuest: true,
    })
  } catch (err) {
    console.error('Create guest session error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * POST /api/auth/convert-guest
 * Converts a guest account to a registered account.
 * Preserves all game progress (XP, gold, inventory, history).
 */
export async function convertGuestToRegistered(req: Request, res: Response) {
  const { username, password, name } = req.body as RegisterRequest & { sessionToken?: string }

  try {
    // Decode the current guest JWT to get the guest userId
    const guestToken = req.cookies?.token
    if (!guestToken) {
      return res.status(401).json({ error: 'No guest session found' })
    }

    let decoded: { userId: string; isGuest: boolean }
    try {
      decoded = jwt.verify(guestToken, JWT_SECRET) as { userId: string; isGuest: boolean }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    if (!decoded.isGuest) {
      return res.status(400).json({ error: 'This endpoint is for guest accounts only' })
    }

    const guestId = decoded.userId

    // Validate input
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name required' })
    }

    // Check if username is taken
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single()

    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' })
    }

    // Hash password
    await loadPasswordStore()
    const hashedPassword = await bcrypt.hash(password, 10)
    passwordStore.set(guestId, hashedPassword)

    // Update guest profile to registered
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        username,
        name,
        is_guest: false,
      })
      .eq('id', guestId)
      .select('id, name')
      .single()

    if (updateError || !updatedProfile) {
      console.error('Convert guest error:', updateError)
      passwordStore.delete(guestId)
      return res.status(500).json({ error: 'Failed to convert guest account' })
    }

    await persistPasswordStore()

    // Issue a new non-guest JWT
    const newToken = jwt.sign({ userId: guestId, isGuest: false }, JWT_SECRET, { expiresIn: '7d' })
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    return res.json({
      userId: updatedProfile.id,
      name: updatedProfile.name,
      username,
      isGuest: false,
    })
  } catch (err) {
    console.error('Convert guest error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token')
  return res.json({ message: 'Logged out' })
}
