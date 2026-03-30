import { Router } from 'express';
import { login, register, logout, createGuestSession, convertGuestToRegistered } from '../controllers/authController';
import { validateLogin, validateRegister } from '../middleware/validationMiddleware';

const router = Router();

router.post('/login', validateLogin, login);
router.post('/register', validateRegister, register);
router.post('/logout', logout);
router.post('/guest', createGuestSession);
router.post('/convert-guest', validateRegister, convertGuestToRegistered);

export default router;
