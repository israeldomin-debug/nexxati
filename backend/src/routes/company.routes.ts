import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { CompanyController } from '../controllers/company.controller';
import { authenticateToken, createResourceLimiter, requireDeletePassword, requirePermission } from '../middlewares';

const router = Router();
const controller = new CompanyController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/', requirePermission(UserPermission.ACCESS_COMPANIES, technicalRoles), controller.list.bind(controller));
router.get('/:id', requirePermission(UserPermission.ACCESS_COMPANIES, technicalRoles), controller.findById.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_COMPANIES), createResourceLimiter, controller.create.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_COMPANIES), controller.update.bind(controller));
router.delete('/:id', requirePermission(UserPermission.MANAGE_COMPANIES), requireDeletePassword, controller.delete.bind(controller));

export default router;
