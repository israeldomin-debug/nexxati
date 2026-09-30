import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

// Criar feedback (usuário autenticado)
router.post('/', FeedbackController.create);

// Buscar feedback por ID
router.get('/:id', FeedbackController.getById);

// Listar feedbacks (Admin/Attendant)
router.get(
  '/',
  requireRole('ADMIN', 'ATTENDANT'),
  FeedbackController.list
);

// Estatísticas de feedback (Admin/Attendant)
router.get(
  '/stats',
  requireRole('ADMIN', 'ATTENDANT'),
  FeedbackController.getStats
);

export default router;
