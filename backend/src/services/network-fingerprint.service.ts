import net from 'net';
import http from 'http';
import https from 'https';
import tls from 'tls';

export interface ServiceEvidence {
  port: number;
  transport: 'TCP' | 'UDP';
  service: string;
  confirmed: boolean;
  details: string;
}

const clean = (value: unknown) => String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
export const HTTP_PORTS = [80, 81, 82, 85, 88, 591, 631, 3000, 3001, 4000, 5000, 5002, 5985, 7000, 8000, 8001, 8006, 8008, 8080, 8081, 8082, 8083, 8088, 8089, 8090, 8181, 8888, 8899, 8999, 9000, 9001, 10000];
export const HTTPS_PORTS = [443, 444, 465, 636, 853, 989, 990, 992, 993, 995, 2376, 5001, 5986, 7001, 7443, 8443, 9443];
const HTTP_TLS_PORTS = [443, 444, 5001, 5986, 7001, 7443, 8443, 9443];
export const DEEP_PORTS = [...new Set([
  ...Array.from({ length: 1024 }, (_, i) => i + 1),
  ...HTTP_PORTS, ...HTTPS_PORTS,
  1025, 1080, 1433, 1521, 1720, 1723, 1883, 1935, 2049, 2082, 2083, 2181, 2222,
  2375, 2404, 2480, 3050, 3260, 3306, 3389, 3570, 4001, 4369, 4786, 4840,
  5038, 5060, 5061, 5080, 5160, 5432, 5555, 5672, 5900, 5901, 5902, 6000,
  6379, 6667, 7547, 7680, 8009, 8291, 8554, 8728, 8729, 9002, 9090, 9100, 9101,
  9200, 9600, 9999, 10001, 11211, 20000, 27017, 32400, 34567, 37777, 37778, 44818, 47808, 49152,
])].sort((a, b) => a - b);

export async function mapLimited<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

// Absolute deadline and byte cap also apply to peers that drip data indefinitely.
export function readTcp(host: string, port: number, request?: Buffer, complete: (data: Buffer) => boolean = (data) => data.includes(10), timeout = 2200): Promise<Buffer> {
  return new Promise((resolve) => {
    let data = Buffer.alloc(0);
    const socket = new net.Socket();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(data);
    };
    const timer = setTimeout(finish, timeout);
    socket.on('error', finish).on('end', finish).on('close', finish);
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk.subarray(0, Math.max(0, 8192 - data.length))]);
      if (data.length >= 8192 || complete(data)) finish();
    });
    socket.connect(port, host, () => { if (request) socket.write(request); });
  });
}

export function parseModbusIdentity(data: Buffer, unit: number) {
  if (data.length < 9 || data.readUInt16BE(0) !== 1 || data.readUInt16BE(2) !== 0 || data[6] !== unit) return null;
  const length = data.readUInt16BE(4);
  if (length < 3 || length > 254 || data.length < length + 6) return null;
  if (data[7] === 0xab && length === 3 && [1, 2, 3, 4, 6, 10, 11].includes(data[8])) {
    return { manufacturer: null, model: null, firmware: null, details: `Modbus respondeu com exceção ${data[8]}; identificação indisponível (unidade ${unit}).` };
  }
  if (length < 8 || data[7] !== 0x2b || data[8] !== 0x0e || data[9] !== 1) return null;
  const values = new Map<number, string>();
  let offset = 14;
  for (let i = 0; i < data[13]; i++) {
    if (offset + 2 > length + 6) return null;
    const id = data[offset++];
    const size = data[offset++];
    if (offset + size > length + 6) return null;
    values.set(id, clean(data.subarray(offset, offset + size).toString('utf8')));
    offset += size;
  }
  return {
    manufacturer: values.get(0) || null,
    model: values.get(1) || null,
    firmware: values.get(2) || null,
    details: clean([...values.entries()].map(([id, value]) => `${({ 0: 'Fabricante', 1: 'Produto', 2: 'Revisão' } as Record<number, string>)[id] || `Objeto ${id}`}: ${value}`).join(' · ')) || `Modbus confirmado; identificação vazia (unidade ${unit}).`,
  };
}

async function modbusIdentity(host: string) {
  for (const unit of [1, 255]) {
    // Read Device Identification only; never read/write process registers.
    const request = Buffer.from([0, 1, 0, 0, 0, 5, unit, 0x2b, 0x0e, 1, 0]);
    const data = await readTcp(host, 502, request, (value) => value.length >= 7 && value.length >= value.readUInt16BE(4) + 6);
    const result = parseModbusIdentity(data, unit);
    if (result) return result;
  }
  return null;
}

export function inspectHttp(host: string, port: number, secure: boolean): Promise<(ServiceEvidence & { hardwareText: string; title: string }) | null> {
  return new Promise((resolve) => {
    let settled = false;
    let body = '';
    let bytes = 0;
    let response: http.IncomingMessage | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const title = clean(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' '));
      const headers = response?.headers;
      const cert = secure && response ? (response.socket as tls.TLSSocket).getPeerCertificate?.() : null;
      const location = typeof headers?.location === 'string' ? clean(headers.location.split('?')[0]) : '';
      resolve(response ? {
        port, transport: 'TCP', service: secure ? 'HTTPS' : 'HTTP', confirmed: true,
        title,
        hardwareText: body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(0, 8000),
        details: clean([`HTTP ${response.statusCode}`, title, headers?.server && `Servidor: ${headers.server}`, headers?.['x-powered-by'], headers?.['www-authenticate'] && `Autenticação: ${String(headers['www-authenticate']).split(/nonce=/i)[0]}`, location && `Redireciona: ${location}`, cert?.subject?.CN && `Certificado: ${cert.subject.CN}`, cert?.subject?.O].filter(Boolean).join(' · ')),
      } : null);
      request.destroy();
    };
    // Per-request TLS exception for identification of local self-signed devices.
    // No credentials, no redirects and no external destinations are requested.
    const request = (secure ? https : http).request({ hostname: host, port, path: '/', method: 'GET', agent: false, rejectUnauthorized: false, headers: { Connection: 'close', 'User-Agent': 'ControlAll-NetworkDiscovery' } }, (incoming) => {
      response = incoming;
      incoming.on('data', (chunk: Buffer) => {
        const remaining = 32768 - bytes;
        body += chunk.subarray(0, Math.max(0, remaining)).toString('utf8');
        bytes += chunk.length;
        if (bytes >= 32768) finish();
      });
      incoming.on('end', finish).on('error', finish).on('aborted', finish);
    });
    const timer = setTimeout(finish, 3000);
    request.on('error', finish);
    request.end();
  });
}

export async function fingerprintServices(host: string, ports: number[]) {
  const evidence: ServiceEvidence[] = [];
  const httpIdentities: string[] = [];
  const httpTitles: string[] = [];
  let industrial: ReturnType<typeof parseModbusIdentity> = null;
  const jobs: Array<() => Promise<void>> = [];
  if (ports.includes(502)) jobs.push(async () => {
    industrial = await modbusIdentity(host);
    evidence.push({ port: 502, transport: 'TCP', service: 'Modbus TCP', confirmed: Boolean(industrial), details: industrial?.details || 'Porta compatível; sem resposta à leitura de identificação.' });
  });
  for (const port of ports) {
    if (HTTP_PORTS.includes(port) || HTTP_TLS_PORTS.includes(port)) jobs.push(async () => {
      const result = await inspectHttp(host, port, HTTP_TLS_PORTS.includes(port));
      if (result) {
        const { hardwareText, title, ...entry } = result;
        evidence.push(entry);
        httpIdentities.push(hardwareText);
        if (title) httpTitles.push(title);
      }
    });
    if ([21, 22, 23, 25, 110, 143, 587, 2222, 5900, 5901, 5902, 554, 8554].includes(port)) jobs.push(async () => {
      const rtsp = [554, 8554].includes(port);
      const data = await readTcp(host, port, rtsp ? Buffer.from(`OPTIONS rtsp://${host}:${port}/ RTSP/1.0\r\nCSeq: 1\r\n\r\n`) : undefined, (value) => rtsp ? value.includes('\r\n\r\n') : value.includes(10));
      const details = clean(data.toString('utf8'));
      if (!details) return;
      const service = /^SSH-/.test(details) ? 'SSH' : /^RFB \d/.test(details) ? 'VNC' : /^RTSP\/1\./.test(details) ? 'RTSP' : /^220.*(?:smtp|esmtp)/i.test(details) ? 'SMTP' : /^220.*ftp/i.test(details) ? 'FTP' : 'Banner TCP';
      evidence.push({ port, transport: 'TCP', service, confirmed: service !== 'Banner TCP', details });
    });
  }
  await mapLimited(jobs.slice(0, 32), 8, (job) => job());
  return { evidence: evidence.sort((a, b) => a.port - b.port), httpTitles, httpIdentity: httpIdentities.join(' | '), industrial: industrial as ReturnType<typeof parseModbusIdentity>, limited: jobs.length > 32 };
}
