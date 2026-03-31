import axios from 'axios'
import type { LoginRequest, LoginResponse } from '../types/api'

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
 * POST /api/auth/login
 * @param payload - { username, password }
 * @returns { userId, name }
 */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post('/auth/login', payload)
  return assertObject<LoginResponse>(data, 'login')
}

/**
 * POST /api/auth/logout
 * Invalidates the server-side session / JWT.
 * After calling this the client should clear localStorage and redirect to login.
 */
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } catch (error) {
    console.warn('Logout request failed, but proceeding with local cleanup:', error)
  }
}
