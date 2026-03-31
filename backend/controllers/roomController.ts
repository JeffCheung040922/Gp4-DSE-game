import { Response } from 'express';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/supabase';
import type { AuthRequest } from '../middleware/authMiddleware';
import type { CreateRoomRequest, JoinRoomRequest } from '../types';
import { createRoom as createRoomInSocket, getRoom as getSocketRoom } from '../socketHandler';

/**
 * Creates a minimal guest profile on-the-fly for unauthenticated users (e.g. entering Co-op without logging in).
 * The profile is created with a random UUID and is_guest=true so it can be stored in rooms table FKs.
 */
async function ensureGuestProfile(playerName?: string): Promise<{ userId: string; name: string }> {
  const guestId = randomUUID();
  const guestName = playerName || `Guest_${guestId.slice(0, 6).toUpperCase()}`;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: guestId,
      username: `guest_${guestId.replace(/-/g, '').slice(0, 12)}`,
      name: guestName,
      avatar: 'knight',
      level: 1,
      xp: 0,
      gold: 0,
      is_guest: true,
    })
    .select('id, name')
    .single();

  if (error || !data) {
    // Fallback: return a temporary guest ID so the room can still be created
    console.error('[ensureGuestProfile] Guest profile insert failed:', error);
    return { userId: `guest_${guestId.replace(/-/g, '').slice(0, 8)}`, name: guestName };
  }

  return { userId: data.id, name: data.name };
}

function normalizeSocketRoomResponse(roomCode: string, room: ReturnType<typeof getSocketRoom>) {
  if (!room) return null;
  return {
    roomCode,
    hostId: room.hostId,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      classId: player.classId,
    })),
    subject: room.subject,
    difficulty: room.difficulty,
  };
}

// roomController: HTTP room endpoints (create, join, get)
// IMPLEMENTED: Database persistence + WebSocket integration
// Tables: public.rooms + public.room_players + public.question_sets
// rooms columns: id (UUID), room_code (UNIQUE), name, host_id (UUID FK→profiles.id), max_players, game_mode, status, question_set_id, current_question, created_at
// room_players columns: id (UUID), room_id (UUID FK→rooms.id), user_id (UUID FK→profiles.id), score, joined_at (UNIQUE: room_id+user_id)
// createRoom(): Generate room_code → query question_set → insert room + add host to room_players
// joinRoom(): Verify room exists → add user to room_players table
// getRoom(): Return room + players from database
// Note: Also uses WebSocket handler for real-time updates
export async function createRoom(req: AuthRequest, res: Response) {
  let userId = req.userId;
  const { subject, difficulty, playerName, classId } = req.body as CreateRoomRequest;

  try {
    // Unauthenticated users get a transient guest profile so rooms FKs remain valid
    if (!userId) {
      const guest = await ensureGuestProfile(playerName);
      userId = guest.userId;
    }

    if (!subject || !difficulty) {
      return res.status(400).json({ error: 'Subject and difficulty required' });
    }

    // Generate room code - exactly 6 characters
    let roomCode = '';
    do {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (roomCode.length !== 6);

    // Get question set for this subject/difficulty
    const { data: questionSet } = await supabaseAdmin
      .from('question_sets')
      .select('id')
      .ilike('subject', `%${subject}%`)
      .ilike('difficulty', `%${difficulty}%`)
      .limit(1)
      .single();

    // Create room in database
    const { data: newRoom, error: roomError } = await supabaseAdmin
      .from('rooms')
      .insert({
        room_code: roomCode,
        name: `${subject} ${difficulty} Room`,
        host_id: userId,
        max_players: 4,
        game_mode: 'PvP',
        status: 'waiting',
        question_set_id: questionSet?.id || null,
      })
      .select()
      .single();

    if (roomError || !newRoom) {
      console.error('Create room error:', roomError);
      return res.status(500).json({ error: 'Failed to create room' });
    }

    // Add host to room_players
    await supabaseAdmin
      .from('room_players')
      .insert({
        room_id: newRoom.id,
        user_id: userId,
        score: 0,
      });

    // Also create in WebSocket handler for real-time features
    const socketRoom = createRoomInSocket(
      roomCode, 
      userId, 
      subject, 
      difficulty,
      playerName || 'Player',
      classId || 'knight'
    );

    return res.json(normalizeSocketRoomResponse(roomCode, socketRoom));
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ error: 'Failed to create room' });
  }
}

export async function joinRoom(req: AuthRequest, res: Response) {
  let userId = req.userId;
  const { roomCode, playerName, classId } = req.body as JoinRoomRequest;

  try {
    if (!userId) {
      const guest = await ensureGuestProfile(playerName);
      userId = guest.userId;
    }

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code required' });
    }

    const socketRoom = getSocketRoom(roomCode);
    if (socketRoom) {
      const exists = socketRoom.players.some(player => player.id === userId);
      if (!exists) {
        socketRoom.players.push({
          id: userId,
          name: playerName || 'Player',
          classId: classId || 'knight',
          ready: false,
          score: 0,
          charHp: socketRoom.teamHp,
        });
      }

      return res.json(normalizeSocketRoomResponse(roomCode, socketRoom));
    }

    // Get room from database
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, room_code, host_id')
      .eq('room_code', roomCode)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Add user to room_players
    await supabaseAdmin
      .from('room_players')
      .upsert(
        {
          room_id: room.id,
          user_id: userId,
          score: 0,
        },
        { onConflict: 'room_id,user_id' }
      );

    return res.json({
      roomCode: room.room_code,
      hostId: room.host_id,
      players: [{ id: userId, name: playerName || 'Player', classId: classId || 'knight' }],
      subject: 'reading',
      difficulty: 'Easy',
    });
  } catch (err) {
    console.error('Join room error:', err);
    return res.status(500).json({ error: 'Failed to join room' });
  }
}

export async function getRoom(req: AuthRequest, res: Response) {
  const { roomCode } = req.params;

  try {
    // Validate required fields
    if (!roomCode) {
      return res.status(400).json({ error: 'Room code required' });
    }

    const socketRoom = getSocketRoom(roomCode);
    const socketResponse = normalizeSocketRoomResponse(roomCode, socketRoom);
    if (socketResponse) {
      return res.json(socketResponse);
    }

    // Get room from database
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, room_code, host_id, question_sets(subject, difficulty)')
      .eq('room_code', roomCode)
      .single();

    if (roomError || !room) {
      console.error('Get room lookup error:', roomError);
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get players in room
    const { data: players } = await supabaseAdmin
      .from('room_players')
      .select('user_id')
      .eq('room_id', room.id);

    const questionSet = Array.isArray(room.question_sets)
      ? room.question_sets[0]
      : room.question_sets;

    return res.json({
      roomCode: room.room_code,
      hostId: room.host_id,
      players: (players || []).map(p => ({ id: p.user_id, name: 'Player', classId: 'knight' })),
      subject: questionSet?.subject ?? 'reading',
      difficulty: questionSet?.difficulty ?? 'Easy',
    });
  } catch (err) {
    console.error('Get room error:', err);
    return res.status(500).json({ error: 'Failed to fetch room' });
  }
}

export async function startRoom(req: AuthRequest, res: Response) {
  const userId = req.userId;
  const { roomCode } = req.body as { roomCode: string };

  // Validate
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!roomCode || typeof roomCode !== 'string') {
    return res.status(400).json({ error: 'Valid room code required' });
  }

  const room = getSocketRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Only host can start the room
  if (room.hostId !== userId) {
    return res.status(403).json({ error: 'Only room host can start the game' });
  }

  // Verify at least 2 players
  if (room.players.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 players to start' });
  }

  room.status = 'playing';
  return res.json({
    message: 'Game started',
    room: {
      ...normalizeSocketRoomResponse(roomCode, room),
      status: room.status,
      bossHp: room.bossHp,
      teamHp: room.teamHp,
      currentQuestion: room.currentQuestion,
      totalQuestions: room.questions.length,
    },
  });
}

export async function leaveRoom(req: AuthRequest, res: Response) {
  const userId = req.userId;
  const { roomCode } = req.body as { roomCode: string };

  // Validate
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!roomCode || typeof roomCode !== 'string') {
    return res.status(400).json({ error: 'Valid room code required' });
  }

  const room = getSocketRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Remove player from room
  const playerIndex = room.players.findIndex(p => p.id === userId);
  if (playerIndex !== -1) {
    room.players.splice(playerIndex, 1);
  }

  // Delete empty rooms
  if (room.players.length === 0) {
    return res.json({ message: 'Left room, room is now empty' });
  }

  // Reassign host if needed
  if (room.hostId === userId && room.players.length > 0) {
    room.hostId = room.players[0].id;
  }

  return res.json({
    message: 'Left room',
    room: {
      ...normalizeSocketRoomResponse(roomCode, room),
      status: room.status,
      bossHp: room.bossHp,
      currentQuestion: room.currentQuestion,
      totalQuestions: room.questions.length,
    },
  });
}
export async function getActiveRooms(req: AuthRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Return rooms where user is a player (would use database in production)
  // For now, return empty list since rooms are managed via WebSocket
  return res.json({ rooms: [] });
}
