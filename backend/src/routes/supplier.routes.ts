import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { SupplierController } from '../controllers/supplier.controller';
import { authenticateToken, createResourceLimiter, requireDeletePassword, requirePermission } from '../middlewares';

const router = Router();
const controller = new SupplierController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/', requirePermission(UserPermission.ACCESS_SUPPLIERS, technicalRoles), controller.list.bind(controller));
router.get('/:id', requirePermission(UserPermission.ACCESS_SUPPLIERS, technicalRoles), controller.findById.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_SUPPLIERS), createResourceLimiter, controller.create.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_SUPPLIERS), controller.update.bind(controller));
router.delete('/:id', requirePermission(UserPermission.MANAGE_SUPPLIERS), requireDeletePassword, controller.delete.bind(controller));

export default router;
