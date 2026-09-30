import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type ReleaseMetadata = {
  version?: string;
  file?: string;
  sha256?: string;
  size?: number;
  publishedAt?: string;
};

const releaseDirectory = path.resolve(process.cwd(), process.env.AGENT_RELEASE_DIRECTORY || '../remote-agent/dist');
const metadataPath = path.join(releaseDirectory, 'agent-release.json');
const defaultExecutable = 'IDL-Ativos-Agent.exe';

const versionParts = (value: string) => value.split('.').map((part) => Number(part) || 0);
const isNewerVersion = (latest: string, current: string) => {
  const left = versionParts(latest);
  const right = versionParts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
};

export class AgentUpdateService {
  private release() {
    if (!fs.existsSync(metadataPath)) return null;
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as ReleaseMetadata;
    const version = String(metadata.version || '').trim();
    const fileName = path.basename(String(metadata.file || defaultExecutable));
    const executablePath = path.join(releaseDirectory, fileName);
    if (!/^\d+\.\d+\.\d+$/.test(version) || !fs.existsSync(executablePath)) return null;

    const buffer = fs.readFileSync(executablePath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
      version,
      fileName,
      executablePath,
      sha256,
      size: buffer.length,
      publishedAt: metadata.publishedAt || fs.statSync(executablePath).mtime.toISOString(),
    };
  }

  currentVersion() {
    return this.release()?.version || null;
  }

  manifest(currentVersion: string) {
    const release = this.release();
    if (!release) return {
      available: false,
      currentVersion: currentVersion || null,
      latestVersion: null,
      reason: 'Nenhuma versão do agente foi publicada no servidor',
    };

    return {
      available: isNewerVersion(release.version, currentVersion || '0.0.0'),
      currentVersion: currentVersion || null,
      latestVersion: release.version,
      sha256: release.sha256,
      size: release.size,
      publishedAt: release.publishedAt,
      downloadUrl: '/remote-agent/update/download',
    };
  }

  executable() {
    const release = this.release();
    if (!release) throw new Error('Nenhuma versão do agente foi publicada no servidor');
    return release;
  }
}

