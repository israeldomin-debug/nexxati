import { ChangeEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { Ban, Camera, FileUp, Loader2, LockKeyhole, Network, Printer, Radar, RotateCcw, Server, ShieldAlert, Wifi, WifiOff, X } from 'lucide-react';
import { assetService, RemoteDiscoveryAgent, RemoteDiscoveryJob } from '../services/asset.service';
import { handleApiError } from '../services/api';
import { AssetType, Company, DiscoveredDevice, DiscoveryIgnoredIp, DiscoveryIgnoreMode } from '../types';

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped?: number;
  mode: 'network' | 'printer' | 'detailed' | 'cctv';
}

interface Props {
  companies: Company[];
  onClose: () => void;
  onImported: (summary: ImportSummary) => void;
}

type DiscoveryMode = 'scan' | 'printer' | 'file' | 'detailed' | 'cctv' | 'remote';

type ProgressState = {
  label: string;
  done: number;
  total: number;
};

const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const macPattern = /(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i;
const commonCameraPorts = new Set([80, 81, 82, 85, 88, 443, 554, 8000, 8001, 8008, 8080, 8081, 8088, 8090, 8554, 8899, 8999, 9000, 34567, 37777, 37778]);

const inferDeviceFromHtmlRow = (cells: string[], rowText: string): DiscoveredDevice | null => {
  const ipAddress = cells.find((cell) => ipv4Pattern.test(cell));
  if (!ipAddress) return null;

  const lowerText = rowText.toLowerCase();
  const macAddress = cells.find((cell) => macPattern.test(cell))?.match(macPattern)?.[0]?.replace(/-/g, ':').toUpperCase() || null;
  const openPorts = cells
    .map((cell) => Number(cell))
    .filter((port) => Number.isInteger(port) && commonCameraPorts.has(port));
  const looksLikeCamera = /onvif|ipcamera|ip camera|\bipc\b|c[aâ]mera|camera/.test(lowerText);
  const looksLikeRecorder = /\bdvr\b|\bnvr\b|\bxvr\b|\bhvr\b|mhdx|gravador/.test(lowerText);
  const online = /(^|\s)(on|online|ativo|active)(\s|$)/.test(lowerText)
    || looksLikeCamera
    || looksLikeRecorder
    || openPorts.length > 0;
  const name = cells.find((cell) => cell && cell !== ipAddress && !/^\d+$/.test(cell) && !macPattern.test(cell) && !/^(on|online|off|offline)$/i.test(cell)) || null;

  return {
    online,
    hostname: name,
    ipAddress,
    manufacturer: looksLikeCamera ? 'Câmera IP' : looksLikeRecorder ? 'DVR / NVR' : null,
    model: null,
    serialNumber: null,
    firmware: null,
    macAddress,
    type: looksLikeRecorder ? 'DVR_NVR' : looksLikeCamera ? 'CAMERA' : 'OTHER',
    openPorts: [...new Set(openPorts)],
    source: looksLikeCamera || looksLikeRecorder ? 'DVR_CAMERA_LIST' : 'HTML_IMPORT',
  };
};

const typeLabels: Record<AssetType, string> = {
  DESKTOP: 'Desktop',
  NOTEBOOK: 'Notebook',
  SERVER: 'Servidor',
  VIRTUAL_MACHINE: 'Máquina virtual',
  MONITOR: 'Monitor',
  MOUSE: 'Mouse',
  KEYBOARD: 'Teclado',
  PRINTER: 'Impressora',
  MOBILE: 'Celular',
  TABLET: 'Tablet',
  IP_PHONE: 'Telefone IP',
  VOIP_SERVER: 'Servidor VoIP / PABX',
  CAMERA: 'Câmera',
  DVR_NVR: 'DVR / NVR',
  ROUTER: 'Roteador',
  SWITCH: 'Switch',
  ACCESS_POINT: 'Access point',
  ANTENNA: 'Antena',
  TIME_CLOCK: 'Relógio de ponto',
  TURNSTILE: 'Catraca',
  FIREWALL: 'Firewall',
  UPS: 'Nobreak / UPS',
  OTHER: 'Não identificado',
};

const splitIntoChunks = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

export function NetworkDiscovery({ companies, onClose, onImported }: Props) {
  const [mode, setMode] = useState<DiscoveryMode>('scan');
  const [prefix, setPrefix] = useState('192.168.2');
  const [firstIp, setFirstIp] = useState(11);
  const [lastIp, setLastIp] = useState(255);
  const [companyId, setCompanyId] = useState('');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [unidentifiedDevices, setUnidentifiedDevices] = useState<DiscoveredDevice[]>([]);
  const [ignoredIps, setIgnoredIps] = useState<DiscoveryIgnoredIp[]>([]);
  const [skipKnownIps, setSkipKnownIps] = useState(true);
  const [deepScan, setDeepScan] = useState(false);
  const [skippedKnownIps, setSkippedKnownIps] = useState(0);
  const [windowsFailures, setWindowsFailures] = useState<Array<{ ipAddress: string; error?: string; ignored?: boolean }>>([]);
  const [windowsCollected, setWindowsCollected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [duplicateDevices, setDuplicateDevices] = useState<DiscoveredDevice[]>([]);
  const [partialImport, setPartialImport] = useState({ created: 0, updated: 0, failed: 0 });
  const [cctvType, setCctvType] = useState<'DVR_NVR' | 'CAMERA'>('DVR_NVR');
  const [remoteSiteName, setRemoteSiteName] = useState('Empresa remota');
  const [remoteAgentInfo, setRemoteAgentInfo] = useState<RemoteDiscoveryJob['agentInfo']>(null);
  const [registeredAgents, setRegisteredAgents] = useState<RemoteDiscoveryAgent[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ label: '', done: 0, total: 0 });
  const [progressElapsedSeconds, setProgressElapsedSeconds] = useState(0);
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const targets = () => Array.from({ length: lastIp - firstIp + 1 }, (_, index) => `${prefix}.${firstIp + index}`);
  const validRange = (max: number) =>
    /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(prefix) &&
    firstIp >= 1 &&
    lastIp <= 255 &&
    lastIp >= firstIp &&
    lastIp - firstIp + 1 <= max;

  const progressPercent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const currentIgnoreMode = (): DiscoveryIgnoreMode => mode === 'printer' ? 'PRINTER' : mode === 'detailed' ? 'WINDOWS' : 'NETWORK';

  useEffect(() => {
    if (mode === 'file' || mode === 'cctv') return;
    assetService.listDiscoveryIgnored(currentIgnoreMode()).then(setIgnoredIps).catch(() => setIgnoredIps([]));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'remote') return;
    assetService.listRemoteDiscoveryAgents().then((agents) => {
      setRegisteredAgents(agents);
      const names = [...new Set(agents.map((agent) => agent.agentName))];
      setRemoteSiteName((current) => names.includes(current) ? current : names.length === 1 ? names[0] : current);
    }).catch(() => setRegisteredAgents([]));
  }, [mode]);

  useEffect(() => {
    if (!loading && !importing) {
      setProgressElapsedSeconds(0);
      return;
    }

    setProgressElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setProgressElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading, importing]);

  const preferredAgentAdapter = (agent: RemoteDiscoveryAgent) => {
    const adapters = agent.agentInfo.networkAdapters?.filter((item) => item.ipAddresses?.length) || [];
    return adapters.find((item) => item.ipAddresses.some((ip) => ip.startsWith(`${prefix}.`)))
      || adapters.find((item) => !/virtual|vethernet|hyper-v|vpn|loopback|docker|wsl/i.test(item.name))
      || adapters[0];
  };

  const addRegisteredAgent = (agent: RemoteDiscoveryAgent) => {
    const adapter = preferredAgentAdapter(agent);
    const ipAddress = adapter?.ipAddresses?.find((ip) => ip.startsWith(`${prefix}.`)) || adapter?.ipAddresses?.[0];
    if (!ipAddress) {
      setError(`A máquina ${agent.computerName} não informou um endereço IPv4.`);
      return;
    }
    const device: DiscoveredDevice = {
      ipAddress,
      hostname: agent.computerName,
      macAddress: adapter.macAddress || null,
      manufacturer: agent.agentInfo.manufacturer || null,
      model: agent.agentInfo.model || null,
      serialNumber: agent.agentInfo.serialNumber || null,
      firmware: null,
      online: Date.now() - new Date(agent.lastSeenAt).getTime() < 5 * 60 * 1000,
      responseTimeMs: 0,
      source: 'REGISTERED_INTERNAL_AGENT',
      type: agent.agentInfo.deviceType || (agent.agentInfo.operatingSystem?.toLowerCase().includes('server') ? 'SERVER' : 'DESKTOP'),
      openPorts: [],
      operatingSystem: agent.agentInfo.operatingSystem || null,
      osVersion: agent.agentInfo.osVersion || null,
      osArchitecture: agent.agentInfo.architecture || null,
      processor: agent.agentInfo.processor || null,
      cpuCores: agent.agentInfo.cpuCores || null,
      cpuLogicalProcessors: agent.agentInfo.cpuLogicalProcessors || null,
      memoryMb: agent.agentInfo.memoryMb || null,
      diskGb: agent.agentInfo.disks?.reduce((sum, disk) => sum + disk.sizeGb, 0) || null,
      diskFreeGb: agent.agentInfo.disks?.reduce((sum, disk) => sum + disk.freeGb, 0) || null,
      loggedUser: agent.agentInfo.loggedUser || null,
      domain: agent.agentInfo.domain || null,
      workgroup: agent.agentInfo.workgroup || null,
      systemType: agent.agentInfo.systemType || null,
      biosVersion: agent.agentInfo.biosVersion || null,
      biosReleaseDate: agent.agentInfo.biosReleaseDate || null,
      windowsInstallDate: agent.agentInfo.windowsInstallDate || null,
      lastBootAt: agent.agentInfo.lastBootAt || null,
      gateway: adapter?.gatewayAddresses?.[0] || null,
      windowsLicenseKey: null,
      windowsProductKeyProtected: agent.agentInfo.windowsProductKeyProtected || null,
      windowsLicenseStatus: agent.agentInfo.windowsLicenseStatus === 1 ? 'LICENCIADO' : `STATUS_${agent.agentInfo.windowsLicenseStatus || 0}`,
      windowsProductKeyPartial: agent.agentInfo.windowsProductKeyPartial || null,
    };
    setDevices((current) => [...current.filter((item) => item.ipAddress !== device.ipAddress), device]);
  };

  const setPreset = (nextMode: DiscoveryMode) => {
    setMode(nextMode);
    setError('');
    setDevices([]);
    setUnidentifiedDevices([]);
    setWindowsFailures([]);
    setWindowsCollected(0);
    setDuplicateDevices([]);
    setSkippedKnownIps(0);
    setAdminPassword('');
    setProgress({ label: '', done: 0, total: 0 });
    if (nextMode === 'printer') {
      setPrefix('192.168.1');
      setFirstIp(1);
      setLastIp(254);
    }
    if (nextMode === 'detailed') {
      setPrefix('192.168.1');
      setFirstIp(3);
      setLastIp(62);
      setSkipKnownIps(false);
    } else {
      setSkipKnownIps(true);
    }
    if (nextMode === 'cctv') {
      setPrefix('192.168.2');
      setFirstIp(11);
      setLastIp(255);
    }
  };

  const scan = async () => {
    setError('');
    if (!validRange(256)) {
      setError('Informe uma faixa válida, limitada a 256 endereços privados.');
      return;
    }

    const targetList = targets();
    setLoading(true);
    setDevices([]);
    setUnidentifiedDevices([]);
    setSkippedKnownIps(0);
    setProgress({ label: mode === 'printer' ? 'Buscando e identificando impressoras' : deepScan ? 'Escaneando IPs em modo profundo' : 'Escaneando IPs da rede', done: 0, total: targetList.length });

    try {
      const found: DiscoveredDevice[] = [];
      const unidentified: DiscoveredDevice[] = [];
      const ignored = new Map<string, DiscoveryIgnoredIp>();
      let skippedKnown = 0;
      for (const chunk of splitIntoChunks(targetList, deepScan ? 4 : 64)) {
        const result = await assetService.discover(chunk, currentIgnoreMode(), skipKnownIps, null, deepScan ? 'deep' : 'standard');
        skippedKnown += result.skippedKnown || 0;
        result.ignored.forEach((item) => ignored.set(item.id, item));
        const matchingDevices = mode === 'printer'
          ? result.devices.filter((device) => device.type === 'PRINTER')
          : result.devices;
        if (mode === 'printer') unidentified.push(...result.devices.filter((device) => device.online && device.type === 'OTHER'));
        found.push(...matchingDevices);
        setDevices([...found].sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })));
        setUnidentifiedDevices([...unidentified].sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })));
        setIgnoredIps([...ignored.values()].sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })));
        setSkippedKnownIps(skippedKnown);
        setProgress((current) => ({ ...current, done: Math.min(current.done + chunk.length, current.total) }));
      }
      if (mode === 'printer' && !found.length) {
        setError(unidentified.length ? 'Nenhuma impressora foi confirmada. Revise os IPs não identificados abaixo e use Ignorar quando não forem impressoras.' : 'Nenhuma impressora foi identificada nessa faixa. Desktops e notebooks não foram incluídos.');
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const ignoreIp = async (ipAddress: string, reason: string) => {
    try {
      const ignored = await assetService.ignoreDiscoveryIp(ipAddress, currentIgnoreMode(), reason);
      setIgnoredIps((current) => [...current.filter((item) => item.id !== ignored.id), ignored].sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })));
      setUnidentifiedDevices((current) => current.filter((device) => device.ipAddress !== ipAddress));
      setDevices((current) => current.filter((device) => device.ipAddress !== ipAddress));
      setWindowsFailures((current) => current.map((item) => item.ipAddress === ipAddress ? { ...item, ignored: true, error: 'Ignorado na busca de computadores' } : item));
      setError('');
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const unignoreIp = async (ignored: DiscoveryIgnoredIp) => {
    try {
      await assetService.unignoreDiscoveryIp(ignored.id);
      setIgnoredIps((current) => current.filter((item) => item.id !== ignored.id));
      setWindowsFailures((current) => current.filter((item) => item.ipAddress !== ignored.ipAddress));
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setFileName(file.name);
    setProgress({ label: '', done: 0, total: 0 });

    try {
      const document = new DOMParser().parseFromString(await file.text(), 'text/html');
      const parsed = Array.from(document.querySelectorAll('table tr')).map((row) => {
        const cells = Array.from(row.children)
          .filter((cell) => cell.tagName.toLowerCase() === 'td')
          .map((cell) => cell.textContent?.trim() || '');

        return inferDeviceFromHtmlRow(cells, row.textContent?.trim() || '');
      }).filter((device): device is DiscoveredDevice => Boolean(device));

      if (!parsed.length) throw new Error('Nenhum dispositivo foi encontrado no arquivo HTML.');
      setDevices(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
    }
  };

  const importDevices = async () => {
    const selected = devices.filter((device) => device.online && (mode !== 'printer' || device.type === 'PRINTER'));
    if (!selected.length) {
      setError(mode === 'printer' ? 'Nenhuma impressora encontrada para incluir.' : 'Nenhum dispositivo online para importar.');
      return;
    }

    setImporting(true);
    setError('');
    setProgress({ label: mode === 'printer' ? 'Incluindo impressoras' : 'Importando ativos online', done: 0, total: selected.length });

    try {
      const result = await assetService.importDevices(selected, companyId || null, undefined, mode === 'printer' ? 'PRINTER' : 'NETWORK', null);
      setProgress((current) => ({ ...current, done: current.total }));
      if (result.duplicates.length) {
        const duplicateIps = new Set(result.duplicates.map((item) => item.ipAddress));
        setDuplicateDevices(selected.filter((device) => duplicateIps.has(device.ipAddress)));
        setPartialImport({ created: result.created, updated: result.updated, failed: result.failed });
        setError(`IP duplicado detectado: ${result.duplicates.map((item) => `${item.ipAddress} (${item.assetName})`).join(', ')}. Informe a senha de administrador para verificar possíveis alterações físicas. Os nomes atuais serão preservados.`);
        return;
      }
      onImported({ total: result.imported, created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed, mode: mode === 'printer' ? 'printer' : 'network' });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setImporting(false);
    }
  };

  const authorizeDuplicates = async () => {
    if (!adminPassword) {
      setError('Informe a senha de administrador para continuar com os IPs duplicados.');
      return;
    }

    setImporting(true);
    setError('');
    try {
      const result = await assetService.importDevices(duplicateDevices, companyId || null, adminPassword, mode === 'printer' ? 'PRINTER' : 'NETWORK', null);
      if (result.duplicates.length) {
        setError('A senha não autorizou a operação. Verifique a senha de administrador.');
        return;
      }
      onImported({
        total: partialImport.created + partialImport.updated + result.imported,
        created: partialImport.created + result.created,
        updated: partialImport.updated + result.updated,
        skipped: result.skipped,
        failed: partialImport.failed + result.failed,
        mode: mode === 'printer' ? 'printer' : 'network',
      });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setImporting(false);
      setAdminPassword('');
    }
  };

  const collectDetailed = async () => {
    setError('');
    setWindowsFailures([]);
    setWindowsCollected(0);
    setSkippedKnownIps(0);
    if (!validRange(128)) {
      setError('A coleta Windows aceita de 1 a 128 endereços por vez.');
      return;
    }
    if (password && !username) {
      setError('Informe o usuário para usar senha na coleta Windows.');
      return;
    }

    const targetList = targets();
    setLoading(true);
    setProgress({ label: username ? 'Coletando inventário Windows completo' : 'Identificando computadores Windows sem credenciais', done: 0, total: targetList.length });

    try {
      const results: Array<{ ipAddress: string; success: boolean; ignored?: boolean; error?: string }> = [];
      let collected = 0;
      let failed = 0;
      let skippedKnown = 0;

      // A API só devolve o resultado depois de concluir todos os alvos recebidos.
      // Enviando um IP por chamada, com concorrência moderada, o progresso avança
      // a cada máquina analisada em vez de ficar parado até terminar um bloco inteiro.
      for (const group of splitIntoChunks(targetList, 4)) {
        await Promise.all(group.map(async (ipAddress) => {
          try {
            const result = await assetService.detailedInventory({ targets: [ipAddress], username, password, companyId: companyId || null, networkSegmentId: null, skipKnownIps });
            results.push(...result.results);
            collected += result.collected;
            failed += result.failed;
            skippedKnown += result.skippedKnown || 0;
            setSkippedKnownIps(skippedKnown);
          } catch (requestError) {
            failed += 1;
            results.push({ ipAddress, success: false, error: handleApiError(requestError) });
          } finally {
            setProgress((current) => {
              const done = Math.min(current.done + 1, current.total);
              return {
                ...current,
                done,
                label: done === current.total
                  ? 'Inventário Windows concluído'
                  : `Analisado ${ipAddress} · buscando ${done + 1} de ${current.total}`,
              };
            });
          }
        }));
      }

      const unresolved = results.filter((item) => !item.success);
      setWindowsFailures(unresolved);
      setWindowsCollected(collected);
      if (!collected && skippedKnown > 0 && !unresolved.length) return;
      if (unresolved.some((item) => !item.ignored)) {
        setError(`${collected} computador${collected === 1 ? '' : 'es'} coletado${collected === 1 ? '' : 's'}. ${unresolved.filter((item) => !item.ignored).length} IP(s) não puderam ser identificados; você pode tentar novamente ou marcá-los como ignorados.`);
        return;
      }

      onImported({ total: collected, created: 0, updated: collected, failed, mode: 'detailed' });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
      setPassword('');
    }
  };

  const collectCctv = async () => {
    setError('');
    if (!validRange(256)) {
      setError('A coleta CCTV aceita de 1 a 256 endereços por vez.');
      return;
    }
    if (!username || !password) {
      setError('Informe usuário e senha dos dispositivos.');
      return;
    }

    const targetList = targets();
    setLoading(true);
    setSkippedKnownIps(0);
    setProgress({ label: 'Preparando a coleta de câmeras/DVRs', done: 0, total: targetList.length });

    try {
      const results: Array<{ ipAddress: string; success: boolean; error?: string }> = [];
      let collected = 0;
      let failed = 0;
      let skippedKnown = 0;

      for (let index = 0; index < targetList.length; index += 1) {
        const chunk = [targetList[index]];
        setProgress({
          label: `Analisando ${chunk[0]} (${index + 1} de ${targetList.length})`,
          done: index,
          total: targetList.length,
        });
        const result = await assetService.cctvInventory({ targets: chunk, username, password, deviceType: cctvType, companyId: companyId || null, networkSegmentId: null, skipKnownIps });
        results.push(...result.results);
        collected += result.collected;
        failed += result.failed;
        skippedKnown += result.skippedKnown || 0;
        setSkippedKnownIps(skippedKnown);
        setProgress({
          label: index + 1 === targetList.length ? 'Coleta de câmeras/DVRs concluída' : `Concluído ${chunk[0]}`,
          done: index + 1,
          total: targetList.length,
        });
      }

      if (!collected && skippedKnown > 0 && !results.length) return;
      if (!collected) {
        setError(results.slice(0, 12).map((item) => `${item.ipAddress}: ${item.error || 'falha na coleta'}`).join(' | '));
        return;
      }

      onImported({ total: collected, created: 0, updated: collected, failed, mode: 'cctv' });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
      setPassword('');
    }
  };

  const collectRemote = async () => {
    setError('');
    setDevices([]);
    setRemoteAgentInfo(null);
    if (!validRange(256)) {
      setError('A busca remota aceita de 1 a 256 endereços por vez.');
      return;
    }
    if (!remoteSiteName.trim()) {
      setError('Informe o mesmo nome configurado no agente remoto.');
      return;
    }
    setLoading(true);
    setProgress({ label: 'Aguardando o agente remoto', done: 0, total: 1 });
    try {
      const created = await assetService.createRemoteDiscoveryJob({ siteName: remoteSiteName.trim(), prefix, firstIp, lastIp });
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const job = await assetService.getRemoteDiscoveryJob(created.id);
        if (job.status === 'FAILED') throw new Error(job.error || 'O agente remoto não concluiu a tarefa.');
        if (job.status === 'COMPLETED') {
          const found = job.results || [];
          setRemoteAgentInfo(job.agentInfo || null);
          setDevices(found.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })));
          setProgress({ label: `Busca concluída por ${job.agentName || remoteSiteName}`, done: 1, total: 1 });
          if (!found.length) setError('O agente respondeu, mas nenhuma porta conhecida foi encontrada nessa faixa.');
          return;
        }
        setProgress({ label: job.status === 'RUNNING' ? `Agente ${job.agentName || remoteSiteName} verificando a rede` : `Aguardando o agente ${remoteSiteName}`, done: 0, total: 1 });
      }
      throw new Error('O agente remoto não respondeu em até 10 minutos. Confirme se ele está em execução e se o nome configurado é exatamente igual.');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const action = mode === 'detailed' ? collectDetailed : mode === 'cctv' ? collectCctv : mode === 'remote' ? collectRemote : scan;

  const startDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select, textarea, label')) return;

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialX: dialogPosition.x,
      initialY: dialogPosition.y,
    };

    const move = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      setDialogPosition({
        x: dragRef.current.initialX + moveEvent.clientX - dragRef.current.startX,
        y: dragRef.current.initialY + moveEvent.clientY - dragRef.current.startY,
      });
    };

    const stop = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true">
      <div className="absolute inset-0" aria-hidden="true" />
      <div className="premium-discovery relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.75rem] border border-white/20 bg-white shadow-2xl shadow-slate-950/35" style={{ transform: `translate(${dialogPosition.x}px, ${dialogPosition.y}px)` }}>
        <div onMouseDown={startDrag} className="premium-hero relative flex cursor-move select-none items-center justify-between overflow-hidden px-6 py-5 text-white sm:px-7 sm:py-6">
          <div className="premium-hero-glow absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-20 blur-3xl" />
          <div className="flex items-center gap-3">
            <span className="relative rounded-2xl border border-white/10 bg-white/10 p-3 text-white shadow-lg backdrop-blur"><Radar size={24} /></span>
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Inventário automático</p>
              <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">Descobrir ativos na rede</h2>
              <p className="mt-0.5 hidden text-xs text-slate-300 sm:block">Varredura assistida, inventário Windows e agentes remotos.</p>
            </div>
          </div>
          <button onClick={onClose} className="relative rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/70 transition hover:bg-white/15 hover:text-white"><X size={20} /></button>
        </div>

        <div className="border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm sm:px-6">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setPreset('scan')} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${mode === 'scan' ? 'premium-primary-action border-transparent text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'}`}><Network size={17} /> Escanear IPs</button>
            <button onClick={() => setPreset('detailed')} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${mode === 'detailed' ? 'premium-primary-action border-transparent text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'}`}><Server size={17} /> Inventário Windows</button>
            <button onClick={() => setPreset('cctv')} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${mode === 'cctv' ? 'premium-primary-action border-transparent text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'}`}><Camera size={17} /> Câmeras / DVRs</button>
            <button onClick={() => setPreset('remote')} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${mode === 'remote' ? 'premium-primary-action border-transparent text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'}`}><Wifi size={17} /> Agente remoto</button>
          </div>
        </div>

        <div className="overflow-y-auto bg-slate-50/80 p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div>
              {mode === 'file' ? (
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
                  <FileUp size={28} className="text-blue-600" />
                  <span className="mt-3 font-semibold text-slate-800">Selecione o HTML do Advanced IP Scanner</span>
                  <span className="mt-1 text-sm text-slate-500">{fileName || 'O arquivo será analisado somente para extrair a tabela de dispositivos.'}</span>
                  <input type="file" accept=".html,.htm,text/html" onChange={readFile} className="sr-only" />
                </label>
              ) : (
                <div className="rounded-2xl border border-white bg-white p-5 shadow-lg shadow-slate-900/5">
                  <p className="mb-4 text-sm text-slate-600">
                    {mode === 'remote'
                      ? 'A tarefa será enviada ao agente instalado na empresa remota. O nome informado deve ser exatamente igual ao agentName configurado nele.'
                      : mode === 'detailed'
                       ? 'Use em computadores Windows. Sem usuário a busca identifica IP, nome, MAC e portas; com usuário tenta o inventário completo. A senha pode ficar vazia quando a conta local não tiver senha. Até 128 IPs por vez.'
                      : mode === 'cctv'
                        ? 'Use na rede de câmeras/DVRs. Rode uma vez para DVR e outra para câmeras, com as credenciais corretas. Câmera em PoE interno do DVR só será encontrada se o servidor tiver rota para essa rede.'
                        : mode === 'printer'
                          ? 'Busca somente impressoras e coleta fabricante, modelo, número de série e firmware por SNMP/HTTP, sem usuário ou senha. Ative a busca profunda se a impressora demorar ou responder em porta incomum.'
                          : 'A busca usa ping, portas abertas, MAC, SNMP e HTTP sem usuário e senha. Ative a busca profunda para equipamentos sem agente, como impressoras, telefones IP, catracas, antenas, roteadores e repetidores.'}
                  </p>
                  {mode === 'remote' && <label className="mb-4 block text-sm font-medium text-slate-700">Nome do agente/local<input list="remote-agent-names" value={remoteSiteName} onChange={(event) => setRemoteSiteName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" placeholder="Selecione um agente registrado" /><datalist id="remote-agent-names">{[...new Set(registeredAgents.map((agent) => agent.agentName))].map((name) => <option key={name} value={name} />)}</datalist><span className="mt-1 block text-xs font-normal text-violet-700">{registeredAgents.length ? `Nome configurado disponível: ${[...new Set(registeredAgents.map((agent) => agent.agentName))].join(', ')}` : 'Primeiro execute o agente na máquina desejada para que o nome apareça aqui.'}</span></label>}
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px_100px_auto]">
                    <label className="text-sm font-medium text-slate-700">Prefixo da rede<input value={prefix} onChange={(event) => setPrefix(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                    <label className="text-sm font-medium text-slate-700">Inicial<input type="number" min="1" max="255" value={firstIp} onChange={(event) => setFirstIp(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                    <label className="text-sm font-medium text-slate-700">Final<input type="number" min="1" max="255" value={lastIp} onChange={(event) => setLastIp(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                    <button onClick={action} disabled={loading} className="premium-primary-action mt-auto inline-flex h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-60">
                      {loading ? <Loader2 className="animate-spin" size={17} /> : mode === 'printer' ? <Printer size={17} /> : mode === 'remote' ? <Wifi size={17} /> : <Radar size={17} />} {mode === 'scan' ? 'Buscar' : mode === 'printer' ? 'Buscar impressoras' : mode === 'remote' ? 'Enviar busca' : 'Coletar'}
                    </button>
                  </div>
                  {mode !== 'remote' && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-sm text-blue-950">
                    <input type="checkbox" checked={!skipKnownIps} onChange={(event) => { setSkipKnownIps(!event.target.checked); setSkippedKnownIps(0); }} className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                    <span><span className="block font-semibold">Buscar também IPs já conhecidos</span><span className="mt-0.5 block text-xs leading-5 text-blue-700">{mode === 'detailed' ? 'Marcado no inventário Windows para atualizar computadores já cadastrados, incluindo usuário detectado e dados do sistema.' : 'Desmarcado por padrão: pula endereços vinculados a ativos ou registrados na lista de IPs. Marque somente quando quiser verificar novamente toda a faixa.'}</span></span>
                  </label>}
                  {(mode === 'scan' || mode === 'printer') && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-sm text-amber-950">
                    <input type="checkbox" checked={deepScan} onChange={(event) => setDeepScan(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                    <span><span className="block font-semibold">Busca profunda sem agente</span><span className="mt-0.5 block text-xs leading-5 text-amber-800">Testa mais de 1.100 portas TCP, incluindo 1–1024. Consulta SNMP, HTTP/HTTPS, certificados, banners, Modbus, MAC e NetBIOS para buscar fabricante, produto e versões. Pode levar cerca de um minuto por grupo de 4 IPs.</span></span>
                  </label>}
                  {(mode === 'detailed' || mode === 'cctv') && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {mode === 'cctv' && (
                        <label className="text-sm font-medium text-slate-700">Tipo<select value={cctvType} onChange={(event) => setCctvType(event.target.value as 'DVR_NVR' | 'CAMERA')} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="DVR_NVR">DVR / NVR Intelbras</option><option value="CAMERA">Câmera / ONVIF</option></select></label>
                      )}
                      <label className="text-sm font-medium text-slate-700">Usuário{mode === 'detailed' && <span className="font-normal text-slate-400"> (opcional)</span>}<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder={mode === 'detailed' ? 'EMPRESA\\inventario ou .\\administrador' : 'admin'} /></label>
                      <label className="text-sm font-medium text-slate-700">Senha{mode === 'detailed' && <span className="font-normal text-slate-400"> (pode ficar vazia)</span>}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="h-fit space-y-4 rounded-2xl border border-white bg-white p-5 text-sm font-bold text-slate-800 shadow-lg shadow-slate-900/5">
            <label className="block">
              Empresa dos ativos
              <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-medium">
                <option value="">Sem empresa definida</option>
                {companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
              <span className="mt-3 block text-xs font-normal leading-5 text-slate-500">Você também poderá ajustar a empresa individualmente depois.</span>
            </label>
            </div>
          </div>

          {progress.total > 0 && (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-lg shadow-blue-900/5">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-blue-900">
                  {(loading || importing) && <Loader2 className="animate-spin" size={16} />}
                  {progress.label}
                </span>
                <span className="rounded-full bg-blue-50 px-3 py-1 font-mono font-bold text-blue-700">{progress.done}/{progress.total} · {progressPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-blue-100">
                <div
                  className={`premium-primary-action h-full rounded-full transition-all duration-300 ${loading && progressPercent === 0 ? 'animate-pulse' : ''}`}
                  style={{ width: loading && progressPercent === 0 ? '6%' : `${progressPercent}%` }}
                />
              </div>
              {(loading || importing) && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-700">
                  <p>
                    {mode === 'cctv'
                      ? 'Aguarde: o sistema está testando a comunicação e as credenciais. Alguns dispositivos podem demorar para responder.'
                      : mode === 'detailed'
                        ? 'Cada computador concluído atualiza o progresso. Máquinas desligadas ou sem acesso podem levar mais tempo.'
                        : 'Processando em blocos. Pode deixar essa janela aberta até finalizar.'}
                  </p>
                  <span className="shrink-0 font-mono font-semibold">
                    Tempo decorrido: {Math.floor(progressElapsedSeconds / 60)}m {String(progressElapsedSeconds % 60).padStart(2, '0')}s
                  </span>
                </div>
              )}
            </div>
          )}

          {skippedKnownIps > 0 && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              <span className="font-semibold">{skippedKnownIps} IP{skippedKnownIps === 1 ? '' : 's'} já conhecido{skippedKnownIps === 1 ? '' : 's'} ignorado{skippedKnownIps === 1 ? '' : 's'}.</span> Esses endereços não foram consultados nesta busca.
            </div>
          )}

          {mode === 'remote' && remoteAgentInfo && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-4">
              <h3 className="font-semibold text-violet-950">Máquina do agente: {remoteAgentInfo.computerName || remoteSiteName}</h3>
              <div className="mt-3 grid gap-3 text-sm text-violet-900 sm:grid-cols-2 lg:grid-cols-3">
                <p><span className="block text-xs font-semibold uppercase text-violet-600">Equipamento</span>{[remoteAgentInfo.manufacturer, remoteAgentInfo.model].filter(Boolean).join(' ') || 'Não identificado'}</p>
                <p><span className="block text-xs font-semibold uppercase text-violet-600">Número de série</span>{remoteAgentInfo.serialNumber || 'Não identificado'}</p>
                <p><span className="block text-xs font-semibold uppercase text-violet-600">Sistema</span>{[remoteAgentInfo.operatingSystem, remoteAgentInfo.architecture].filter(Boolean).join(' · ') || 'Não identificado'}</p>
                <p><span className="block text-xs font-semibold uppercase text-violet-600">Processador</span>{remoteAgentInfo.processor || 'Não identificado'}</p>
                <p><span className="block text-xs font-semibold uppercase text-violet-600">Memória</span>{remoteAgentInfo.memoryMb ? `${Math.round(remoteAgentInfo.memoryMb / 1024)} GB` : 'Não identificada'}</p>
                <p><span className="block text-xs font-semibold uppercase text-violet-600">Usuário / domínio</span>{[remoteAgentInfo.loggedUser, remoteAgentInfo.domain].filter(Boolean).join(' · ') || 'Não identificado'}</p>
              </div>
              {remoteAgentInfo.networkAdapters?.length ? <p className="mt-3 text-xs text-violet-700">Rede: {remoteAgentInfo.networkAdapters.flatMap((adapter) => adapter.ipAddresses || []).join(', ') || 'sem IPv4'} · Agente v{remoteAgentInfo.agentVersion || '1.0.0'}</p> : null}
              {remoteAgentInfo.installedApplications?.length ? <p className="mt-2 text-xs text-violet-700" title={remoteAgentInfo.installedApplications.map((app) => `${app.name}${app.version ? ` ${app.version}` : ''}`).join('\n')}>Aplicativos ({remoteAgentInfo.installedApplicationCount ?? remoteAgentInfo.installedApplications.length}): {remoteAgentInfo.installedApplications.slice(0, 8).map((app) => app.name).join(', ')}{remoteAgentInfo.installedApplications.length > 8 ? '…' : ''}</p> : null}
              {remoteAgentInfo.installedApplications?.length ? <details className="mt-2 text-xs text-violet-800"><summary className="cursor-pointer font-semibold">Ver lista completa de aplicativos</summary><div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-violet-200 bg-white/70 p-3">{remoteAgentInfo.installedApplications.map((app, index) => <p key={`${app.name}-${app.version || ''}-${index}`}><span className="font-medium">{app.name}</span>{app.version ? ` · ${app.version}` : ''}{app.publisher ? ` · ${app.publisher}` : ''}</p>)}</div></details> : null}
            </div>
          )}

          {mode === 'remote' && registeredAgents.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-white">
              <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3">
                <h3 className="font-semibold text-emerald-950">Máquinas com agente instalado</h3>
                <p className="text-xs text-emerald-700">Inventário local coletado sem usuário ou senha de administrador.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {registeredAgents.map((agent) => {
                  const online = Date.now() - new Date(agent.lastSeenAt).getTime() < 5 * 60 * 1000;
                  const adapter = preferredAgentAdapter(agent);
                  const preferredIp = adapter?.ipAddresses?.[0];
                  return <div key={agent.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{agent.computerName} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{online ? 'Agente ativo' : 'Sem comunicação'}</span></p>
                      <p className="text-xs text-slate-500">{[agent.agentInfo.deviceType === 'NOTEBOOK' ? 'Notebook' : agent.agentInfo.deviceType === 'SERVER' ? 'Servidor' : 'Desktop', agent.agentInfo.manufacturer, agent.agentInfo.model, agent.agentInfo.operatingSystem].filter(Boolean).join(' · ')}</p>
                      <p className="mt-1 text-xs text-slate-500">Usuário: {agent.agentInfo.loggedUser || 'não identificado'}</p>
                      <p className="mt-1 text-xs text-slate-500">Windows: {agent.agentInfo.windowsLicenseStatus === 1 ? 'licenciado' : agent.agentInfo.windowsLicenseStatus == null ? 'ativação não identificada' : `status ${agent.agentInfo.windowsLicenseStatus}`}{agent.agentInfo.windowsProductKeyPartial ? ` · chave final ${agent.agentInfo.windowsProductKeyPartial}` : ''}</p>
                      <p className="mt-1 text-xs font-medium text-slate-600">IP selecionado: {preferredIp || 'não informado'}{adapter?.name ? ` · ${adapter.name}` : ''} · Agente v{agent.agentInfo.agentVersion || 'antigo'} · {agent.agentInfo.elevated ? 'elevado' : 'usuário comum'}</p>
                      {agent.agentInfo.collectionWarnings?.length ? <p className="mt-1 text-xs text-amber-700" title={agent.agentInfo.collectionWarnings.join('\n')}>Coleta parcial: {agent.agentInfo.collectionWarnings.length} consulta(s) sem acesso</p> : null}
                      {agent.agentInfo.installedApplications?.length ? <p className="mt-1 text-xs text-slate-500" title={agent.agentInfo.installedApplications.map((app) => `${app.name}${app.version ? ` ${app.version}` : ''}`).join('\n')}>Aplicativos ({agent.agentInfo.installedApplicationCount ?? agent.agentInfo.installedApplications.length}): {agent.agentInfo.installedApplications.slice(0, 6).map((app) => app.name).join(', ')}{agent.agentInfo.installedApplications.length > 6 ? '…' : ''}</p> : null}
                      {agent.agentInfo.installedApplications?.length ? <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-emerald-700">Ver todos os aplicativos</summary><div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">{agent.agentInfo.installedApplications.map((app, index) => <p key={`${app.name}-${app.version || ''}-${index}`}><span className="font-medium">{app.name}</span>{app.version ? ` · ${app.version}` : ''}{app.publisher ? ` · ${app.publisher}` : ''}</p>)}</div></details> : null}
                      <p className="mt-1 text-xs text-slate-400">Último envio: {new Date(agent.lastSeenAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <button type="button" onClick={() => addRegisteredAgent(agent)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Adicionar aos encontrados</button>
                  </div>;
                })}
              </div>
            </div>
          )}

          {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {duplicateDevices.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 shrink-0 text-amber-700" size={20} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber-950">Cadastro protegido: IP já existente</p>
                  <p className="mt-1 text-sm text-amber-800">A busca não alterou esses ativos. Somente uma senha de administrador permite comparar e atualizar alterações físicas; nomes e identificações manuais continuam preservados.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label className="relative flex-1">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-3 text-amber-700" size={17} />
                      <input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void authorizeDuplicates(); }} className="w-full rounded-lg border border-amber-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Senha de administrador" />
                    </label>
                    <button onClick={authorizeDuplicates} disabled={importing} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                      {importing && <Loader2 className="animate-spin" size={16} />} Autorizar verificação
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'printer' && unidentifiedDevices.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
              <div className="border-b border-amber-200 px-4 py-3">
                <h3 className="font-semibold text-amber-950">IPs não identificados como impressora</h3>
                <p className="mt-1 text-xs text-amber-800">Eles não serão incluídos. Se o IP não for de impressora, marque-o como ignorado para não verificá-lo novamente nesta busca.</p>
              </div>
              <div className="max-h-52 overflow-auto divide-y divide-amber-100">
                {unidentifiedDevices.map((device) => (
                  <div key={device.ipAddress} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div><p className="font-mono font-semibold text-slate-800">{device.ipAddress}</p><p className="text-xs text-slate-500">{device.hostname || 'Sem identificação'}{device.openPorts.length ? ` · Portas ${device.openPorts.join(', ')}` : ''}</p></div>
                    <button onClick={() => ignoreIp(device.ipAddress, 'Não identificado como impressora')} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"><Ban size={15} /> Ignorar IP</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'detailed' && windowsFailures.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
              <div className="flex items-center justify-between gap-4 border-b border-amber-200 px-4 py-3">
                <div><h3 className="font-semibold text-amber-950">Computadores não coletados</h3><p className="mt-1 text-xs text-amber-800">Os IPs ignorados serão pulados nas próximas buscas de computadores.</p></div>
                {windowsFailures.every((item) => item.ignored) && <button onClick={() => onImported({ total: windowsCollected, created: 0, updated: windowsCollected, failed: 0, mode: 'detailed' })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Concluir</button>}
              </div>
              <div className="max-h-56 overflow-auto divide-y divide-amber-100">
                {windowsFailures.map((item) => (
                  <div key={item.ipAddress} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div><p className="font-mono font-semibold text-slate-800">{item.ipAddress}</p><p className="max-w-2xl text-xs text-slate-500">{item.error || 'Não foi possível coletar'}</p></div>
                    {item.ignored
                      ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"><Ban size={14} /> Ignorado</span>
                      : <button onClick={() => ignoreIp(item.ipAddress, 'Computador não identificado ou inacessível')} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"><Ban size={15} /> Ignorar IP</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ignoredIps.length > 0 && mode !== 'cctv' && mode !== 'file' && (
            <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">IPs ignorados nesta busca ({ignoredIps.length})</summary>
              <div className="max-h-48 overflow-auto border-t border-slate-200 divide-y divide-slate-200">
                {ignoredIps.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div><p className="font-mono font-semibold text-slate-700">{item.ipAddress}</p><p className="text-xs text-slate-500">{item.reason || 'Ignorado manualmente'}</p></div>
                    <button onClick={() => unignoreIp(item)} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"><RotateCcw size={14} /> Verificar novamente</button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {devices.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white bg-white shadow-xl shadow-slate-900/5">
              <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
                <h3 className="font-semibold text-slate-800">{mode === 'printer' ? 'Impressoras encontradas' : 'Dispositivos encontrados'}</h3>
                <span className="text-sm text-slate-500">{devices.filter((device) => device.online).length} online de {devices.length}</span>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                    <tr>{['Status', 'Nome', 'IP', 'Tipo sugerido', 'Portas', 'Identificação', 'MAC'].map((title) => <th key={title} className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">{title}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {devices.map((device) => (
                      <tr key={`${device.ipAddress}-${device.macAddress || ''}`} className={`transition-colors hover:bg-blue-50/40 ${!device.online ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${device.online ? 'text-emerald-700' : 'text-slate-500'}`}>{device.online ? <Wifi size={15} /> : <WifiOff size={15} />}{device.online ? 'Online' : 'Offline'}</span></td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{device.hostname || <span className="text-slate-400">Não identificado</span>}</td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-600">{device.ipAddress}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{typeLabels[device.type] || typeLabels.OTHER}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{device.openPorts?.length ? device.openPorts.join(', ') : 'Nenhuma detectada'}{device.identificationNote && <p className="mt-1 max-w-xs text-xs text-slate-500">{device.identificationNote}</p>}</td>
                        <td className="px-4 py-3 text-sm text-slate-600"><p>{device.manufacturer || '—'}{device.manufacturerSource === 'mac' && <span className="ml-1 text-xs text-slate-400">(pelo MAC)</span>}</p>{device.model && <p className="text-xs text-slate-500">Modelo: {device.model}</p>}{device.serialNumber && <p className="text-xs text-slate-500">Série: {device.serialNumber}</p>}{device.firmware && <p className="text-xs text-slate-500">Firmware: {device.firmware}</p>}{Boolean(device.serviceEvidence?.length) && <details className="mt-2 min-w-56 max-w-sm"><summary className="cursor-pointer text-xs font-semibold text-blue-600">Serviços e versões ({device.serviceEvidence!.length})</summary><div className="mt-2 space-y-2">{device.serviceEvidence!.map((item, index) => <div key={`${item.transport}-${item.port}-${index}`} className="rounded-lg bg-slate-50 p-2 text-xs"><p className="font-semibold">{item.port}/{item.transport} · {item.service} · {item.confirmed ? 'Respondeu ao protocolo' : 'Indício pela porta'}</p><p className="mt-1 break-words">{item.details}</p></div>)}</div></details>}{device.scannedPortCount && <p className="mt-1 text-xs text-slate-400">{device.scannedPortCount} portas TCP consultadas</p>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{device.macAddress || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!devices.length && !unidentifiedDevices.length && !windowsFailures.length && !ignoredIps.length && !loading && (
            <div className="mt-7 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-9 text-center text-sm text-slate-500">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Server size={27} /></span><p className="font-semibold text-slate-700">Pronto para descobrir</p><p className="mt-1">Os dispositivos aparecerão aqui antes da importação.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-5 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <p className="text-xs text-slate-500">{mode === 'detailed' ? 'As credenciais são opcionais e, quando informadas, são usadas apenas na memória durante esta coleta.' : mode === 'cctv' ? 'Credenciais usadas apenas na memória durante esta coleta.' : mode === 'printer' ? 'A busca de impressoras não usa senhas e não altera usuários ou inventários de computadores.' : 'A descoberta simples consulta SNMP/HTTP sem senha para identificar impressoras, relógios de ponto, catracas e equipamentos de rede.'}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancelar</button>
            {mode !== 'detailed' && mode !== 'cctv' && (
              <button onClick={importDevices} disabled={!devices.some((device) => device.online) || importing} className="premium-primary-action inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50">
                {importing && <Loader2 className="animate-spin" size={16} />} {mode === 'printer' ? 'Incluir impressoras' : 'Importar ativos online'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
