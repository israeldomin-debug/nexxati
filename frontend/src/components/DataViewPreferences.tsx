import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Columns3, Plus, RotateCcw, Trash2 } from 'lucide-react';

type ColumnOption<T extends string> = { id: T; label: string; required?: boolean };

export function useVisibleColumns<T extends string>(storageKey: string, options: ColumnOption<T>[]) {
  const defaults = useMemo(() => options.map(({ id }) => id), [options]);
  const [visible, setVisible] = useState<T[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]') as T[];
      const valid = stored.filter((id) => options.some((option) => option.id === id));
      return valid.length ? valid : defaults;
    } catch { return defaults; }
  });

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(visible)); }, [storageKey, visible]);
  const isVisible = (id: T) => visible.includes(id);
  const toggle = (id: T) => setVisible((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const reset = () => setVisible(defaults);
  return { visible, isVisible, toggle, reset };
}

export function TableColumnPicker<T extends string>({ options, visible, onToggle, onReset }: {
  options: ColumnOption<T>[];
  visible: T[];
  onToggle: (id: T) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return <div ref={root} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"><Columns3 size={16} /> Colunas <ChevronDown size={14} /></button>
    {open && <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/15">
      <div className="px-2 pb-2 pt-1"><p className="text-xs font-bold text-slate-800">Informações visíveis</p><p className="mt-1 text-[11px] text-slate-500">A escolha fica salva neste navegador.</p></div>
      {options.map((option) => {
        const checked = visible.includes(option.id);
        return <button key={option.id} type="button" disabled={option.required} onClick={() => onToggle(option.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-70"><span className={`grid h-5 w-5 place-items-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check size={13} /></span>{option.label}{option.required && <span className="ml-auto text-[10px] font-bold uppercase text-slate-400">fixa</span>}</button>;
      })}
      <button type="button" onClick={onReset} className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border-t border-slate-100 px-2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"><RotateCcw size={13} /> Restaurar padrão</button>
    </div>}
  </div>;
}

type SavedView<T> = { id: string; name: string; filters: T };

export function SavedFilterViews<T extends object>({ storageKey, current, onApply }: { storageKey: string; current: T; onApply: (filters: T) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [views, setViews] = useState<SavedView<T>[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') as SavedView<T>[]; } catch { return []; }
  });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(views)); }, [storageKey, views]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews((items) => [...items.filter((item) => item.name.toLocaleLowerCase() !== trimmed.toLocaleLowerCase()), { id: crypto.randomUUID(), name: trimmed, filters: current }]);
    setName('');
  };

  return <div ref={root} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"><Bookmark size={15} /> Visões salvas <ChevronDown size={14} /></button>
    {open && <div className="absolute right-0 top-11 z-40 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15">
      <p className="text-xs font-bold text-slate-800">Salvar filtros atuais</p>
      <div className="mt-2 flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} placeholder="Ex.: Notebooks da Geocal" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button type="button" onClick={save} disabled={!name.trim()} className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white disabled:opacity-40" aria-label="Salvar visão"><Plus size={16} /></button></div>
      <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
        {views.length ? views.map((view) => <div key={view.id} className="flex items-center rounded-lg hover:bg-slate-50"><button type="button" onClick={() => { onApply(view.filters); setOpen(false); }} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm font-medium text-slate-700">{view.name}</button><button type="button" onClick={() => setViews((items) => items.filter((item) => item.id !== view.id))} className="p-2 text-slate-400 hover:text-red-600" aria-label={`Excluir visão ${view.name}`}><Trash2 size={14} /></button></div>) : <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">Nenhuma visão salva ainda.</p>}
      </div>
    </div>}
  </div>;
}
