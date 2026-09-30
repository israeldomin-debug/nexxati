import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { PasswordVaultController } from '../controllers/password-vault.controller';
import { authenticateToken, createResourceLimiter, requireDeletePassword, requirePermission } from '../middlewares';

const router = Router();
const controller = new PasswordVaultController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/options', requirePermission(UserPermission.ACCESS_PASSWORD_VAULT, technicalRoles), controller.options.bind(controller));
router.get('/', requirePermission(UserPermission.ACCESS_PASSWORD_VAULT, technicalRoles), controller.list.bind(controller));
router.get('/:id', requirePermission(UserPermission.ACCESS_PASSWORD_VAULT, technicalRoles), controller.findById.bind(controller));
router.post('/:id/reveal', requirePermission(UserPermission.ACCESS_PASSWORD_VAULT, technicalRoles), controller.reveal.bind(controller));
router.post('/:id/inspect', requirePermission(UserPermission.ACCESS_PASSWORD_VAULT, technicalRoles), controller.inspect.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_PASSWORD_VAULT), createResourceLimiter, controller.create.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_PASSWORD_VAULT), controller.update.bind(controller));
router.delete('/:id', requirePermission(UserPermission.MANAGE_PASSWORD_VAULT), requireDeletePassword, controller.delete.bind(controller));

export default router;
