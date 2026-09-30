import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { LicenseController } from '../controllers/license.controller';
import { authenticateToken, createResourceLimiter, requireDeletePassword, requirePermission } from '../middlewares';

const router = Router();
const controller = new LicenseController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/options', requirePermission(UserPermission.ACCESS_LICENSES, technicalRoles), controller.options.bind(controller));
router.get('/', requirePermission(UserPermission.ACCESS_LICENSES, technicalRoles), controller.list.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_LICENSES), createResourceLimiter, controller.create.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_LICENSES), controller.update.bind(controller));
router.delete('/:id', requirePermission(UserPermission.MANAGE_LICENSES), requireDeletePassword, controller.delete.bind(controller));

export default router;
