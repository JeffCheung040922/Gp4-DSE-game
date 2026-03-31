import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/supabase';
import { JWT_CONFIG } from '../lib/jwtConfig';
import { getAuthCookieOptions, getClearAuthCookieOptions } from '../lib/authCookie';
import type { LoginRequest, RegisterRequest } from '../types';

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
    JWT_CONFIG.secret,
    { expiresIn: JWT_CONFIG.guestExpiresIn }
  )
}

// ─── Auth endpoints ────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginRequest;

  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, name, password_hash')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, isGuest: false }, JWT_CONFIG.secret, { expiresIn: JWT_CONFIG.expiresIn });
    res.cookie('token', token, getAuthCookieOptions(7 * 24 * 60 * 60 * 1000));

    return res.json({ userId: user.id, name: user.name, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function register(req: Request, res: Response) {
  const { username, password, name } = req.body as RegisterRequest;

  try {
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    const { data: newUser, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        username,
        name,
        password_hash: hashedPassword,
        avatar: 'knight',
        level: 1,
        xp: 0,
        gold: 100,
        is_guest: false,
      })
      .select('id, username, name')
      .single();

    if (error || !newUser) {
      console.error('Register profile insert error:', JSON.stringify(error, null, 2));
      const errMsg = error?.message ?? '';
      if (errMsg.includes('duplicate key') || errMsg.includes('unique constraint')) {
        return res.status(409).json({ error: 'Username already taken — please choose a different one' });
      }
      if (errMsg.includes('foreign key') || errMsg.includes('violates foreign key')) {
        return res.status(500).json({ error: 'Database setup incomplete — ensure you have run the SQL migration (profiles table missing).' });
      }
      return res.status(500).json({ error: `Failed to register: ${errMsg || 'Unknown database error'}` });
    }

    const token = jwt.sign({ userId: newUser.id, isGuest: false }, JWT_CONFIG.secret, { expiresIn: JWT_CONFIG.expiresIn });
    res.cookie('token', token, getAuthCookieOptions(7 * 24 * 60 * 60 * 1000));

    return res.json({ userId: newUser.id, name: newUser.name, username: newUser.username });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createGuestSession(req: Request, res: Response) {
  const { sessionToken, deviceFingerprint } = req.body as {
    sessionToken?: string
    deviceFingerprint?: string
  }

  try {
    const guestId = randomUUID()
    const newSessionToken = randomUUID()

    if (sessionToken) {
      const { data: existingSession } = await supabaseAdmin
        .from('guest_sessions')
        .select('guest_id')
        .eq('session_token', sessionToken)
        .single()

      if (existingSession) {
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id, name')
          .eq('id', existingSession.guest_id)
          .eq('is_guest', true)
          .single()

        if (existingProfile) {
          const token = issueGuestToken(existingProfile.id, sessionToken)
          res.cookie('token', token, getAuthCookieOptions(30 * 24 * 60 * 60 * 1000))

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

    const guestName = generateGuestName()
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

    await supabaseAdmin
      .from('guest_sessions')
      .insert({
        guest_id: newProfile.id,
        session_token: newSessionToken,
        device_fingerprint: deviceFingerprint ?? null,
      })

    await supabaseAdmin
      .from('inventory')
      .insert({
        user_id: newProfile.id,
        item_id: 'starter_sword',
        item_name: 'Starter Sword',
        item_type: 'weapon',
        quantity: 1,
      })

    const token = issueGuestToken(newProfile.id, newSessionToken)
    res.cookie('token', token, getAuthCookieOptions(30 * 24 * 60 * 60 * 1000))

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

export async function convertGuestToRegistered(req: Request, res: Response) {
  const { username, password, name } = req.body as RegisterRequest & { sessionToken?: string }

  try {
    const guestToken = req.cookies?.token
    if (!guestToken) {
      return res.status(401).json({ error: 'No guest session found' })
    }

    let decoded: { userId: string; isGuest: boolean }
    try {
      decoded = jwt.verify(guestToken, JWT_CONFIG.secret) as { userId: string; isGuest: boolean }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    if (!decoded.isGuest) {
      return res.status(400).json({ error: 'This endpoint is for guest accounts only' })
    }

    const guestId = decoded.userId

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name required' })
    }

    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single()

    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        username,
        name,
        password_hash: hashedPassword,
        is_guest: false,
      })
      .eq('id', guestId)
      .select('id, name')
      .single()

    if (updateError || !updatedProfile) {
      console.error('Convert guest error:', updateError)
      return res.status(500).json({ error: 'Failed to convert guest account' })
    }

    const newToken = jwt.sign({ userId: guestId, isGuest: false }, JWT_CONFIG.secret, { expiresIn: JWT_CONFIG.expiresIn })
    res.cookie('token', newToken, getAuthCookieOptions(7 * 24 * 60 * 60 * 1000))

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
  res.clearCookie('token', getClearAuthCookieOptions())
  return res.json({ message: 'Logged out' })
}
