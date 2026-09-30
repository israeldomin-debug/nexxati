import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../src/services/password-vault.service';

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const assets = await prisma.asset.findMany({
    where: { windowsLicenseKey: { not: null } },
    select: { id: true, windowsLicenseKey: true },
  });
  let encrypted = 0;

  for (const asset of assets) {
    const value = asset.windowsLicenseKey?.trim();
    if (!value || value.split(':').length === 3) continue;
    await prisma.asset.update({
      where: { id: asset.id },
      data: { windowsLicenseKey: encryptPassword(value) },
    });
    encrypted += 1;
  }

  console.log(`${encrypted} chave(s) antiga(s) protegida(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
