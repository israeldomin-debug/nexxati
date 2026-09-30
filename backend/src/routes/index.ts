import { Router } from 'express';
import authRoutes from './auth.routes';
import ticketRoutes from './ticket.routes';
import dashboardRoutes from './dashboard.routes';
import userRoutes from './user.routes';
import feedbackRoutes from './feedback.routes';
import chatbotRoutes from './chatbot.routes';
import integrationRoutes from './integration.routes';
import assetRoutes from './asset.routes';
import companyRoutes from './company.routes';
import accessoryRoutes from './accessory.routes';
import notificationRoutes from './notification.routes';
import licenseRoutes from './license.routes';
import ipAddressRoutes from './ip-address.routes';
import supplierRoutes from './supplier.routes';
import passwordVaultRoutes from './password-vault.routes';
import disposalRoutes from './disposal.routes';
import backupRoutes from './backup.routes';
import remoteAgentRoutes from './remote-agent.routes';
import systemHealthRoutes from './system-health.routes';
import auditRoutes from './audit.routes';
import managementRoutes from './management.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tickets', ticketRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/feedbacks', feedbackRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/integrations', integrationRoutes);
router.use('/assets', assetRoutes);
router.use('/companies', companyRoutes);
router.use('/accessories', accessoryRoutes);
router.use('/notifications', notificationRoutes);
router.use('/licenses', licenseRoutes);
router.use('/ip-addresses', ipAddressRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/password-vault', passwordVaultRoutes);
router.use('/disposals', disposalRoutes);
router.use('/backup', backupRoutes);
router.use('/remote-agent', remoteAgentRoutes);
router.use('/system-health', systemHealthRoutes);
router.use('/audit', auditRoutes);
router.use('/management', managementRoutes);

// Rota de health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;
