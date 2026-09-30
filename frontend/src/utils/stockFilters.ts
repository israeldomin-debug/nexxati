import type { Accessory } from '../types';

export type StockFilter = 'ALL' | 'OUT' | 'IN' | 'LOW' | 'OK';

export function matchesRegistrationDate(createdAt: string, mode: 'ALL' | 'WEEK' | 'CUSTOM', start = '', end = '', now = Date.now()) {
  if (mode === 'ALL') return true;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  if (mode === 'WEEK') return created >= now - 7 * 24 * 60 * 60 * 1000 && created <= now;
  if (start && end && start > end) return false;
  // Datas locais: a data final inclui o dia inteiro, até a próxima meia-noite.
  const first = start ? new Date(`${start}T00:00:00`).getTime() : -Infinity;
  const nextDay = end ? new Date(`${end}T00:00:00`) : null;
  if (nextDay) nextDay.setDate(nextDay.getDate() + 1);
  return created >= first && created < (nextDay ? nextDay.getTime() : Infinity);
}

export function stockQuantity(item: Accessory, company: string, location: string) {
  if (!company && !location) return item.quantity;
  const balances = item.balances.length ? item.balances : [{ companyId: item.companyId, location: item.location, quantity: item.quantity }];
  const matching = balances.filter((balance) =>
    (!company || (company === 'NONE' ? !balance.companyId : balance.companyId === company)) &&
    (!location || (location === 'NONE' ? !balance.location : balance.location === location)),
  );
  return matching.length ? matching.reduce((sum, balance) => sum + balance.quantity, 0) : null;
}

export function matchesStock(quantity: number, minimum: number, filter: StockFilter) {
  switch (filter) {
    case 'OUT': return quantity <= 0;
    case 'IN': return quantity > 0;
    case 'LOW': return quantity <= minimum;
    case 'OK': return quantity > minimum;
    default: return true;
  }
}
