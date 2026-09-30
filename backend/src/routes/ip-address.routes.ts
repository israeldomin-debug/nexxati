import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { IpAddressController } from '../controllers/ip-address.controller';
import { authenticateToken, createResourceLimiter, requireDeletePassword, requirePermission } from '../middlewares';

const router = Router();
const controller = new IpAddressController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];

router.use(authenticateToken);
router.get('/options', requirePermission(UserPermission.ACCESS_IP_ADDRESSES, technicalRoles), controller.options.bind(controller));
router.post('/segments', requirePermission(UserPermission.MANAGE_IP_ADDRESSES), createResourceLimiter, controller.createSegment.bind(controller));
router.patch('/segments/:id', requirePermission(UserPermission.MANAGE_IP_ADDRESSES), controller.updateSegment.bind(controller));
router.delete('/segments/:id', requirePermission(UserPermission.MANAGE_IP_ADDRESSES), requireDeletePassword, controller.deleteSegment.bind(controller));
router.get('/', requirePermission(UserPermission.ACCESS_IP_ADDRESSES, technicalRoles), controller.list.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_IP_ADDRESSES), createResourceLimiter, controller.create.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_IP_ADDRESSES), controller.update.bind(controller));
router.delete('/:id', requirePermission(UserPermission.MANAGE_IP_ADDRESSES), requireDeletePassword, controller.delete.bind(controller));

export default router;
