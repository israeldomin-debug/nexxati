import { FormEvent, useState } from 'react';
import { LockKeyhole, RotateCcw, X } from 'lucide-react';
import { AccessoryMovement } from '../types';
import { handleApiError } from '../services/api';

export function CancelAccessoryMovementModal({ movement, onClose, onConfirm }: {
  movement: AccessoryMovement;
  onClose: () => void;
  onConfirm: (password: string, reason: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('Itens devolvidos sem utilização');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || reason.trim().length < 3) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(password, reason.trim());
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-movement-title">
      <form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex gap-3">
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><RotateCcw size={21} /></span>
            <div>
              <h2 id="cancel-movement-title" className="text-lg font-bold text-slate-900">Cancelar saída do estoque</h2>
              <p className="mt-1 text-sm text-slate-500">{movement.quantity} {movement.accessory.unit} de {movement.accessory.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={19} /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">A quantidade será devolvida automaticamente ao estoque. A saída continuará no histórico como cancelada.</p>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <label className="block text-sm font-semibold text-slate-700">Motivo *<textarea autoFocus required minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label>
          <label className="block text-sm font-semibold text-slate-700">Sua senha *<span className="relative mt-1.5 block"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 font-normal focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></span></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Voltar</button>
          <button disabled={submitting || !password || reason.trim().length < 3} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"><RotateCcw size={17} />{submitting ? 'Cancelando...' : 'Confirmar cancelamento'}</button>
        </div>
      </form>
    </div>
  );
}
