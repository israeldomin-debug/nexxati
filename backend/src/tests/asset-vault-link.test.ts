import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultEntryBelongsToAsset as belongs } from '../services/asset-vault-link';

const asset = { id: 'computer', ipAddress: '192.168.1.25', hostname: 'PC25', networkSegmentId: null };
const router = { assetId: 'router', host: '192.168.1.254', url: 'https://192.168.1.254/webpages/login.html' };
test('credencial vinculada ao roteador não aparece em IP com prefixo igual', () => {
  assert.equal(belongs(asset, router), false);
  assert.equal(belongs({ ...asset, id: 'router', ipAddress: '192.168.1.254' }, router), true);
});
test('URL sem vínculo exige IP completo; caminho e query não identificam ativo', () => {
  assert.equal(belongs(asset, { ...router, assetId: null }), false);
  assert.equal(belongs(asset, { assetId: null, host: null, url: 'https://192.168.1.25:8443/login' }), true);
  assert.equal(belongs(asset, { assetId: null, host: null, url: 'https://example.test/192.168.1.25?host=PC25' }), false);
});
test('hostname exato, vínculo exclusivo e segmento de rede são respeitados', () => {
  assert.equal(belongs(asset, { assetId: null, host: 'pc25', url: null }), true);
  assert.equal(belongs(asset, { assetId: null, host: 'pc254', url: null }), false);
  assert.equal(belongs(asset, { ...router, host: asset.ipAddress, url: null }), false);
  assert.equal(belongs(asset, { assetId: null, host: null, url: null, ipAddress: { ipAddress: asset.ipAddress, networkSegmentId: 'other-network' } }), false);
});
