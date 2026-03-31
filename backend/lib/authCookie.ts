/**
 * Auth cookie options for httpOnly JWT.
 * Production: SPA (e.g. Vercel) + API (e.g. Railway) are different sites →
 * SameSite=Lax cookies are NOT sent on cross-origin XHR/fetch. Use None + Secure.
 */
export function getAuthCookieOptions(maxAgeMs: number) {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = isProd ? ('none' as const) : ('lax' as const);
  const secure = isProd;
  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: maxAgeMs,
    path: '/',
  } as const;
}

/** Must match set options so browsers actually remove the cookie. */
export function getClearAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  } as const;
}
