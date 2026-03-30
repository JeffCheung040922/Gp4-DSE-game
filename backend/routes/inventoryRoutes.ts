import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getInventory, equipWeapon, addGold, usePotion } from '../controllers/inventoryController';

const router = Router();

// authMiddleware accepts both guest and registered users
router.get('/', authMiddleware, getInventory);
router.post('/equip-weapon', authMiddleware, equipWeapon);
router.post('/add-gold', authMiddleware, addGold);
router.post('/use-potion', authMiddleware, usePotion);

export default router;
