import axios from 'axios'
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  Subject,
} from '../types/api'
import { getApiBaseUrl } from './apiBaseUrl'

type RoomDifficulty = 'Easy' | 'Medium' | 'Hard'

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10_000,
  withCredentials: true,
})

function assertObject<T>(data: unknown, label: string): T {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Backend not reachable — ${label} returned unexpected response`)
  }
  return data as T
}

function toApiDifficulty(difficulty: RoomDifficulty): 'easy' | 'medium' | 'hard' {
  return difficulty.toLowerCase() as 'easy' | 'medium' | 'hard'
}

function normalizeDifficulty(difficulty: string): RoomDifficulty {
  const normalized = difficulty.trim().toLowerCase()
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'hard') return 'Hard'
  return 'Easy'
}

function normalizeRoomResponse<T extends { difficulty: string }>(room: T): T & { difficulty: RoomDifficulty } {
  return {
    ...room,
    difficulty: normalizeDifficulty(room.difficulty),
  }
}

/**
 * POST /api/room/create
 * Create a new multiplayer room. The current user becomes the host.
 * @param subject - quiz subject for this room
 * @param difficulty - Easy | Medium | Hard
 * @param playerName - display name of the host (optional)
 * @param classId - character class ID of the host (optional)
 * @returns { roomCode, hostId, subject, difficulty }
 */
export async function createRoom(
  subject: Subject,
  difficulty: RoomDifficulty,
  playerName?: string,
  classId?: string
): Promise<CreateRoomResponse> {
  const { data } = await api.post('/room/create', { 
    subject, 
    difficulty: toApiDifficulty(difficulty),
    playerName,
    classId,
  })
  return normalizeRoomResponse(assertObject<CreateRoomResponse>(data, 'create-room'))
}

/**
 * GET /api/room/:code
 * Get room details by room code.
 * @param roomCode - the unique room code
 * @returns { roomCode, hostId, players, subject, difficulty }
 */
export async function getRoom(roomCode: string): Promise<JoinRoomResponse> {
  const { data } = await api.get(`/room/${roomCode}`)
  return normalizeRoomResponse(assertObject<JoinRoomResponse>(data, 'get-room'))
}

/**
 * POST /api/room/join
 * Join an existing multiplayer room.
 * @param roomCode - the room code to join
 * @param playerName - display name of the joining player
 * @param classId - character class ID
 * @returns { roomCode, hostId, players, subject, difficulty }
 */
export async function joinRoom(roomCode: string, playerName?: string, classId?: string): Promise<JoinRoomResponse> {
  const { data } = await api.post('/room/join', { 
    roomCode,
    playerName,
    classId,
  })
  return normalizeRoomResponse(assertObject<JoinRoomResponse>(data, 'join-room'))
}

/**
 * POST /api/room/leave
 * Leave the current room (all housekeeping handled server-side).
 * @param roomCode - the room to leave
 */
export async function leaveRoom(roomCode: string): Promise<void> {
  await api.post('/room/leave', { roomCode })
}

/**
 * POST /api/room/start
 * Host marks the room as started (transitions lobby → battle).
 * @param roomCode - the room to start
 */
export async function startRoom(roomCode: string): Promise<void> {
  await api.post('/room/start', { roomCode })
}

/**
 * GET /api/room/active
 * Fetch the current player's active room (if any).
 * Returns null / 404 if not in a room.
 * @returns { roomCode, hostId, players, subject, difficulty } | null
 */
export async function fetchActiveRoom(): Promise<JoinRoomResponse | null> {
  try {
    const { data } = await api.get('/room/active')
    return normalizeRoomResponse(assertObject<JoinRoomResponse>(data, 'fetch-active-room'))
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null
    throw err
  }
}
