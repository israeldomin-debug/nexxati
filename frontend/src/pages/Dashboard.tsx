import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArchiveX, BarChart3, CheckCircle2, ClipboardList, Clock3, Database, Globe2, KeyRound, PackageCheck, Users } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { dashboardService } from '../services/dashboard.service';
import { AccessoryMovement, DashboardMetrics } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { accessoryService } from '../services/accessory.service';
import { hasPermission } from '../utils/permissions';

const DASHBOARD_REFRESH_INTERVAL_MS = 60_000;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [movements, setMovements] = useState<AccessoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canViewStockLogs = hasPermission(user, 'ACCESS_ACCESSORIES');
  const canViewTickets = hasPermission(user, 'ACCESS_TICKETS');
  const canViewLicenses = hasPermission(user, 'ACCESS_LICENSES');
  const canViewAdminShortcuts =
    user?.role === 'ADMIN' ||
    hasPermission(user, 'ACCESS_ASSETS') ||
    hasPermission(user, 'ACCESS_ACCESSORIES');

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const dashboard = await dashboardService.getMetrics();
        const recentMovements = canViewStockLogs ? await accessoryService.movements(6).catch(() => []) : [];
        setMetrics(dashboard);
        setMovements(recentMovements);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erro ao carregar métricas');
      } finally {
        setIsLoading(false);
      }
    };
    loadMetrics();
    const timer = window.setInterval(loadMetrics, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canViewStockLogs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <AppNav />
        <div className="mx-auto max-w-[1500px] rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500">
          Carregando dashboard...
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <AppNav />
        <div className="mx-auto max-w-[1500px] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Erro ao carregar métricas'}
        </div>
      </div>
    );
  }

  const inventory = metrics.inventory || { assets: 0, detectedIps: 0, manualIps: 0, licenses: 0, disposalItems: 0 };
  const ticketSummary = metrics.summary || { open: 0, inProgress: 0, completed: 0 };
  const cards = [
    { label: 'Ativos cadastrados', value: inventory.assets, icon: PackageCheck, color: 'text-blue-700 bg-blue-50', to: '/assets' },
    { label: 'IPs detectados automaticamente', value: inventory.detectedIps, icon: Globe2, color: 'text-emerald-700 bg-emerald-50', to: '/ip-addresses' },
    { label: 'IPs inseridos manualmente', value: inventory.manualIps, icon: Globe2, color: 'text-cyan-700 bg-cyan-50', to: '/ip-addresses' },
    { label: 'Licenças inseridas', value: inventory.licenses, icon: KeyRound, color: 'text-purple-700 bg-purple-50', to: '/licenses' },
    { label: 'Itens para descarte', value: inventory.disposalItems, icon: ArchiveX, color: 'text-red-700 bg-red-50', to: '/disposals' },
  ] as const;

  const ticketCards = [
    { label: 'Chamados em aberto', value: ticketSummary.open, helper: 'Aguardando triagem', icon: ClipboardList, color: 'text-emerald-700 bg-emerald-50', to: '/tickets?status=OPEN' },
    { label: 'Em atendimento', value: ticketSummary.inProgress, helper: 'Em análise ou progresso', icon: Clock3, color: 'text-blue-700 bg-blue-50', to: '/tickets?statusGroup=IN_PROGRESS' },
    { label: 'Atendidos', value: ticketSummary.completed, helper: 'Concluídos no histórico', icon: CheckCircle2, color: 'text-slate-700 bg-slate-100', to: '/tickets?view=COMPLETED' },
  ] as const;
  const upcomingLicenses = metrics.attention?.upcomingLicenses || [];
  const criticalLicenses = upcomingLicenses.filter((license) => license.daysUntilExpiration <= 7).length;
  const hasLicenseAlerts = canViewLicenses && upcomingLicenses.length > 0;
  const licenseAlertTone = criticalLicenses > 0 ? 'from-red-600 via-rose-600 to-orange-500' : 'from-amber-500 via-orange-500 to-red-500';

  const attentionItems = [
    ...(canViewTickets ? [
      { label: 'Chamados aguardando triagem', value: ticketSummary.open, helper: 'Requerem análise inicial', to: '/tickets?status=OPEN', tone: ticketSummary.open > 0 ? 'amber' : 'slate' },
      { label: 'Chamados em atendimento', value: ticketSummary.inProgress, helper: 'Em análise ou andamento', to: '/tickets?statusGroup=IN_PROGRESS', tone: ticketSummary.inProgress > 0 ? 'blue' : 'slate' },
    ] : []),
    ...(hasPermission(user, 'ACCESS_ASSETS') ? [
      { label: 'Itens aguardando descarte', value: inventory.disposalItems, helper: 'Materiais fora de operação', to: '/disposals', tone: inventory.disposalItems > 0 ? 'red' : 'slate' },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <section className="premium-hero relative mb-7 overflow-hidden rounded-[1.75rem] border border-slate-800 p-7 text-white shadow-2xl shadow-slate-900/15 sm:p-9">
          <div className="premium-hero-glow absolute -right-24 -top-28 h-72 w-72 rounded-full opacity-20 blur-3xl" />
          <img src="/nexxati-icon-modern.svg" alt="" className="absolute -bottom-16 right-8 hidden h-56 w-56 object-contain opacity-[0.08] sm:block" />
          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/75">
                <BarChart3 size={15} /> Visão geral
              </div>
              <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Bem-vindo, <strong className="font-bold text-white">{user?.name}</strong>. Acompanhe ativos, IPs, licenças e estoque em um só lugar.
              </p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Atualização automática</p>
          </div>
        </section>

        {canViewTickets && (
          <section className="mb-6 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Atendimento agora</p>
                <h2 className="text-lg font-bold text-slate-950">Fila de chamados</h2>
              </div>
              <button onClick={() => navigate('/tickets')} className="text-sm font-semibold text-blue-700 hover:text-blue-900">Abrir chamados</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {ticketCards.map(({ label, value, helper, icon: Icon, color, to }) => (
                <button key={label} type="button" onClick={() => navigate(to)} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div>
                    <span className={`rounded-lg p-2.5 ${color}`}><Icon size={20} /></span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mb-6 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600">Prioridades</p>
              <h2 className="text-lg font-bold text-slate-950">Precisa de atenção</h2>
            </div>
            {hasLicenseAlerts && (
              <button
                type="button"
                onClick={() => navigate('/licenses')}
                className={`mb-4 w-full overflow-hidden rounded-2xl bg-gradient-to-r ${licenseAlertTone} p-4 text-left text-white shadow-xl shadow-red-950/10 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-red-950/15 focus:outline-none focus:ring-2 focus:ring-red-200`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/18 ring-1 ring-white/20">
                      <AlertTriangle size={23} />
                    </span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/75">Alerta de vencimentos</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight">
                        {upcomingLicenses.length} licença{upcomingLicenses.length === 1 ? '' : 's'} vence{upcomingLicenses.length === 1 ? '' : 'm'} em 60 dias ou menos
                      </h3>
                      <p className="mt-1 text-sm font-medium text-white/85">
                        {criticalLicenses > 0
                          ? `${criticalLicenses} vencimento${criticalLicenses === 1 ? '' : 's'} em até 7 dias.`
                          : 'Nenhuma licença crítica nos próximos 7 dias.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-[52%] lg:justify-end">
                    {upcomingLicenses.map((license) => (
                      <span key={license.id} className="rounded-xl bg-white/16 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/20">
                        {license.softwareName} · {license.daysUntilExpiration === 0 ? 'hoje' : `${license.daysUntilExpiration}d`}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              {attentionItems.length ? attentionItems.map((item) => (
                <button key={item.label} onClick={() => navigate(item.to)} className="group rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-blue-200 hover:bg-white hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.helper}</p></div><span className={`grid h-9 min-w-9 place-items-center rounded-lg text-sm font-black ${item.tone === 'red' ? 'bg-red-50 text-red-700' : item.tone === 'amber' ? 'bg-amber-50 text-amber-700' : item.tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{item.value}</span></div>
                </button>
              )) : <p className="text-sm text-slate-500">Nenhuma pendência disponível para o seu perfil.</p>}
            </div>
          </div>

          {canViewAdminShortcuts && <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Acesso rápido</p>
            <h2 className="mb-3 text-lg font-bold text-slate-950">Operações frequentes</h2>
            <div className="space-y-2">
              {user?.role === 'ADMIN' && <button onClick={() => navigate('/users')} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Users size={18} /></span>Gerenciar usuários</button>}
              {hasPermission(user, 'ACCESS_ASSETS') && <button onClick={() => navigate('/assets')} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><ClipboardList size={18} /></span>Abrir inventário</button>}
              {hasPermission(user, 'ACCESS_ACCESSORIES') && <button onClick={() => navigate('/accessories')} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><BarChart3 size={18} /></span>Movimentar estoque</button>}
            </div>
          </div>}
        </section>

        <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Inventário</p><h2 className="text-lg font-bold text-slate-950">Visão patrimonial</h2></div><p className="text-xs text-slate-400">Atualizado a cada minuto</p></div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map(({ label, value, icon: Icon, color, to }) => {
            const content = (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
                </div>
                <span className={`rounded-xl p-3 ${color}`}>
                  <Icon size={22} />
                </span>
              </div>
            );

            return to ? (
              <button
                key={label}
                type="button"
                onClick={() => navigate(to)}
                className="premium-metric-card rounded-2xl border border-white/80 bg-white/90 p-5 text-left shadow-lg shadow-slate-900/5 backdrop-blur transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-slate-900/10 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {content}
              </button>
            ) : (
              <div key={label} className="premium-metric-card rounded-2xl border border-white/80 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur">
                {content}
              </div>
            );
          })}
        </div>

        {user?.role === 'ADMIN' && metrics.databaseUsage && (
          <section className="mb-8 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <span className="rounded-xl bg-indigo-50 p-3 text-indigo-700">
                  <Database size={24} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Uso do banco de dados</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{metrics.databaseUsage.prettySize}</h2>
                  <p className="text-sm text-slate-500">Banco: {metrics.databaseUsage.databaseName}</p>
                </div>
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-3xl xl:grid-cols-5">
                {metrics.databaseUsage.topTables.map((table) => (
                  <div key={table.tableName} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500" title={table.tableName}>{table.tableName}</p>
                    <p className="mt-1 font-bold text-slate-800">{table.prettySize}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {canViewStockLogs && <section className="mt-8 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Logs recentes de estoque</h2>
            <button onClick={() => navigate('/accessories/reports')} className="text-sm font-semibold text-blue-700 hover:text-blue-900">Ver relatório</button>
          </div>
          <div className="space-y-3">
            {movements.length ? movements.map((movement) => (
              <div key={movement.id} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-800">{movement.type === 'OUT' ? 'Saída' : movement.type === 'IN' ? 'Entrada' : 'Ajuste'} · {movement.quantity} {movement.accessory.unit} · {movement.accessory.name}</p>
                <p className="text-slate-500">{movement.asset ? `Ativo: ${movement.asset.name}` : movement.user ? `Usuário: ${movement.user.name}` : 'Sem vínculo'} · {new Date(movement.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhuma movimentação recente.</p>}
          </div>
        </section>}

      </main>
    </div>
  );
};
