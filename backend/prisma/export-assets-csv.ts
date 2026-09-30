import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const relationColumns = [
  'usuario_atribuido_nome',
  'usuario_atribuido_usuario',
  'usuario_atribuido_email',
  'empresa_nome',
  'empresa_codigo',
  'empresa_cnpj',
  'adquirido_por_empresa_nome',
  'adquirido_por_empresa_codigo',
  'fornecedor_nome',
  'fornecedor_cnpj',
  'ativo_pai_codigo',
  'ativo_pai_nome',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';

  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (Prisma.Decimal.isDecimal(value)) text = value.toString();
  else if (Array.isArray(value) || typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

async function main() {
  const outputArgument = process.argv[2];
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.resolve(outputArgument || path.join('..', `ativos-completo-${date}.csv`));

  const scalarFields = Prisma.dmmf.datamodel.models
    .find((model) => model.name === 'Asset')
    ?.fields.filter((field) => field.kind !== 'object')
    .map((field) => field.name);

  if (!scalarFields?.length) throw new Error('Não foi possível identificar os campos do modelo Asset.');

  const assets = await prisma.asset.findMany({
    include: {
      assignedTo: { select: { name: true, username: true, email: true } },
      company: { select: { name: true, code: true, taxId: true } },
      purchasedByCompany: { select: { name: true, code: true } },
      supplier: { select: { name: true, taxId: true } },
      parentAsset: { select: { assetTag: true, name: true } },
    },
    orderBy: [{ company: { name: 'asc' } }, { category: 'asc' }, { name: 'asc' }],
  });

  const headers = [...scalarFields, ...relationColumns];
  const rows = assets.map((asset) => {
    const record = asset as unknown as Record<string, unknown>;
    const relationValues: Record<(typeof relationColumns)[number], unknown> = {
      usuario_atribuido_nome: asset.assignedTo?.name,
      usuario_atribuido_usuario: asset.assignedTo?.username,
      usuario_atribuido_email: asset.assignedTo?.email,
      empresa_nome: asset.company?.name,
      empresa_codigo: asset.company?.code,
      empresa_cnpj: asset.company?.taxId,
      adquirido_por_empresa_nome: asset.purchasedByCompany?.name,
      adquirido_por_empresa_codigo: asset.purchasedByCompany?.code,
      fornecedor_nome: asset.supplier?.name,
      fornecedor_cnpj: asset.supplier?.taxId,
      ativo_pai_codigo: asset.parentAsset?.assetTag,
      ativo_pai_nome: asset.parentAsset?.name,
    };

    return [
      ...scalarFields.map((field) => csvCell(record[field])),
      ...relationColumns.map((field) => csvCell(relationValues[field])),
    ].join(';');
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `\uFEFF${headers.map(csvCell).join(';')}\r\n${rows.join('\r\n')}\r\n`, 'utf8');

  console.log(JSON.stringify({ outputPath, assets: assets.length, columns: headers.length }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
