import axios from 'axios'
import { getApiBaseUrl } from './apiBaseUrl'

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10_000,
  withCredentials: true,
})

export interface GuestSessionResponse {
  userId: string
  name: string
  sessionToken: string
  isGuest: true
}

export interface ConvertGuestRequest {
  username: string
  password: string
  name: string
}

export interface ConvertGuestResponse {
  userId: string
  name: string
  username: string
  isGuest: false
}

/**
 * POST /api/auth/guest
 * Creates a new guest session or recovers an existing one using a stored session token.
 */
export async function createGuestSession(sessionToken?: string): Promise<GuestSessionResponse> {
  const { data } = await api.post<GuestSessionResponse>('/auth/guest', {
    sessionToken: sessionToken ?? null,
  })
  return data
}

/**
 * POST /api/auth/convert-guest
 * Converts the current guest account to a registered account.
 */
export async function convertGuestToRegistered(
  payload: ConvertGuestRequest
): Promise<ConvertGuestResponse> {
  const { data } = await api.post<ConvertGuestResponse>('/auth/convert-guest', payload)
  return data
}

/**
 * Get the stored guest session token from localStorage.
 */
export function getStoredSessionToken(): string | null {
  return localStorage.getItem('dse_guest_session_token')
}

/**
 * Store the guest session token in localStorage so the same guest
 * account can be recovered across browser sessions.
 */
export function storeSessionToken(token: string) {
  localStorage.setItem('dse_guest_session_token', token)
}
