import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticateToken } from '../middlewares';

const router = Router();
const controller = new NotificationController();

router.use(authenticateToken);
router.get('/recent', controller.recent.bind(controller));

export default router;
