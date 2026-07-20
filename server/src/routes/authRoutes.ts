import { Router } from 'express';
import { register, login, logout, refresh, me, googleLogin } from '../controllers/authController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', authenticate, me);

export default router;
