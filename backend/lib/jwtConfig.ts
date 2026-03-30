// ─── Shared JWT configuration ──────────────────────────────────────────────────
// Both authMiddleware and authController import from this file
// so the JWT secret is always in sync.

const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export const JWT_CONFIG = {
  secret,
  expiresIn: '7d',
  guestExpiresIn: '30d',
} as const;

export type JWTPayload = {
  userId: string;
  isGuest?: boolean;
  sessionToken?: string;
  iat?: number;
  exp?: number;
};
