import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middlewares';

const router = Router();
const dashboardController = new DashboardController();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

router.get('/metrics', dashboardController.getMetrics.bind(dashboardController));
router.get('/trend', dashboardController.getTrend.bind(dashboardController));

export default router;
