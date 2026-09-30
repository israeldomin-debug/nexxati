import { Router } from 'express';
import { authenticateRemoteAgent, RemoteDiscoveryController } from '../controllers/remote-discovery.controller';

const router = Router();
const controller = new RemoteDiscoveryController();

router.use(authenticateRemoteAgent);
router.get('/update', controller.updateManifest.bind(controller));
router.get('/update/download', controller.downloadUpdate.bind(controller));
router.post('/heartbeat', controller.heartbeat.bind(controller));
router.get('/jobs/next', controller.next.bind(controller));
router.post('/jobs/:id/complete', controller.complete.bind(controller));

export default router;
