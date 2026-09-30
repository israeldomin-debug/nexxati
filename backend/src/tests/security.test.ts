import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { decryptPassword, encryptPassword } from '../services/password-vault.service';

const legacyEncrypt = (value: string) => {
  const key = crypto.createHash('sha256').update('test-only-unsupported-legacy-key').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

test('cofre criptografa e descriptografa com a chave exclusiva', () => {
  process.env.VAULT_ENCRYPTION_KEY = 'test-vault-key-that-is-not-used-in-production';
  process.env.JWT_SECRET = 'test-jwt-key';
  const encrypted = encryptPassword('senha-complexa-123');
  assert.ok(encrypted);
  assert.notEqual(encrypted, 'senha-complexa-123');
  assert.equal(decryptPassword(encrypted), 'senha-complexa-123');
});

test('cofre rejeita registros criptografados com chave fixa legada', () => {
  process.env.VAULT_ENCRYPTION_KEY = 'new-test-vault-key';
  process.env.JWT_SECRET = 'new-test-jwt-key';
  assert.equal(decryptPassword(legacyEncrypt('registro-antigo')), '');
});

test('valor legado em texto simples continua legível', () => {
  assert.equal(decryptPassword('licenca-legada-sem-criptografia'), 'licenca-legada-sem-criptografia');
});
