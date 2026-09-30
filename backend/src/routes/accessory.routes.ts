import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { AccessoryController } from '../controllers/accessory.controller';
import { authenticateToken, createResourceLimiter, requireAdmin, requireDeletePassword, requirePermission, upload } from '../middlewares';

const router = Router();
const controller = new AccessoryController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/', requirePermission(UserPermission.ACCESS_ACCESSORIES, technicalRoles), controller.list.bind(controller));
router.get('/movements', requirePermission(UserPermission.ACCESS_REPORTS, technicalRoles), controller.movements.bind(controller));
router.get('/:id', requirePermission(UserPermission.ACCESS_ACCESSORIES, technicalRoles), controller.findById.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_ACCESSORIES), createResourceLimiter, controller.create.bind(controller));
router.post('/movements/:movementId/cancel', requirePermission(UserPermission.MANAGE_ACCESSORIES), createResourceLimiter, controller.cancelMovement.bind(controller));
router.patch('/movements/:movementId', requirePermission(UserPermission.MANAGE_ACCESSORIES), createResourceLimiter, controller.updateMovement.bind(controller));
router.post('/:id/movements', requirePermission(UserPermission.MANAGE_ACCESSORIES), createResourceLimiter, controller.move.bind(controller));
router.post('/:id/transfer', requirePermission(UserPermission.MANAGE_ACCESSORIES), createResourceLimiter, controller.transfer.bind(controller));
router.post('/:id/image', requirePermission(UserPermission.MANAGE_ACCESSORIES), upload.single('file'), controller.uploadImage.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_ACCESSORIES), controller.update.bind(controller));
router.post('/:id/restore', requireAdmin, controller.restore.bind(controller));
router.delete('/:id', requireAdmin, requireDeletePassword, controller.delete.bind(controller));

export default router;
