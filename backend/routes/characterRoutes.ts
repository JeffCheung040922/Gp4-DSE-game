import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getCharacter, createCharacter, updateCharacter, deleteCharacter } from '../controllers/characterController';

const router = Router();

router.get('/', authMiddleware, getCharacter);
router.post('/', authMiddleware, createCharacter);
router.put('/', authMiddleware, updateCharacter);
router.delete('/', authMiddleware, deleteCharacter);

export default router;