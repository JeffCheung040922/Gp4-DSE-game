import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { buyWeapon, buyPotion } from '../controllers/shopController';

const router = Router();

router.post('/buy-weapon', authMiddleware, buyWeapon);
router.post('/buy-potion', authMiddleware, buyPotion);

export default router;