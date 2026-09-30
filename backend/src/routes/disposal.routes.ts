import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { DisposalController } from '../controllers/disposal.controller';
import { authenticateToken, createResourceLimiter, requireAdmin, requireDeletePassword, requirePermission } from '../middlewares';

const router = Router();
const controller = new DisposalController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/', requirePermission(UserPermission.ACCESS_ASSETS, technicalRoles), controller.list.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_ASSETS), createResourceLimiter, controller.create.bind(controller));
router.delete('/:id', requireAdmin, requireDeletePassword, controller.delete.bind(controller));

export default router;
