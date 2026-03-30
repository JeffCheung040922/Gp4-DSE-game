import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthRequest extends Request {
  userId?: string;
  isGuest?: boolean;
}

interface JWTPayload {
  userId: string;
  isGuest?: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Strict auth: requires a valid JWT cookie. Both guests and registered users pass.
 * Use this for game endpoints (submit, dashboard, inventory) where any authenticated user can access.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (!decoded.userId || typeof decoded.userId !== 'string') {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    req.userId = decoded.userId;
    req.isGuest = decoded.isGuest ?? false;
    next();
  } catch (error) {
    console.error('JWT verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: extracts userId if a valid JWT cookie is present.
 * If no token or invalid token, sets userId to undefined.
 * Use this for endpoints that work for both authenticated users and unauthenticated browsers.
 */
export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;

  if (!token) {
    req.userId = undefined;
    req.isGuest = undefined;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (decoded.userId && typeof decoded.userId === 'string') {
      req.userId = decoded.userId;
      req.isGuest = decoded.isGuest ?? false;
    } else {
      req.userId = undefined;
      req.isGuest = undefined;
    }
    next();
  } catch {
    req.userId = undefined;
    req.isGuest = undefined;
    next();
  }
}
