import { Router } from 'express';
import { UserPermission, UserRole } from '@prisma/client';
import { AssetController } from '../controllers/asset.controller';
import { authenticateToken, createResourceLimiter, requireAdmin, requireDeletePassword, requirePermission } from '../middlewares';
import { NetworkDiscoveryController } from '../controllers/network-discovery.controller';
import { RemoteDiscoveryController } from '../controllers/remote-discovery.controller';
import multer from 'multer';

const router = Router();
const controller = new AssetController();
const discoveryController = new NetworkDiscoveryController();
const remoteDiscoveryController = new RemoteDiscoveryController();
const technicalRoles = [UserRole.ATTENDANT, UserRole.ADMIN];
const invoiceXmlUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

router.use(authenticateToken);
router.get('/', requirePermission(UserPermission.ACCESS_ASSETS, technicalRoles), controller.list.bind(controller));
router.get('/discovery/ignored', requirePermission(UserPermission.DISCOVER_ASSETS), discoveryController.listIgnored.bind(discoveryController));
router.post('/discovery/ignored', requirePermission(UserPermission.DISCOVER_ASSETS), discoveryController.ignoreIp.bind(discoveryController));
router.delete('/discovery/ignored/:id', requirePermission(UserPermission.DISCOVER_ASSETS), discoveryController.unignoreIp.bind(discoveryController));
router.post('/discover', requirePermission(UserPermission.DISCOVER_ASSETS), discoveryController.discover.bind(discoveryController));
router.post('/remote-discovery/jobs', requirePermission(UserPermission.DISCOVER_ASSETS), remoteDiscoveryController.create.bind(remoteDiscoveryController));
router.get('/remote-discovery/agents', requirePermission(UserPermission.DISCOVER_ASSETS), remoteDiscoveryController.listAgents.bind(remoteDiscoveryController));
router.get('/remote-discovery/jobs/:id', requirePermission(UserPermission.DISCOVER_ASSETS), remoteDiscoveryController.get.bind(remoteDiscoveryController));
router.post('/import', requirePermission(UserPermission.MANAGE_ASSETS), createResourceLimiter, discoveryController.importDevices.bind(discoveryController));
router.post('/inventory/detailed', requirePermission(UserPermission.DISCOVER_ASSETS), discoveryController.detailedInventory.bind(discoveryController));
router.post('/inventory/cctv', requirePermission(UserPermission.DISCOVER_ASSETS), discoveryController.cctvInventory.bind(discoveryController));
router.get('/reports/maintenance', requirePermission(UserPermission.ACCESS_ASSETS, technicalRoles), controller.maintenanceReport.bind(controller));
router.post('/purchase-invoice/xml', requirePermission(UserPermission.MANAGE_ASSETS), invoiceXmlUpload.single('file'), controller.parseInvoiceXml.bind(controller));
router.post('/:id/windows-license/reveal', requireAdmin, controller.revealWindowsLicense.bind(controller));
router.get('/:id', requirePermission(UserPermission.ACCESS_ASSETS, technicalRoles), controller.findById.bind(controller));
router.post('/', requirePermission(UserPermission.MANAGE_ASSETS), createResourceLimiter, controller.create.bind(controller));
router.patch('/:id', requirePermission(UserPermission.MANAGE_ASSETS), controller.update.bind(controller));
router.post('/:id/checkout', requirePermission(UserPermission.MANAGE_ASSETS), controller.checkout.bind(controller));
router.post('/:id/checkin', requirePermission(UserPermission.MANAGE_ASSETS), controller.checkin.bind(controller));
router.post('/:id/maintenance/complete', requirePermission(UserPermission.MANAGE_ASSETS), controller.completeMaintenance.bind(controller));
router.post('/:id/donor', requirePermission(UserPermission.MANAGE_ASSETS), controller.makeDonor.bind(controller));
router.post('/:id/agent-peripherals/sync', requirePermission(UserPermission.MANAGE_ASSETS), controller.syncAgentPeripherals.bind(controller));
router.delete('/:id', requireAdmin, requireDeletePassword, controller.delete.bind(controller));

export default router;
