/**
 * Express mounts JSON routes under `/api` (see backend/server.ts).
 * VITE_API_URL may be origin-only (e.g. https://xxx.up.railway.app) — we append `/api`.
 * If it already ends with `/api`, we leave it unchanged.
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (!raw) return '/api'
  const trimmed = raw.replace(/\/+$/, '')
  if (trimmed === '/api') return '/api'
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}
