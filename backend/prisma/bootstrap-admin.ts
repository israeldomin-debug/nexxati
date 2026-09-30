import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não foi informado.`);
  return value;
}

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { email: true, username: true },
  });

  if (existingAdmin) {
    console.log(`Administrador já existe: ${existingAdmin.username || existingAdmin.email}`);
    return;
  }

  const name = required('INITIAL_ADMIN_NAME');
  const username = required('INITIAL_ADMIN_USERNAME').toLowerCase();
  const email = required('INITIAL_ADMIN_EMAIL').toLowerCase();
  const password = required('INITIAL_ADMIN_PASSWORD');

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error('INITIAL_ADMIN_USERNAME deve ter de 3 a 50 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('INITIAL_ADMIN_PASSWORD precisa ter 8 caracteres, maiúscula, minúscula, número e caractere especial.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      username,
      email,
      passwordHash,
      role: 'ADMIN',
      mustChangePassword: true,
    },
  });

  console.log(`Administrador inicial criado: ${username}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
