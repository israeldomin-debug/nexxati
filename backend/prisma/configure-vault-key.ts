import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env');
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

if (/^VAULT_ENCRYPTION_KEY=/m.test(current)) {
  console.log('VAULT_ENCRYPTION_KEY já está configurada.');
  process.exit(0);
}

const secret = crypto.randomBytes(48).toString('base64url');
const separator = current.length && !current.endsWith('\n') ? '\n' : '';
fs.writeFileSync(envPath, `${current}${separator}VAULT_ENCRYPTION_KEY="${secret}"\n`, { encoding: 'utf8', mode: 0o600 });
console.log('Chave exclusiva do cofre configurada com sucesso.');
