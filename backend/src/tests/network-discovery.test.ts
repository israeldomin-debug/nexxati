import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetType } from '@prisma/client';
import { classifyNetworkDevice, extractHttpHardwareFacts, hasPingReply, NetworkDiscoveryService } from '../services/network-discovery.service';

test('ping exige resposta com TTL e rejeita destino inacessível', () => {
  assert.equal(hasPingReply('Reply from 192.168.1.100: bytes=32 time=7ms TTL=64'), true);
  assert.equal(hasPingReply('Resposta de 192.168.1.100: bytes=32 tempo=7ms TTL=64'), true);
  assert.equal(hasPingReply('Reply from 192.168.1.14: Destination host unreachable.'), false);
  assert.equal(hasPingReply('Request timed out.'), false);
});

test('MAC de placa embarcada fornece fabricante sem inventar função', () => {
  const service = new NetworkDiscoveryService() as any;
  assert.equal(service.manufacturerFromMac('00-90-c2-f7-68-4d'), 'JK microsystems, Inc.');
  assert.equal(classifyNetworkDevice('192.168.1.100', null, 'JK microsystems, Inc.', []), AssetType.OTHER);
  assert.equal(service.manufacturerFromMac(null), null);
});

const dimepStatus = [
  'Status do REP',
  'Total de registros de ponto 0000007905',
  'Bobina da Impressora Com Papel',
  'Nr. de Série do REP 00047008340004261',
  'Modelo da Placa 411A',
  'Versões de Firmware Valor',
  'Versão do Relógio 03.00.0060',
].join(' ');

test('prioriza identidade de relógio mesmo quando a página menciona impressora', () => {
  const facts = extractHttpHardwareFacts('Status do Relógio', dimepStatus);
  assert.equal(facts.isTimeClock, true);
  assert.equal(facts.model, 'Placa 411A');
  assert.equal(facts.firmware, '03.00.0060');
  assert.equal(facts.serialNumber, '00047008340004261');
  assert.equal(classifyNetworkDevice('192.168.60.17', facts.identity, 'Dimep', [80]), AssetType.TIME_CLOCK);
});

test('não transforma título genérico nem rótulo Valor em modelo ou firmware', () => {
  const facts = extractHttpHardwareFacts('Status', 'Firmware Valor Modelo Nenhum');
  assert.equal(facts.model, null);
  assert.equal(facts.firmware, null);
});

test('porta 9100 isolada não basta para afirmar que é impressora', () => {
  assert.equal(classifyNetworkDevice('192.168.60.99', null, null, [80, 9100]), AssetType.OTHER);
  assert.equal(classifyNetworkDevice('192.168.60.100', 'HP LaserJet Pro', 'HP', [80, 9100]), AssetType.PRINTER);
  assert.equal(classifyNetworkDevice('192.168.60.101', null, null, [515, 9100]), AssetType.PRINTER);
});

test('reconhece telefone IP antes de cair em servidor por SSH', () => {
  assert.equal(classifyNetworkDevice('192.168.60.120', 'Yealink SIP-T31P IP Phone', 'Yealink', [22, 80]), AssetType.IP_PHONE);
  assert.equal(classifyNetworkDevice('192.168.60.121', null, null, [22, 80, 5060]), AssetType.IP_PHONE);
  assert.equal(classifyNetworkDevice('192.168.60.122', null, null, [22, 80]), AssetType.OTHER);
  assert.equal(classifyNetworkDevice('192.168.60.123', 'Ubuntu Linux servidor', null, [22]), AssetType.SERVER);
});

test('diferencia servidor VoIP de telefone IP comum', () => {
  assert.equal(classifyNetworkDevice('192.168.100.254', 'Asterisk FreePBX SIP Server', null, [22, 80, 5060]), AssetType.VOIP_SERVER);
  assert.equal(classifyNetworkDevice('192.168.100.254', null, null, [22, 80, 5060]), AssetType.VOIP_SERVER);
  assert.equal(classifyNetworkDevice('192.168.100.45', null, null, [80, 5060]), AssetType.IP_PHONE);
});
