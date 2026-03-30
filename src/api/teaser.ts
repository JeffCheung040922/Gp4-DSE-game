import axios from 'axios'
import type { LiveBossTeaser } from '../types/api'

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
 * GET /api/live-boss-teaser
 * Backend should decide which boss is live and provide current HP + reward.
 */
export async function fetchLiveBossTeaser(): Promise<LiveBossTeaser> {
  const { data } = await api.get('/live-boss-teaser')
  return assertObject<LiveBossTeaser>(data, 'live-boss-teaser')
}

