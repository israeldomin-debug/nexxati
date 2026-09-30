import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const backupDir = path.join(__dirname, '../../backups');
const uploadsDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const databaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada.');
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('schema');
    return parsed.toString();
  } catch {
    return url.replace(/[?&]schema=[^&]+(&)?/, (match, trailing) => {
      if (match.startsWith('?') && trailing) return '?';
      return '';
    }).replace(/[?&]$/, '');
  }
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function resolveCommand(command: string) {
  if (command === 'tar') return process.platform === 'win32' ? 'tar.exe' : 'tar';
  if (command !== 'pg_dump' && command !== 'pg_restore') return command;

  const executable = process.platform === 'win32' ? `${command}.exe` : command;
  const configuredDir = process.env.POSTGRES_BIN_DIR || process.env.PG_BIN_DIR;
  const candidates = [
    configuredDir ? path.join(configuredDir, executable) : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PostgreSQL', '17', 'bin', executable) : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PostgreSQL', '16', 'bin', executable) : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PostgreSQL', '15', 'bin', executable) : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PostgreSQL', '14', 'bin', executable) : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, 'PostgreSQL', '17', 'bin', executable) : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, 'PostgreSQL', '16', 'bin', executable) : '',
    executable,
  ].filter(Boolean);

  return candidates.find((candidate) => candidate === executable || fs.existsSync(candidate)) || executable;
}

function runCommand(command: string, args: string[], captureOutput = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => { if (captureOutput) stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error: any) => {
      if (error?.code === 'ENOENT') {
        reject(new Error(`Comando ${command} não encontrado no computador.`));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      reject(new Error(stderr.trim() || `${command} finalizou com código ${code}`));
    });
  });
}

function safeArchiveEntries(entries: string) {
  const names = entries.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (!names.length) throw new Error('O arquivo de backup completo está vazio.');

  for (const rawName of names) {
    const name = rawName.replace(/^\.\//, '').replace(/\\/g, '/');
    const normalized = path.posix.normalize(name);
    const allowed = normalized === '.'
      || normalized === 'database.backup'
      || normalized === 'uploads'
      || normalized.startsWith('uploads/');
    if (!allowed || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
      throw new Error('O arquivo contém um caminho inválido e não pode ser restaurado.');
    }
  }
}

export type RestoreBackupResult = {
  complete: boolean;
  imagesRestored: number;
};

export type BackupStatus = {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFilename: string | null;
  lastSizeBytes: number | null;
  verified: boolean;
  destinationCopied: boolean;
  error: string | null;
};

const emptyBackupStatus: BackupStatus = {
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastSuccessAt: null,
  lastFilename: null,
  lastSizeBytes: null,
  verified: false,
  destinationCopied: false,
  error: null,
};

const statusPath = path.join(backupDir, 'automatic-backup-status.json');
let automaticBackupPromise: Promise<BackupStatus> | null = null;

export class BackupService {
  private readStatus(): BackupStatus {
    try {
      return { ...emptyBackupStatus, ...JSON.parse(fs.readFileSync(statusPath, 'utf8')) };
    } catch {
      return { ...emptyBackupStatus };
    }
  }

  private writeStatus(status: BackupStatus) {
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  }

  async createBackup(kind: 'manual' | 'automatic' = 'manual') {
    const id = timestamp();
    const backupSlug = (process.env.APP_SLUG || 'grupo-geocal').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const filename = `${kind === 'automatic' ? 'auto-' : ''}${backupSlug}-backup-completo-${id}.hdfbackup`;
    const filePath = path.join(backupDir, filename);
    const stagingDir = fs.mkdtempSync(path.join(backupDir, 'create-'));

    try {
      const databasePath = path.join(stagingDir, 'database.backup');
      await runCommand('pg_dump', [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        databasePath,
        databaseUrl(),
      ]);

      const stagingUploads = path.join(stagingDir, 'uploads');
      fs.mkdirSync(stagingUploads, { recursive: true });
      fs.cpSync(uploadsDir, stagingUploads, { recursive: true, force: true });

      // .hdfbackup é um TAR comprimido: um único arquivo contendo banco e uploads.
      await runCommand('tar', ['-czf', filePath, '-C', stagingDir, 'database.backup', 'uploads']);
      return { filename, filePath };
    } catch (error) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw error;
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  async verifyBackup(filePath: string) {
    if (!fs.existsSync(filePath)) throw new Error('Arquivo de backup não encontrado para verificação.');
    const stagingDir = fs.mkdtempSync(path.join(backupDir, 'verify-'));
    try {
      const entries = await runCommand('tar', ['-tzf', filePath], true);
      safeArchiveEntries(entries);
      await runCommand('tar', ['-xzf', filePath, '-C', stagingDir, 'database.backup']);
      const databasePath = path.join(stagingDir, 'database.backup');
      if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) throw new Error('Dump do banco ausente ou vazio.');
      await runCommand('pg_restore', ['--list', databasePath], true);
      return true;
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  private applyRetention() {
    const keep = Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT || 14));
    const files = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith('auto-') && entry.name.endsWith('.hdfbackup'))
      .map((entry) => ({ name: entry.name, path: path.join(backupDir, entry.name), modifiedAt: fs.statSync(path.join(backupDir, entry.name)).mtimeMs }))
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
    for (const expired of files.slice(keep)) fs.unlinkSync(expired.path);
  }

  async runAutomaticBackup() {
    if (automaticBackupPromise) return automaticBackupPromise;
    automaticBackupPromise = (async () => {
      const startedAt = new Date().toISOString();
      this.writeStatus({ ...this.readStatus(), running: true, lastStartedAt: startedAt, lastFinishedAt: null, verified: false, destinationCopied: false, error: null });
      let created: { filename: string; filePath: string } | null = null;
      try {
        created = await this.createBackup('automatic');
        await this.verifyBackup(created.filePath);
        let destinationCopied = false;
        const destination = process.env.BACKUP_DESTINATION_DIR?.trim();
        if (destination) {
          fs.mkdirSync(destination, { recursive: true });
          fs.copyFileSync(created.filePath, path.join(destination, created.filename));
          destinationCopied = true;
        }
        this.applyRetention();
        const finishedAt = new Date().toISOString();
        const status: BackupStatus = {
          running: false,
          lastStartedAt: startedAt,
          lastFinishedAt: finishedAt,
          lastSuccessAt: finishedAt,
          lastFilename: created.filename,
          lastSizeBytes: fs.statSync(created.filePath).size,
          verified: true,
          destinationCopied,
          error: null,
        };
        this.writeStatus(status);
        return status;
      } catch (error) {
        const status: BackupStatus = {
          ...this.readStatus(),
          running: false,
          lastStartedAt: startedAt,
          lastFinishedAt: new Date().toISOString(),
          verified: false,
          destinationCopied: false,
          error: error instanceof Error ? error.message : 'Falha desconhecida no backup automático',
        };
        this.writeStatus(status);
        throw error;
      } finally {
        automaticBackupPromise = null;
      }
    })();
    return automaticBackupPromise;
  }

  getAutomaticStatus() {
    return this.readStatus();
  }

  async restoreBackup(filePath: string): Promise<RestoreBackupResult> {
    if (!fs.existsSync(filePath)) throw new Error('Arquivo de backup não encontrado.');

    if (path.extname(filePath).toLowerCase() !== '.hdfbackup') {
      await runCommand('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        databaseUrl(),
        filePath,
      ]);
      return { complete: false, imagesRestored: 0 };
    }

    const stagingDir = fs.mkdtempSync(path.join(backupDir, 'restore-'));
    try {
      const entries = await runCommand('tar', ['-tzf', filePath], true);
      safeArchiveEntries(entries);
      await runCommand('tar', ['-xzf', filePath, '-C', stagingDir]);

      const databasePath = path.join(stagingDir, 'database.backup');
      if (!fs.existsSync(databasePath)) throw new Error('O backup não contém o banco de dados.');
      await runCommand('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        databaseUrl(),
        databasePath,
      ]);

      const restoredUploads = path.join(stagingDir, 'uploads');
      const imagesRestored = fs.existsSync(restoredUploads)
        ? fs.readdirSync(restoredUploads, { withFileTypes: true }).filter((entry) => entry.isFile()).length
        : 0;
      if (fs.existsSync(restoredUploads)) {
        fs.cpSync(restoredUploads, uploadsDir, { recursive: true, force: true });
      }
      return { complete: true, imagesRestored };
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  cleanup(filePath: string) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
