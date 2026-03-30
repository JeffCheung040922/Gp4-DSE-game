import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getStats, getStreak, getWrongQuestions, getBossTeaserInfo, getWrongAnswerAnalysis } from '../controllers/dashboardController';

const router = Router();

// authMiddleware accepts both guest and registered users
router.get('/stats', authMiddleware, getStats);
router.get('/streak', authMiddleware, getStreak);
router.get('/weekly-streak', authMiddleware, getStreak);
router.get('/wrong-questions', authMiddleware, getWrongQuestions);
router.get('/wrong-questions-review', authMiddleware, getWrongQuestions);
router.get('/boss-teaser', authMiddleware, getBossTeaserInfo);
router.get('/wrong-answer-analysis', authMiddleware, getWrongAnswerAnalysis);

export default router;
