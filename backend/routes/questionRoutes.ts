import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getSets, getQuestions, submitAnswers } from '../controllers/questionController';

const router = Router();

// Public routes - no login required
router.get('/question-sets', getSets);
router.get('/questions', getQuestions);

// Protected route - authMiddleware accepts both guest and registered users
router.post('/submit', authMiddleware, submitAnswers);

export default router;
