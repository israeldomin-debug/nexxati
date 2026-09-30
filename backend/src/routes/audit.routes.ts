import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticateToken, requireAdmin } from '../middlewares';

const router = Router();
const controller = new AuditController();
router.use(authenticateToken, requireAdmin);
router.get('/', controller.list.bind(controller));
export default router;
