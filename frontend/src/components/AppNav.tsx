import { ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  ArchiveX,
  Building2,
  Bot,
  Camera,
  ClipboardList,
  ClipboardCheck,
  DatabaseBackup,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PackageCheck,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/useAuthStore';
import { NotificationCenter } from './NotificationCenter';
import { BrandMark } from './BrandMark';
import { ThemePicker } from './ThemePicker';
import { userService } from '../services/user.service';
import { handleApiError } from '../services/api';

type NavItem = {
  to: string;
  label: string;
  Icon: LucideIcon;
  color: string;
  active: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const atendimentoItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, color: 'text-indigo-700 bg-indigo-50 border-indigo-100 hover:border-indigo-200 hover:bg-indigo-100', active: 'border-indigo-500 bg-indigo-600 text-white shadow-indigo-200' },
  { to: '/tickets', label: 'Chamados', Icon: ClipboardList, color: 'text-sky-700 bg-sky-50 border-sky-100 hover:border-sky-200 hover:bg-sky-100', active: 'border-sky-500 bg-sky-600 text-white shadow-sky-200' },
];

const patrimonioItems: NavItem[] = [
  { to: '/assets', label: 'Ativos', Icon: PackageCheck, color: 'text-blue-700 bg-blue-50 border-blue-100 hover:border-blue-200 hover:bg-blue-100', active: 'border-blue-500 bg-blue-600 text-white shadow-blue-200' },
  { to: '/ip-addresses', label: 'IPs', Icon: Globe2, color: 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:border-emerald-200 hover:bg-emerald-100', active: 'border-emerald-500 bg-emerald-600 text-white shadow-emerald-200' },
  { to: '/password-vault', label: 'Senhas', Icon: LockKeyhole, color: 'text-amber-700 bg-amber-50 border-amber-100 hover:border-amber-200 hover:bg-amber-100', active: 'border-amber-500 bg-amber-500 text-white shadow-amber-200' },
  { to: '/accessories', label: 'Estoque', Icon: Archive, color: 'text-cyan-700 bg-cyan-50 border-cyan-100 hover:border-cyan-200 hover:bg-cyan-100', active: 'border-cyan-500 bg-cyan-600 text-white shadow-cyan-200' },
  { to: '/disposals', label: 'Descarte', Icon: ArchiveX, color: 'text-rose-700 bg-rose-50 border-rose-100 hover:border-rose-200 hover:bg-rose-100', active: 'border-rose-500 bg-rose-600 text-white shadow-rose-200' },
];

const cadastroItems: NavItem[] = [
  { to: '/licenses', label: 'Licenças', Icon: KeyRound, color: 'text-violet-700 bg-violet-50 border-violet-100 hover:border-violet-200 hover:bg-violet-100', active: 'border-violet-500 bg-violet-600 text-white shadow-violet-200' },
  { to: '/companies', label: 'Empresas', Icon: Building2, color: 'text-teal-700 bg-teal-50 border-teal-100 hover:border-teal-200 hover:bg-teal-100', active: 'border-teal-500 bg-teal-600 text-white shadow-teal-200' },
  { to: '/suppliers', label: 'Fornecedores', Icon: Truck, color: 'text-orange-700 bg-orange-50 border-orange-100 hover:border-orange-200 hover:bg-orange-100', active: 'border-orange-500 bg-orange-500 text-white shadow-orange-200' },
];

const redeItems = patrimonioItems.filter((item) => item.to === '/ip-addresses' || item.to === '/password-vault');
const patrimonioMenuItems = [
  ...patrimonioItems.filter((item) => item.to !== '/ip-addresses' && item.to !== '/password-vault'),
  ...cadastroItems.filter((item) => item.to === '/licenses'),
];
const cadastroMenuItems = cadastroItems.filter((item) => item.to !== '/licenses');

const adminItems: NavItem[] = [
  { to: '/management', label: 'Gestão', Icon: ClipboardCheck, color: 'text-blue-700 bg-blue-50 border-blue-100 hover:border-blue-200 hover:bg-blue-100', active: 'border-blue-600 bg-blue-700 text-white shadow-blue-200' },
  { to: '/users', label: 'Usuários', Icon: Users, color: 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-100 hover:border-fuchsia-200 hover:bg-fuchsia-100', active: 'border-fuchsia-500 bg-fuchsia-600 text-white shadow-fuchsia-200' },
  { to: '/audit', label: 'Auditoria', Icon: ShieldCheck, color: 'text-amber-700 bg-amber-50 border-amber-100 hover:border-amber-200 hover:bg-amber-100', active: 'border-amber-600 bg-amber-700 text-white shadow-amber-200' },
  { to: '/system-health', label: 'Saúde', Icon: Activity, color: 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:border-emerald-200 hover:bg-emerald-100', active: 'border-emerald-600 bg-emerald-700 text-white shadow-emerald-200' },
  { to: '/backup', label: 'Backup', Icon: DatabaseBackup, color: 'text-slate-700 bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100', active: 'border-slate-700 bg-slate-800 text-white shadow-slate-200' },
];

const navGroups: NavGroup[] = [
  { title: 'Atendimento', items: atendimentoItems },
  { title: 'Patrimônio', items: patrimonioMenuItems },
  { title: 'Rede e segurança', items: redeItems },
  { title: 'Cadastros', items: cadastroMenuItems },
];

let desktopNavScrollTop = 0;
let mobileNavScrollLeft = 0;

function SidebarButton({ item }: { item: NavItem }) {
  const { to, label, Icon } = item;

  return (
    <NavLink
      to={to}
      className={({ isActive }) => [
        'group flex min-h-10 items-center gap-3 rounded-xl border px-3 py-1.5 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200',
        isActive
          ? 'premium-nav-active text-white shadow-lg shadow-slate-900/15'
          : 'border-transparent bg-transparent text-slate-600 hover:border-blue-100 hover:bg-blue-50/70 hover:text-blue-900',
      ].join(' ')}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/90 text-slate-700 shadow-sm transition group-hover:bg-white group-hover:text-slate-950">
        <Icon size={17} />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function MobileButton({ item }: { item: NavItem }) {
  const { to, label, Icon } = item;

  return (
    <NavLink
      to={to}
      className={({ isActive }) => [
        'group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200',
        isActive ? 'premium-nav-active -translate-y-1 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950 hover:shadow-md',
      ].join(' ')}
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-slate-700 shadow-sm transition group-hover:bg-white group-hover:text-slate-950">
        <Icon size={16} />
      </span>
      {label}
    </NavLink>
  );
}

type AvatarPreset = 'ROBOT' | 'EMO' | 'NEXO' | 'PULSE' | 'BYTE';

function UserAvatar({ displayName, avatarUrl, uploading, onUpload, onSelectPreset, menuPlacement = 'down' }: {
  displayName: string;
  avatarUrl?: string | null;
  uploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectPreset: (preset: AvatarPreset) => void;
  menuPlacement?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !pickerRef.current) return;
    const updatePosition = () => {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 8;
      const viewportPadding = 8;
      const menuWidth = 240;
      const desiredHeight = 430;
      const above = rect.top - gap - viewportPadding;
      const below = window.innerHeight - rect.bottom - gap - viewportPadding;
      const preferBelow = menuPlacement === 'down';
      const useBelow = preferBelow
        ? below >= Math.min(desiredHeight, above) || below >= above
        : !(above >= Math.min(desiredHeight, below) || above >= below);
      const available = Math.max(120, useBelow ? below : above);
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );
      setMenuPosition({
        left,
        maxHeight: Math.min(desiredHeight, available),
        ...(useBelow
          ? { top: rect.bottom + gap }
          : { bottom: window.innerHeight - rect.top + gap }),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, menuPlacement]);

  return (
    <div ref={pickerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={uploading}
        className="group relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl shadow-md shadow-slate-900/15 focus:outline-none focus:ring-2 focus:ring-blue-300"
        title="Escolher avatar ou enviar foto"
        aria-label="Escolher avatar ou enviar foto"
        aria-expanded={open}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={`Avatar de ${displayName}`} className="h-full w-full object-cover" />
          : <span className="premium-user-avatar grid h-full w-full place-items-center text-white"><Bot size={22} aria-hidden="true" /></span>}
        <span className={`absolute inset-0 grid place-items-center bg-slate-950/55 text-white transition ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><Camera size={16} className={uploading ? 'animate-pulse' : ''} /></span>
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          style={menuPosition}
          className="fixed z-[100] w-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/20"
        >
          <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Escolher avatar</p>
          <button type="button" onClick={() => { onSelectPreset('ROBOT'); setOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            <span className="premium-user-avatar grid h-10 w-10 place-items-center rounded-xl text-white"><Bot size={21} /></span>
            Robô padrão
          </button>
          <button type="button" onClick={() => { onSelectPreset('EMO'); setOpen(false); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50">
            <img src="/avatar-robo-emo.png" alt="Robô EMO" className="h-10 w-10 rounded-xl object-cover" />
            Robô EMO
          </button>
          <button type="button" onClick={() => { onSelectPreset('NEXO'); setOpen(false); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50">
            <img src="/avatar-robo-nexo.png" alt="Robô NEXO" className="h-10 w-10 rounded-xl object-cover" />
            Robô NEXO
          </button>
          <button type="button" onClick={() => { onSelectPreset('PULSE'); setOpen(false); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-orange-50">
            <img src="/avatar-robo-pulse.png" alt="Robô PULSE" className="h-10 w-10 rounded-xl object-cover" />
            Robô PULSE
          </button>
          <button type="button" onClick={() => { onSelectPreset('BYTE'); setOpen(false); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-violet-50">
            <img src="/avatar-robo-byte.png" alt="Robô BYTE" className="h-10 w-10 rounded-xl object-cover" />
            Robô BYTE
          </button>
          <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500"><Camera size={19} /></span>
            Enviar minha foto
            <input type="file" accept="image/jpeg,image/png,image/gif,.jpg,.jpeg,.png,.gif" onChange={(event) => { onUpload(event); setOpen(false); }} disabled={uploading} className="sr-only" />
          </label>
        </div>,
        document.body,
      )}
    </div>
  );
}

function UserBlock({ displayName, roleLabel, avatarUrl, uploading, avatarError, onAvatarUpload, onSelectAvatar, onLogout }: { displayName: string; roleLabel: string; avatarUrl?: string | null; uploading: boolean; avatarError: string; onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => void; onSelectAvatar: (preset: AvatarPreset) => void; onLogout: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-900/5">
      <div className="flex items-center gap-3">
        <UserAvatar displayName={displayName} avatarUrl={avatarUrl} uploading={uploading} onUpload={onAvatarUpload} onSelectPreset={onSelectAvatar} menuPlacement="up" />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-slate-800">{displayName}</strong>
          <span className="text-xs font-medium text-slate-500">{uploading ? 'Enviando foto...' : roleLabel}</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-red-600 transition hover:bg-red-50"
          aria-label="Sair"
        >
          <LogOut size={18} />
        </button>
      </div>
      {avatarError && <p className="mt-2 text-xs font-medium text-red-600">{avatarError}</p>}
    </div>
  );
}

export function AppNav() {
  const navigate = useNavigate();
  const desktopNavRef = useRef<HTMLElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const { user, logout, loadUser } = useAuthStore();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const displayName = user?.name || user?.username || user?.email || 'Usuário logado';  
  const roleLabel = user?.role === 'ADMIN' ? 'Administrador' : user?.role === 'ATTENDANT' ? 'Atendente' : 'Usuário';
  const visibleGroups = user?.role === 'ADMIN' ? [...navGroups, { title: 'Administração', items: adminItems }] : navGroups;
  const mobileItems = visibleGroups.flatMap((group) => group.items);

  useLayoutEffect(() => {
    document.body.classList.add('app-sidebar-layout');
    return () => document.body.classList.remove('app-sidebar-layout');
  }, []);

  useLayoutEffect(() => {
    if (desktopNavRef.current) {
      desktopNavRef.current.scrollTop = desktopNavScrollTop;
    }

    if (mobileNavRef.current) {
      mobileNavRef.current.scrollLeft = mobileNavScrollLeft;
    }

    return () => {
      if (desktopNavRef.current) {
        desktopNavScrollTop = desktopNavRef.current.scrollTop;
      }

      if (mobileNavRef.current) {
        mobileNavScrollLeft = mobileNavRef.current.scrollLeft;
      }
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;
    if (!/\.(jpe?g|png|gif)$/i.test(file.name)) {
      setAvatarError('Selecione uma foto JPG, PNG ou GIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('A foto deve ter no máximo 5 MB.');
      return;
    }
    try {
      setUploadingAvatar(true);
      setAvatarError('');
      await userService.uploadAvatar(user.id, file);
      await loadUser();
    } catch (error) {
      setAvatarError(handleApiError(error));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarPreset = async (preset: AvatarPreset) => {
    if (!user) return;
    try {
      setUploadingAvatar(true);
      setAvatarError('');
      await userService.selectAvatar(user.id, preset);
      await loadUser();
    } catch (error) {
      setAvatarError(handleApiError(error));
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <>
      <aside className="premium-sidebar fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-200/80 bg-slate-50/95 shadow-2xl shadow-slate-950/10 backdrop-blur-xl xl:flex xl:flex-col">
        <div className="relative border-b border-slate-200/70 bg-white/80 px-5 py-4">
          <div className="premium-sidebar-accent absolute inset-x-0 top-0 h-1" />
          <BrandMark compact />
        </div>

        <nav
          ref={desktopNavRef}
          onScroll={(event) => {
            desktopNavScrollTop = event.currentTarget.scrollTop;
          }}
          className="flex-1 overflow-y-auto px-4 py-4"
          aria-label="Navegação principal"
        >
          <div className="space-y-4">
            {visibleGroups.map((group) => (
              <section key={group.title} className="space-y-2">
                <h2 className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{group.title}</h2>
                <div className="space-y-1">
                  {group.items.map((item) => <SidebarButton key={item.to} item={item} />)}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-4">
          <UserBlock displayName={displayName} roleLabel={roleLabel} avatarUrl={user?.avatarUrl} uploading={uploadingAvatar} avatarError={avatarError} onAvatarUpload={handleAvatarUpload} onSelectAvatar={handleAvatarPreset} onLogout={handleLogout} />
        </div>
      </aside>

      <header className="premium-topbar fixed left-72 right-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-white/60 bg-white/80 px-7 shadow-sm shadow-slate-950/5 backdrop-blur-xl xl:flex">
        <div>
          <p className="premium-accent-text text-[10px] font-bold uppercase tracking-[0.2em]">NEXXATI</p>
          <p className="text-sm font-semibold text-slate-700">Gestão integrada de ativos e chamados</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemePicker />
          <NotificationCenter />
          <UserAvatar displayName={displayName} avatarUrl={user?.avatarUrl} uploading={uploadingAvatar} onUpload={handleAvatarUpload} onSelectPreset={handleAvatarPreset} />
        </div>
      </header>

      <div className="mx-auto mb-6 max-w-[1500px] xl:hidden">
        <div className="mb-2 flex items-center justify-end gap-3 px-1">
          <ThemePicker />
          <NotificationCenter />
          <span className="text-right text-xs text-slate-500">
            <strong className="block max-w-[220px] truncate text-sm text-slate-700">{displayName}</strong>
            {roleLabel}
          </span>
          <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
            <LogOut size={17} /> Sair
          </button>
        </div>

        <nav className="rounded-2xl border border-white/70 bg-white/85 p-3 shadow-lg shadow-slate-900/5 backdrop-blur-xl" aria-label="Navegação principal">
          <div
            ref={mobileNavRef}
            onScroll={(event) => {
              mobileNavScrollLeft = event.currentTarget.scrollLeft;
            }}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {mobileItems.map((item) => <MobileButton key={item.to} item={item} />)}
          </div>
        </nav>
      </div>
    </>
  );
}
