import { useEffect, useMemo, useState } from 'react';
import { Printer, Search, ShieldCheck } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader';
import { AuditEvent, auditService } from '../services/audit.service';
import { handleApiError } from '../services/api';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';

const actionLabel = (action: string) => action === 'DELETE' ? 'Exclusão' : action === 'CREATE' ? 'Criação' : action === 'UPDATE' ? 'Alteração' : action;

export function AuditReports() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [mode, setMode] = useState<'deleted' | 'passwords'>('deleted');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    auditService.list().then(setEvents).catch((err) => setError(handleApiError(err)));
  }, []);

  const rows = useMemo(() => events.filter((event) => {
    if (mode === 'deleted' && event.action !== 'DELETE') return false;
    if (mode === 'passwords' && event.resourceType !== 'password-vault') return false;
    const term = search.trim().toLowerCase();
    return !term || [event.resourceName, event.resourceType, event.performedBy?.name, event.performedBy?.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
  }), [events, mode, search]);
  const auditPagination = useClientPagination(rows, `${mode}-${search}`);

  return <div className="min-h-screen bg-slate-50 p-4 sm:p-6"><style>{`@media print{.no-print{display:none!important}body{background:#fff!important}main{max-width:none!important}}`}</style><div className="no-print"><AppNav /></div><main className="mx-auto max-w-[1500px]">
    <PremiumPageHeader eyebrow="Segurança" title="Relatórios de auditoria" description="Exclusões e alterações no banco de senhas, com responsável e horário." icon={ShieldCheck} actions={<button onClick={() => window.print()} className={`no-print ${premiumHeaderSecondaryAction}`}><Printer size={17}/> Imprimir</button>} />
    {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="no-print mb-5 flex flex-wrap gap-3"><button onClick={() => setMode('deleted')} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${mode === 'deleted' ? 'bg-red-600 text-white' : 'border bg-white text-slate-700'}`}>Itens excluídos</button><button onClick={() => setMode('passwords')} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${mode === 'passwords' ? 'bg-amber-600 text-white' : 'border bg-white text-slate-700'}`}>Alterações de senhas</button><label className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar item ou responsável..."/></label></div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[900px] w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr>{['Data e hora','Evento','Tipo de item','Item','Campos alterados','Realizado por'].map((title) => <th key={title} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? auditPagination.paginatedItems.map((event) => <tr key={event.id} className="text-sm"><td className="px-4 py-3 whitespace-nowrap">{new Date(event.createdAt).toLocaleString('pt-BR')}</td><td className="px-4 py-3 font-semibold">{actionLabel(event.action)}</td><td className="px-4 py-3">{event.resourceType}</td><td className="px-4 py-3 font-semibold text-slate-900">{event.resourceName}</td><td className="px-4 py-3 text-xs text-slate-600">{event.changedFields.length ? event.changedFields.join(', ') : '—'}</td><td className="px-4 py-3">{event.performedBy?.name || 'Usuário removido'}<span className="block text-xs text-slate-400">{event.performedBy?.email}</span></td></tr>) : <tr><td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">Nenhum evento encontrado.</td></tr>}</tbody></table></div>{rows.length > 0 && <div className="no-print"><PaginationControls {...auditPagination} /></div>}</section>
  </main></div>;
}
