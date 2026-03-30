import { Request, Response, NextFunction } from 'express';

// validationMiddleware: input validation for API endpoints
export function validateLogin(req: Request, res: Response, next: NextFunction) {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: 'Valid username required' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  next();
}

export function validateRegister(req: Request, res: Response, next: NextFunction) {
  const { username, password, name } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: 'Valid username required' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Valid name required' });
  }

  next();
}

export function validateCreateRoom(req: Request, res: Response, next: NextFunction) {
  const { subject, difficulty } = req.body;

  const validSubjects = ['reading', 'writing', 'listening', 'speaking', 'oral'];
  const validDifficulties = ['easy', 'medium', 'hard'];
  const normalizedSubject = typeof subject === 'string' ? subject.trim().toLowerCase() : '';
  const normalizedDifficulty = typeof difficulty === 'string' ? difficulty.trim().toLowerCase() : '';
  const titleDifficulty = normalizedDifficulty
    ? normalizedDifficulty.charAt(0).toUpperCase() + normalizedDifficulty.slice(1)
    : '';

  if (!normalizedSubject || !validSubjects.includes(normalizedSubject)) {
    return res.status(400).json({ error: 'Valid subject required (reading, writing, listening, speaking, oral)' });
  }

  if (!normalizedDifficulty || !validDifficulties.includes(normalizedDifficulty)) {
    return res.status(400).json({ error: 'Valid difficulty required (easy, medium, hard)' });
  }

  req.body.subject = normalizedSubject;
  req.body.difficulty = titleDifficulty;

  next();
}

export function validateJoinRoom(req: Request, res: Response, next: NextFunction) {
  const { roomCode } = req.body;

  if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
    return res.status(400).json({ error: 'Valid 6-character room code required' });
  }

  next();
}

export function validateRoomCodeParam(req: Request, res: Response, next: NextFunction) {
  const { roomCode } = req.params;

  if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
    return res.status(400).json({ error: 'Valid 6-character room code required' });
  }

  next();
}