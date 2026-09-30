import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import http from 'node:http';
import { DEEP_PORTS, inspectHttp, mapLimited, parseModbusIdentity, readTcp } from '../services/network-fingerprint.service';

test('busca profunda cobre portas baixas e serviços industriais', () => {
  for (let port = 1; port <= 1024; port++) assert.ok(DEEP_PORTS.includes(port));
  assert.ok(DEEP_PORTS.includes(44818));
  assert.equal(new Set(DEEP_PORTS).size, DEEP_PORTS.length);
});

test('concorrência limitada mantém todos os resultados', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapLimited([1, 2, 3, 4, 5], 2, async (value) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});

test('identificação Modbus extrai objetos e rejeita pacotes truncados ou alheios', () => {
  const objects = ['Example Controls', 'PLC-123', '1.2.3'].map((value, id) => Buffer.concat([Buffer.from([id, value.length]), Buffer.from(value)]));
  const pdu = Buffer.concat([Buffer.from([1, 0x2b, 0x0e, 1, 1, 0, 0, 3]), ...objects]);
  const header = Buffer.from([0, 1, 0, 0, 0, pdu.length]);
  const response = Buffer.concat([header, pdu]);
  const result = parseModbusIdentity(response, 1);
  assert.equal(result?.manufacturer, 'Example Controls');
  assert.equal(result?.model, 'PLC-123');
  assert.equal(result?.firmware, '1.2.3');
  assert.equal(parseModbusIdentity(response.subarray(0, response.length - 1), 1), null);
  assert.equal(parseModbusIdentity(response, 255), null);
  assert.equal(parseModbusIdentity(Buffer.from('HTTP/1.1 200 OK'), 1), null);
  assert.match(parseModbusIdentity(Buffer.from([0, 1, 0, 0, 0, 3, 1, 0xab, 1]), 1)?.details || '', /exceção/);
});

test('banner TCP reconstitui resposta fragmentada e fecha conexão', async () => {
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.write('SSH-2.0-');
    setTimeout(() => socket.end('Example_1.2\r\n'), 15);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await readTcp('127.0.0.1', (server.address() as net.AddressInfo).port);
    assert.equal(result.toString(), 'SSH-2.0-Example_1.2\r\n');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('HTTP preserva título e versão em 401 e não segue redirecionamentos', async () => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests++;
    response.writeHead(requests === 1 ? 401 : 302, { Server: 'DeviceWeb/2.5', 'WWW-Authenticate': 'Basic realm="Controller"', Location: 'http://127.0.0.1/private' });
    response.end('<title>Controller X</title><p>Firmware: 1.2.3</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as net.AddressInfo).port;
    const first = await inspectHttp('127.0.0.1', port, false);
    assert.match(first?.details || '', /HTTP 401.*Controller X.*DeviceWeb\/2.5/);
    assert.match(first?.hardwareText || '', /Firmware: 1.2.3/);
    const second = await inspectHttp('127.0.0.1', port, false);
    assert.match(second?.details || '', /HTTP 302/);
    assert.equal(requests, 2);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('timeout absoluto encerra banner silencioso', async () => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await readTcp('127.0.0.1', (server.address() as net.AddressInfo).port, undefined, undefined, 50);
    assert.equal(result.length, 0);
  } finally { sockets.forEach((socket) => socket.destroy()); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
