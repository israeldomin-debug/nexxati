import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { BackupController } from '../controllers/backup.controller';
import { authenticateToken, requireAdmin } from '../middlewares';

const router = Router();
const controller = new BackupController();
const restoreDir = path.join(__dirname, '../../backups/restores');
fs.mkdirSync(restoreDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, restoreDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.backup';
    cb(null, `restore-${Date.now()}${ext}`);
  },
});

const uploadBackup = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.hdfbackup', '.backup', '.dump', '.pgdump'].includes(ext) || file.mimetype === 'application/octet-stream') {
      cb(null, true);
      return;
    }
    cb(new Error('Envie um arquivo .hdfbackup, .backup, .dump ou .pgdump.'));
  },
});

router.use(authenticateToken);
router.get('/status', requireAdmin, controller.status.bind(controller));
router.post('/automatic/run', requireAdmin, controller.runAutomatic.bind(controller));
router.get('/download', requireAdmin, controller.create.bind(controller));
router.post('/restore', requireAdmin, uploadBackup.single('file'), controller.restore.bind(controller));

export default router;
