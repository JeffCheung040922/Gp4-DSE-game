import { Router } from 'express';
import { optionalAuthMiddleware } from '../middleware/authMiddleware';
import { createRoom, joinRoom, getRoom, startRoom, leaveRoom, getActiveRooms } from '../controllers/roomController';
import { validateCreateRoom, validateJoinRoom, validateRoomCodeParam } from '../middleware/validationMiddleware';

const router = Router();

router.post('/create', optionalAuthMiddleware, validateCreateRoom, createRoom);
router.post('/join', optionalAuthMiddleware, validateJoinRoom, joinRoom);
router.get('/active', optionalAuthMiddleware, getActiveRooms);
router.get('/:roomCode', optionalAuthMiddleware, validateRoomCodeParam, getRoom);
router.post('/start', optionalAuthMiddleware, startRoom);
router.post('/leave', optionalAuthMiddleware, leaveRoom);

export default router;