import { Request, Response } from 'express';
import { BackupService } from '../services/backup.service';

const service = new BackupService();

export class BackupController {
  async status(_req: Request, res: Response) {
    return res.json({ status: service.getAutomaticStatus() });
  }

  async runAutomatic(_req: Request, res: Response) {
    try {
      return res.json({ status: await service.runAutomaticBackup() });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao executar backup automático' });
    }
  }

  async create(_req: Request, res: Response) {
    let backup: { filename: string; filePath: string } | null = null;
    try {
      backup = await service.createBackup();
      return res.download(backup.filePath, backup.filename, (error) => {
        if (backup) service.cleanup(backup.filePath);
        if (error && !res.headersSent) {
          res.status(500).json({ error: error.message || 'Erro ao enviar backup' });
        }
      });
    } catch (error: any) {
      console.error('Erro ao gerar backup:', error);
      if (backup) service.cleanup(backup.filePath);
      return res.status(500).json({ error: error.message || 'Erro ao gerar backup' });
    }
  }

  async restore(req: Request, res: Response) {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Envie um arquivo de backup.' });

    try {
      const result = await service.restoreBackup(file.path);
      service.cleanup(file.path);
      const message = result.complete
        ? `Backup completo restaurado com sucesso. ${result.imagesRestored} arquivo(s) de imagem restaurado(s).`
        : 'Backup antigo do banco restaurado. As imagens não fazem parte desse formato; mantenha a pasta uploads original.';
      return res.json({ message });
    } catch (error: any) {
      console.error('Erro ao restaurar backup:', error);
      service.cleanup(file.path);
      return res.status(400).json({ error: error.message || 'Erro ao restaurar backup' });
    }
  }
}
