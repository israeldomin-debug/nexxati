const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/stockFilters.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exported });
const { matchesStock, stockQuantity } = exported;

test('período de cadastro inclui dias completos e aceita limites isolados', () => {
  const matches = exported.matchesRegistrationDate;
  assert.equal(matches('2026-09-24T00:00:00', 'CUSTOM', '2026-09-24', '2026-09-24'), true);
  assert.equal(matches('2026-09-24T23:59:59.999', 'CUSTOM', '2026-09-24', '2026-09-24'), true);
  assert.equal(matches('2026-09-25T00:00:00', 'CUSTOM', '2026-09-24', '2026-09-24'), false);
  assert.equal(matches('2026-09-23T23:59:59', 'CUSTOM', '2026-09-24', ''), false);
  assert.equal(matches('2026-09-20T12:00:00', 'CUSTOM', '', '2026-09-24'), true);
  assert.equal(matches('2026-09-24T12:00:00', 'CUSTOM', '2026-09-25', '2026-09-24'), false);
  const now = new Date('2026-09-24T12:00:00').getTime();
  assert.equal(matches('2026-09-17T12:00:00', 'WEEK', '', '', now), true);
  assert.equal(matches('2026-09-17T11:59:59', 'WEEK', '', '', now), false);
});

test('saldo zero, positivo e limite mínimo', () => {
  assert.equal(matchesStock(0, 2, 'OUT'), true);
  assert.equal(matchesStock(1, 2, 'OUT'), false);
  assert.equal(matchesStock(0, 2, 'IN'), false);
  assert.equal(matchesStock(1, 2, 'IN'), true);
  assert.equal(matchesStock(2, 2, 'LOW'), true);
  assert.equal(matchesStock(3, 2, 'LOW'), false);
  assert.equal(matchesStock(2, 2, 'OK'), false);
  assert.equal(matchesStock(3, 2, 'OK'), true);
});

test('empresa e local precisam corresponder ao mesmo saldo', () => {
  const item = { quantity: 7, balances: [
    { companyId: 'A', location: 'Armário', quantity: 0 },
    { companyId: 'A', location: 'Gaveta', quantity: 2 },
    { companyId: 'B', location: 'Depósito', quantity: 5 },
  ] };
  assert.equal(stockQuantity(item, '', ''), 7);
  assert.equal(stockQuantity(item, 'A', ''), 2);
  assert.equal(stockQuantity(item, 'A', 'Armário'), 0);
  assert.equal(stockQuantity(item, 'A', 'Depósito'), null);
  assert.equal(matchesStock(stockQuantity(item, 'A', 'Armário'), 1, 'OUT'), true);
});

test('sem empresa/local e registros antigos sem saldos', () => {
  const item = { quantity: 3, companyId: null, location: null, balances: [] };
  assert.equal(stockQuantity(item, 'NONE', 'NONE'), 3);
  assert.equal(stockQuantity(item, 'A', ''), null);
});
