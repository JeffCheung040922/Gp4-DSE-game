import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { generateQuestions, getMemory, updateMemory, getWeakPoints } from '../controllers/aiController';

const router = Router();

router.post('/generate', authMiddleware, generateQuestions);
router.get('/memory', authMiddleware, getMemory);
router.put('/memory', authMiddleware, updateMemory);
router.get('/weak-points', authMiddleware, getWeakPoints);

export default router;
