import { Router } from 'express';
import { SystemHealthController } from '../controllers/system-health.controller';
import { authenticateToken, requireAdmin } from '../middlewares';

const router = Router();
const controller = new SystemHealthController();
router.use(authenticateToken, requireAdmin);
router.get('/', controller.get.bind(controller));
export default router;
