import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { createRoom, joinRoom, getRoom, startRoom, leaveRoom, getActiveRooms } from '../controllers/roomController';
import { validateCreateRoom, validateJoinRoom, validateRoomCodeParam } from '../middleware/validationMiddleware';

const router = Router();

router.post('/create', authMiddleware, validateCreateRoom, createRoom);
router.post('/join', authMiddleware, validateJoinRoom, joinRoom);
router.get('/active', authMiddleware, getActiveRooms);
router.get('/:roomCode', authMiddleware, validateRoomCodeParam, getRoom);
router.post('/start', authMiddleware, startRoom);
router.post('/leave', authMiddleware, leaveRoom);

export default router;