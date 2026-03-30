import axios from 'axios'
import type { RegisterRequest, RegisterResponse } from '../types/api'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
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
 * POST /api/auth/register
 * @param payload - { username, password, name }
 * @returns { userId, name, username }
 */
export async function register(payload: RegisterRequest): Promise<RegisterResponse> {
  const { data } = await api.post('/auth/register', payload)
  return assertObject<RegisterResponse>(data, 'register')
}
