import { useEffect, useState } from 'react';
import { Activity, Bot, CalendarClock, CheckCircle2, Clock3, Database, HardDrive, Image, RefreshCw, Server, TriangleAlert } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader';
import { systemHealthService, SystemHealth as SystemHealthData } from '../services/system-health.service';
import { handleApiError } from '../services/api';

const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
const duration = (seconds: number) => `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Nunca';
const timeAgo = (minutes: number) => minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.floor(minutes / 60)} h` : `há ${Math.floor(minutes / 1440)} d`;
const agentUpdateText = (agent: SystemHealthData['agents']['items'][number]) => {
  if (agent.updateStatus === 'DOWNLOADING') return `Baixando v${agent.updateTargetVersion || ''}`;
  if (agent.updateStatus === 'INSTALLING') return `Instalando v${agent.updateTargetVersion || ''}`;
  if (agent.updateStatus === 'FAILED') return `Falha na atualização${agent.updateError ? `: ${agent.updateError}` : ''}`;
  if (agent.versionCurrent) return 'Atualização automática ativa';
  return 'Instalação inicial da atualização automática necessária';
};

export function SystemHealth() {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setHealth(await systemHealthService.get()); }
    catch (err) { setError(handleApiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(load, 60_000); return () => window.clearInterval(timer); }, []);

  const cards = health ? [
    { title: 'Banco de dados', value: health.database.ok ? 'Conectado' : 'Indisponível', detail: `${health.database.latencyMs} ms · ${health.database.migrations} migrações`, icon: Database, ok: health.database.ok },
    { title: 'Backup automático', value: health.backup.verified ? 'Verificado' : 'Atenção', detail: dateTime(health.backup.lastSuccessAt), icon: HardDrive, ok: health.backup.verified },
    { title: 'Espaço em disco', value: `${health.disk.usedPercent}% utilizado`, detail: `${bytes(health.disk.freeBytes)} livres de ${bytes(health.disk.totalBytes)}`, icon: Server, ok: health.disk.usedPercent < 85 },
    { title: 'Agentes recentes', value: `${health.agents.online} de ${health.agents.total}`, detail: 'Comunicação nos últimos 5 minutos', icon: Bot, ok: health.agents.total === 0 || health.agents.online === health.agents.total },
    { title: 'Manutenção preventiva', value: health.maintenance.overdue ? `${health.maintenance.overdue} vencida(s)` : 'Em dia', detail: `${health.maintenance.upcoming} prevista(s) nos próximos 30 dias`, icon: CalendarClock, ok: health.maintenance.overdue === 0 },
    { title: 'Imagens e anexos', value: `${health.uploads.files} arquivos`, detail: bytes(health.uploads.bytes), icon: Image, ok: true },
    { title: 'Servidor', value: duration(health.uptimeSeconds), detail: `${bytes(health.memory.rssBytes)} de memória`, icon: Activity, ok: true },
  ] : [];

  return <div className="min-h-screen bg-slate-50 p-4 sm:p-6"><AppNav /><main className="mx-auto max-w-[1500px]">
    <PremiumPageHeader eyebrow="Administração" title="Saúde do sistema" description="Acompanhe banco, backups, armazenamento e comunicação dos agentes." icon={Activity} actions={<><a href="/backup" className={premiumHeaderSecondaryAction}><HardDrive size={18} /> Abrir backups</a><button onClick={load} disabled={loading} className={premiumHeaderPrimaryAction}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Atualizar</button></>} />
    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {health && <>
      <div className={`mb-5 flex items-center gap-3 rounded-2xl border px-5 py-4 ${health.status === 'HEALTHY' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : health.status === 'WARNING' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{health.status === 'HEALTHY' ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}<div><p className="font-bold">{health.status === 'HEALTHY' ? 'Todos os serviços principais estão saudáveis' : health.status === 'WARNING' ? 'O sistema funciona, mas há pontos de atenção' : 'Existe um problema crítico'}</p>{health.warnings.length > 0 && <p className="mt-1 text-sm">{health.warnings.join(' · ')}</p>}</div></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({ title, value, detail, icon: Icon, ok }) => <section key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className={`rounded-xl p-3 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Icon size={22} /></span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{ok ? 'OK' : 'ATENÇÃO'}</span></div><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></section>)}</div>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Clock3 size={18} className="text-blue-600" /><h2 className="font-bold text-slate-900">Última comunicação dos agentes</h2></div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{health.agents.currentVersion ? `Versão publicada: v${health.agents.currentVersion}` : 'Nenhuma versão publicada'}</span>
        </div>
        {health.agents.items.length ? <div className="divide-y divide-slate-100">{health.agents.items.map((agent) =>
          <div key={agent.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-4 text-sm ${agent.online ? '' : 'bg-red-50/70'}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-800">{agent.computerName}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${agent.online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{agent.online ? 'Ativo' : 'Sem comunicação'}</span>
              </div>
              <p className="text-slate-500">{agent.agentName}</p>
            </div>
            <div className="text-right">
              <p className={agent.online ? 'text-slate-600' : 'font-semibold text-red-700'}>{timeAgo(agent.minutesSinceLastSeen)} · {dateTime(agent.lastSeenAt)}</p>
              <p className={`mt-1 text-xs ${agent.versionCurrent ? 'text-emerald-700' : 'font-semibold text-amber-700'}`}>{agent.agentVersion ? `v${agent.agentVersion}` : 'Versão não informada'}{!agent.versionCurrent && health.agents.currentVersion && ` · Atualizar para v${health.agents.currentVersion}`}</p>
              <p className={`mt-1 max-w-xl text-xs ${agent.updateStatus === 'FAILED' ? 'font-semibold text-red-700' : agent.updateStatus === 'DOWNLOADING' || agent.updateStatus === 'INSTALLING' ? 'font-semibold text-blue-700' : 'text-slate-500'}`}>{agentUpdateText(agent)}</p>
            </div>
          </div>)}</div> : <p className="text-sm text-slate-500">Nenhum agente registrado.</p>}
      </section>
    </>}
  </main></div>;
}
