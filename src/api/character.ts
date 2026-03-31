import axios from 'axios'
import type { CreateCharacterRequest, CharacterResponse } from '../types/api'

import { getApiBaseUrl } from './apiBaseUrl'

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

/**
 * POST /api/character
 * Create or update the current user's character.
 * @param payload - { classId, name }
 * @returns { userId, classId, name, xp, level }
 */
export async function createCharacter(
  payload: CreateCharacterRequest
): Promise<CharacterResponse> {
  const { data } = await api.post('/character', payload)
  return assertObject<CharacterResponse>(data, 'create-character')
}

/**
 * GET /api/character
 * Fetch the current user's character. Returns 404 if none exists yet.
 * @returns { userId, classId, name, xp, level }
 */
export async function fetchCharacter(): Promise<CharacterResponse> {
  const { data } = await api.get('/character')
  return assertObject<CharacterResponse>(data, 'fetch-character')
}

/**
 * PUT /api/character
 * Update the current user's character name.
 * @param name - new character name
 * @returns { userId, classId, name, xp, level }
 */
export async function updateCharacterName(name: string): Promise<CharacterResponse> {
  const { data } = await api.put('/character', { name })
  return assertObject<CharacterResponse>(data, 'update-character')
}
