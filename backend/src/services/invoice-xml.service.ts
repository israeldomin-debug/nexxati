import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeXml = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
  .trim();

const section = (xml: string, tag: string) => {
  const safe = escapeRegex(tag);
  return xml.match(new RegExp(`<(?:[\\w-]+:)?${safe}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${safe}>`, 'i'))?.[1] || '';
};

const valueOf = (xml: string, tag: string) => {
  const safe = escapeRegex(tag);
  const value = xml.match(new RegExp(`<(?:[\\w-]+:)?${safe}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${safe}>`, 'i'))?.[1];
  return value ? decodeXml(value).slice(0, 500) : null;
};

const digits = (value: string | null) => value?.replace(/\D/g, '') || '';

export class InvoiceXmlService {
  async parse(file: Express.Multer.File) {
    if (!file.originalname.toLowerCase().endsWith('.xml') && !['application/xml', 'text/xml'].includes(file.mimetype)) {
      throw new Error('Selecione um arquivo XML da NF-e');
    }
    const xml = file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!xml || !/<(?:[\w-]+:)?(?:nfeProc|NFe)\b/i.test(xml)) throw new Error('O arquivo não contém uma NF-e válida');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML com declarações externas não é permitido');

    const emit = section(xml, 'emit');
    const dest = section(xml, 'dest');
    const ide = section(xml, 'ide');
    const totals = section(xml, 'ICMSTot');
    const protocol = section(xml, 'infProt');
    const infNfeTag = xml.match(/<(?:[\w-]+:)?infNFe\b([^>]*)>/i)?.[1] || '';

    const supplierTaxId = digits(valueOf(emit, 'CNPJ') || valueOf(emit, 'CPF'));
    const buyerTaxId = digits(valueOf(dest, 'CNPJ') || valueOf(dest, 'CPF'));
    const supplierName = valueOf(emit, 'xNome') || valueOf(emit, 'xFant');
    const buyerName = valueOf(dest, 'xNome');
    const invoiceNumber = valueOf(ide, 'nNF');
    const issueDateRaw = valueOf(ide, 'dhEmi') || valueOf(ide, 'dEmi');
    const totalRaw = valueOf(totals, 'vNF');
    const itemCount = (xml.match(/<(?:[\w-]+:)?det\b/gi) || []).length;
    const keyFromId = infNfeTag.match(/\bId\s*=\s*["']NFe(\d{44})["']/i)?.[1] || null;
    const accessKey = keyFromId || digits(valueOf(protocol, 'chNFe')) || null;
    const purchaseCost = totalRaw != null && Number.isFinite(Number(totalRaw.replace(',', '.')))
      ? Number(totalRaw.replace(',', '.'))
      : null;

    const [companies, suppliers] = await Promise.all([
      prisma.company.findMany({ where: { active: true, taxId: { not: null } }, select: { id: true, name: true, taxId: true } }),
      prisma.supplier.findMany({ where: { active: true, taxId: { not: null } }, select: { id: true, name: true, taxId: true } }),
    ]);
    const company = buyerTaxId ? companies.find((item) => digits(item.taxId) === buyerTaxId) || null : null;
    const supplier = supplierTaxId ? suppliers.find((item) => digits(item.taxId) === supplierTaxId) || null : null;
    const warnings: string[] = [];
    if (buyerTaxId && !company) warnings.push(`Destinatário ${buyerName || buyerTaxId} não corresponde a uma empresa cadastrada pelo CNPJ`);
    if (supplierTaxId && !supplier) warnings.push(`Emitente ${supplierName || supplierTaxId} não corresponde a um fornecedor cadastrado pelo CNPJ`);
    if (itemCount > 1) warnings.push(`A NF-e possui ${itemCount} itens; confira o valor antes de aplicá-lo a um único ativo`);

    return {
      invoiceNumber,
      accessKey: accessKey && accessKey.length === 44 ? accessKey : accessKey?.slice(0, 255) || null,
      issueDate: issueDateRaw?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null,
      purchaseCost,
      itemCount,
      supplier: { id: supplier?.id || null, name: supplier?.name || supplierName, taxId: supplierTaxId || null },
      buyer: { id: company?.id || null, name: company?.name || buyerName, taxId: buyerTaxId || null },
      warnings,
    };
  }
}
