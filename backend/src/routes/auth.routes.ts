import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken, loginLimiter } from '../middlewares';

const router = Router();
const authController = new AuthController();

// Rotas públicas (sem autenticação)
router.post('/register', authController.register.bind(authController));
router.post('/login', loginLimiter, authController.login.bind(authController));
router.post('/forgot-password', loginLimiter, authController.forgotPassword.bind(authController));
router.post('/reset-password-with-code', loginLimiter, authController.resetPasswordWithCode.bind(authController));

// Rotas protegidas
router.get('/me', authenticateToken, authController.me.bind(authController));
router.post('/change-password', authenticateToken, authController.changePassword.bind(authController));

export default router;
