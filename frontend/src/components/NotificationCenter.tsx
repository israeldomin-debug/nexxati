import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, ClipboardList, X } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import { useAuthStore } from '../store/useAuthStore';
import { NotificationEvent, NotificationEventType } from '../types';
import { branding } from '../config/branding';

type NoticeKind = 'ticket' | 'system';

interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  message: string;
  createdAt: string;
  link?: string;
}

const POLL_INTERVAL_MS = 30000;

const noticeStyles: Record<NoticeKind, string> = {
  ticket: 'border-blue-200 bg-blue-50 text-blue-900',
  system: 'border-slate-200 bg-white text-slate-900',
};

const noticeIcons = {
  ticket: ClipboardList,
  system: CheckCircle2,
};

const eventKind: Record<NotificationEventType, NoticeKind> = {
  TICKET_CREATED: 'ticket',
  TICKET_STATUS: 'ticket',
  TICKET_COMMENT: 'ticket',
};

const ticketEventTypes = new Set<NotificationEventType>(['TICKET_CREATED', 'TICKET_STATUS', 'TICKET_COMMENT']);

const toNotice = (event: NotificationEvent): Notice => ({
  id: event.id,
  kind: eventKind[event.type] || 'system',
  title: event.title,
  message: event.message,
  createdAt: event.occurredAt,
  link: event.link,
});

export function NotificationCenter() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef(false);

  const cursorKey = useMemo(() => `geocal-notifications-cursor:${user?.id || 'anonymous'}`, [user?.id]);
  const unread = notices.length;

  const showBrowserNotification = useCallback((notice: Notice) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(notice.title, {
      body: notice.message,
      icon: branding.iconUrl,
      tag: notice.id,
    });
  }, []);

  const pushNotices = useCallback((nextNotices: Notice[]) => {
    if (!nextNotices.length) return;

    setNotices((current) => {
      const known = new Set(current.map((item) => item.id));
      const fresh = nextNotices.filter((item) => !known.has(item.id));
      return [...fresh, ...current].slice(0, 20);
    });

    setToasts((current) => [...nextNotices, ...current].slice(0, 4));
    nextNotices.slice(0, 3).forEach(showBrowserNotification);

    nextNotices.forEach((notice) => {
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== notice.id));
      }, 8000);
    });
  }, [showBrowserNotification]);

  const addSystemNotice = useCallback((notice: Omit<Notice, 'id' | 'createdAt' | 'kind'>) => {
    const fullNotice: Notice = {
      ...notice,
      id: `system-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: 'system',
      createdAt: new Date().toISOString(),
    };
    pushNotices([fullNotice]);
  }, [pushNotices]);

  const poll = useCallback(async () => {
    if (!user || pollingRef.current) return;
    pollingRef.current = true;

    try {
      const cursor = window.localStorage.getItem(cursorKey) || undefined;
      const response = await notificationService.recent(cursor, 20);
      window.localStorage.setItem(cursorKey, response.serverTime);

      if (cursor) {
        pushNotices(response.events.filter((event) => ticketEventTypes.has(event.type)).map(toNotice));
      }
    } catch {
      // Evita incomodar o usuário quando houver oscilação de rede ou sessão expirada.
    } finally {
      pollingRef.current = false;
    }
  }, [cursorKey, pushNotices, user]);

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      addSystemNotice({
        title: 'Notificação indisponível',
        message: 'Este navegador não suporta notificações do sistema.',
      });
      return;
    }

    const permission = await Notification.requestPermission();
    addSystemNotice({
      title: permission === 'granted' ? 'Notificações ativadas' : 'Notificações não ativadas',
      message: permission === 'granted'
        ? 'Quando houver atualizações, o Windows/navegador também poderá avisar.'
        : 'Os balões dentro do sistema continuam funcionando normalmente.',
    });
  };

  const openNotice = (notice: Notice) => {
    if (notice.link) {
      setOpen(false);
      navigate(notice.link);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex items-center justify-center rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
        aria-label="Notificações"
      >
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Notificações</p>
              <p className="text-xs text-slate-500">Atualiza automaticamente a cada 30 segundos</p>
            </div>
            {notices.length > 0 && <button type="button" onClick={() => setNotices([])} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Limpar</button>}
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-2">
            {notices.length ? notices.map((notice) => {
              const Icon = noticeIcons[notice.kind];
              return (
                <button
                  key={notice.id}
                  type="button"
                  onClick={() => openNotice(notice)}
                  className={`w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 ${notice.link ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex gap-3">
                    <Icon size={18} className="mt-0.5 text-blue-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                      <p className="text-xs text-slate-600">{notice.message}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{new Date(notice.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                </button>
              );
            }) : <p className="px-3 py-8 text-center text-sm text-slate-500">Nenhuma notificação nova.</p>}
          </div>
          <div className="border-t border-slate-100 p-2">
            <button type="button" onClick={requestBrowserNotifications} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              Ativar notificações do Windows/navegador
            </button>
          </div>
        </div>
      )}

      <div className="fixed right-4 top-4 z-[80] space-y-3">
        {toasts.map((notice) => {
          const Icon = noticeIcons[notice.kind];
          return (
            <div key={notice.id} className={`w-80 rounded-xl border p-4 shadow-xl backdrop-blur ${noticeStyles[notice.kind]}`}>
              <div className="flex gap-3">
                <button type="button" onClick={() => openNotice(notice)} className="flex min-w-0 flex-1 gap-3 text-left">
                  <Icon size={20} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{notice.title}</p>
                    <p className="mt-1 text-xs opacity-85">{notice.message}</p>
                  </div>
                </button>
                <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== notice.id))} className="rounded-md p-1 opacity-60 hover:bg-white/60 hover:opacity-100" aria-label="Fechar notificação">
                  <X size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
