import { BackupService } from './backup.service';

const service = new BackupService();
let schedulerStarted = false;

const shouldRunToday = () => {
  if ((process.env.BACKUP_AUTO_ENABLED || 'true').toLowerCase() === 'false') return false;
  const hour = Math.min(23, Math.max(0, Number(process.env.BACKUP_AUTO_HOUR || 2)));
  const now = new Date();
  if (now.getHours() !== hour) return false;
  const lastSuccess = service.getAutomaticStatus().lastSuccessAt;
  return !lastSuccess || new Date(lastSuccess).toDateString() !== now.toDateString();
};

export function startBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const check = () => {
    if (!shouldRunToday()) return;
    service.runAutomaticBackup().catch((error) => console.error('Falha no backup automático:', error));
  };
  setTimeout(check, 10_000);
  setInterval(check, 60_000).unref();
}
