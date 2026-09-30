import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Database, Download, HardDrive, Play, RotateCcw, UploadCloud } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader } from '../components/PremiumPageHeader';
import { backupService } from '../services/backup.service';
import { handleApiError } from '../services/api';
import type { AutomaticBackupStatus } from '../services/backup.service';

export function BackupRestore() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [automaticStatus, setAutomaticStatus] = useState<AutomaticBackupStatus | null>(null);
  const [runningAutomatic, setRunningAutomatic] = useState(false);

  const loadAutomaticStatus = () => backupService.automaticStatus().then(setAutomaticStatus).catch((err) => setError(handleApiError(err)));
  useEffect(() => { void loadAutomaticStatus(); }, []);

  const runAutomatic = async () => {
    setRunningAutomatic(true);
    setError('');
    setNotice('');
    try {
      const status = await backupService.runAutomatic();
      setAutomaticStatus(status);
      setNotice('Backup automático criado e verificado com sucesso.');
    } catch (err) {
      setError(handleApiError(err));
      await loadAutomaticStatus();
    } finally {
      setRunningAutomatic(false);
    }
  };

  const formatBytes = (bytes: number | null) => bytes == null ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não executado';

  const download = async () => {
    setLoadingBackup(true);
    setError('');
    setNotice('');
    try {
      await backupService.downloadBackup();
      setNotice('Backup gerado e baixado com sucesso.');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoadingBackup(false);
    }
  };

  const restore = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Selecione um arquivo de backup.');
      return;
    }
    if (confirmText.trim().toUpperCase() !== 'RESTAURAR') {
      setError('Digite RESTAURAR para confirmar a operação.');
      return;
    }
    if (!window.confirm('Tem certeza que deseja restaurar este backup? Os dados atuais podem ser substituídos.')) return;

    setLoadingRestore(true);
    setError('');
    setNotice('');
    try {
      const result = await backupService.restoreBackup(file);
      setNotice(result.message || 'Backup restaurado com sucesso. Reinicie o backend se notar dados antigos em cache.');
      setFile(null);
      setConfirmText('');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoadingRestore(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1100px]">
        <PremiumPageHeader eyebrow="Segurança dos dados" title="Backup e restauração" description="Gere uma cópia completa do banco de dados e das imagens ou restaure um arquivo de backup." icon={Database} />

        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-emerald-50 to-cyan-50 px-6 py-5">
            <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><HardDrive size={24} /></span><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Proteção automática</p><h2 className="text-xl font-bold text-slate-900">Backup diário verificado</h2><p className="mt-1 text-sm text-slate-600">Executado diariamente pelo servidor, com retenção e validação do banco antes de ser considerado seguro.</p></div></div>
            <button type="button" onClick={runAutomatic} disabled={runningAutomatic || automaticStatus?.running} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"><Play size={17} />{runningAutomatic || automaticStatus?.running ? 'Executando e verificando...' : 'Executar agora'}</button>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs font-bold uppercase text-slate-400">Último sucesso</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 size={16} className="text-blue-600" />{formatDateTime(automaticStatus?.lastSuccessAt || null)}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-400">Verificação</p><p className={`mt-1 flex items-center gap-2 text-sm font-semibold ${automaticStatus?.verified ? 'text-emerald-700' : 'text-slate-500'}`}><CheckCircle2 size={16} />{automaticStatus?.verified ? 'Banco e arquivo válidos' : 'Aguardando execução'}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-400">Tamanho</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatBytes(automaticStatus?.lastSizeBytes ?? null)}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-400">Cópia externa</p><p className={`mt-1 text-sm font-semibold ${automaticStatus?.destinationCopied ? 'text-emerald-700' : 'text-amber-700'}`}>{automaticStatus?.destinationCopied ? 'Copiada para o destino configurado' : 'Destino externo não configurado'}</p></div>
          </div>
          {automaticStatus?.error && <div className="border-t border-red-100 bg-red-50 px-6 py-3 text-sm font-medium text-red-700">Última falha: {automaticStatus.error}</div>}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Download size={24} /></span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Fazer backup</h2>
                <p className="mt-1 text-sm text-slate-500">Baixa um único arquivo `.hdfbackup` com o banco atual e a pasta de imagens.</p>
              </div>
            </div>
            <button onClick={download} disabled={loadingBackup} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <Download size={18} /> {loadingBackup ? 'Gerando backup...' : 'Gerar e baixar backup'}
            </button>
            <p className="mt-4 text-xs leading-5 text-slate-500">Dica: guarde esse arquivo fora do computador do sistema, de preferência em uma pasta segura da rede.</p>
          </section>

          <section className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <span className="rounded-xl bg-red-50 p-3 text-red-700"><RotateCcw size={24} /></span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Restaurar backup</h2>
                <p className="mt-1 text-sm text-slate-500">Restaura o backup completo `.hdfbackup` ou um backup antigo somente do banco.</p>
              </div>
            </div>

            <form onSubmit={restore} className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Arquivo de backup
                <input type="file" accept=".hdfbackup,.backup,.dump,.pgdump" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" />
              </label>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle size={16} /> Atenção</div>
                A restauração pode sobrescrever dados atuais. Faça um backup antes de restaurar outro arquivo.
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Digite RESTAURAR para confirmar
                <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" placeholder="RESTAURAR" />
              </label>
              <button disabled={loadingRestore || !file || confirmText.trim().toUpperCase() !== 'RESTAURAR'} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                <UploadCloud size={18} /> {loadingRestore ? 'Restaurando...' : 'Restaurar backup'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
