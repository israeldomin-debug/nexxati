import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  History,
  Inbox,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
  UserRound,
  Users,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppNav } from '../components/AppNav'
import { PaginationControls } from '../components/PaginationControls'
import { ticketService } from '../services/ticket.service'
import { useAuthStore } from '../store/useAuthStore'
import { Ticket, TicketResolutionMetrics, TicketStatus } from '../types'
import {
  categoryLabels,
  priorityColors,
  priorityLabels,
  statusColors,
  statusLabels,
} from '../utils/ticketHelpers'
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort'

type TicketSortKey = 'id' | 'title' | 'category' | 'priority' | 'status' | 'createdAt'
type QueueFilter = 'all' | 'my-tickets' | 'assigned-to-me'
type TicketView = 'ACTIVE' | 'COMPLETED' | 'ALL'

const statusDotColors: Record<TicketStatus, string> = {
  OPEN: 'bg-emerald-500',
  IN_ANALYSIS: 'bg-blue-500',
  IN_PROGRESS: 'bg-violet-500',
  COMPLETED: 'bg-slate-400',
  CANCELLED: 'bg-red-500',
}

const priorityDotColors: Record<number, string> = {
  1: 'bg-blue-500',
  2: 'bg-amber-400',
  3: 'bg-orange-500',
  4: 'bg-red-600',
}

export const TicketList: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<QueueFilter>('all')
  const initialView = searchParams.get('view')
  const initialStatus = searchParams.get('status')
  const initialStatusGroup = searchParams.get('statusGroup')
  const [view, setView] = useState<TicketView>(
    initialView === 'COMPLETED' || initialView === 'ALL' ? initialView : 'ACTIVE',
  )
  const [status, setStatus] = useState<TicketStatus | undefined>(
    ['OPEN', 'IN_ANALYSIS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(initialStatus || '')
      ? initialStatus as TicketStatus
      : undefined,
  )
  const [statusGroup, setStatusGroup] = useState<'IN_PROGRESS' | undefined>(
    initialStatusGroup === 'IN_PROGRESS' ? 'IN_PROGRESS' : undefined,
  )
  const [sort, setSort] = useState<SortState<TicketSortKey>>({ key: 'createdAt', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [resolutionMetrics, setResolutionMetrics] = useState<TicketResolutionMetrics | null>(null)
  const canOpenTickets = user?.role === 'ADMIN' || user?.role === 'ATTENDANT'

  const loadTickets = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const filterParams: Record<string, unknown> = { view, page, limit: pageSize }
      if (status) filterParams.status = status
      if (statusGroup) filterParams.statusGroup = statusGroup
      if (filter === 'my-tickets') filterParams.createdByMe = true
      if (filter === 'assigned-to-me') filterParams.assignedToMe = true

      const response = await ticketService.list(filterParams)
      setTickets(response.tickets)
      setPagination(response.pagination)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar chamados')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [filter, view, status, statusGroup, page, pageSize])

  useEffect(() => {
    let active = true
    const loadResolutionMetrics = () => ticketService.resolutionMetrics()
      .then((metrics) => { if (active) setResolutionMetrics(metrics) })
      .catch(() => { if (active) setResolutionMetrics(null) })
    void loadResolutionMetrics()
    const timer = window.setInterval(loadResolutionMetrics, 120000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [filter, view, status, statusGroup, pageSize])

  const updateView = (nextView: TicketView) => {
    setView(nextView)
    setStatus(undefined)
    setStatusGroup(undefined)
    setSearchParams(nextView === 'ACTIVE' ? {} : { view: nextView })
  }

  const sortedTickets = useMemo(() => sortByDirection(tickets, sort.direction, (ticket) => {
    if (sort.key === 'category') return categoryLabels[ticket.category]
    if (sort.key === 'status') return statusLabels[ticket.status]
    return ticket[sort.key] || ''
  }), [tickets, sort])

  const pageStats = useMemo(() => ({
    urgent: tickets.filter((ticket) => ticket.priority === 4).length,
    progressing: tickets.filter((ticket) => ticket.status === 'IN_ANALYSIS' || ticket.status === 'IN_PROGRESS').length,
    unassigned: tickets.filter((ticket) => !ticket.assignedTo).length,
  }), [tickets])

  const detailedFilterLabel = status
    ? statusLabels[status]
    : statusGroup === 'IN_PROGRESS'
      ? 'Em análise ou progresso'
      : null

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const shortId = (id: string) => id.length > 10 ? id.slice(0, 8).toUpperCase() : id
  const formatResolutionTime = (hours: number) => {
    if (hours <= 0) return '< 1 min'
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
    if (hours < 24) return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
    return `${(hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`
  }

  return (
    <div className="min-h-screen bg-transparent p-4 sm:p-6">
      <AppNav />

      <main className="mx-auto max-w-[1500px] space-y-6">
        <section className="premium-hero relative overflow-hidden rounded-[1.75rem] px-6 py-7 text-white shadow-2xl shadow-slate-950/15 sm:px-8 lg:px-10">
          <div className="premium-hero-glow pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-8 hidden h-full w-64 items-center justify-center opacity-[0.08] lg:flex">
            <ClipboardList size={210} strokeWidth={1} />
          </div>

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-red-100 backdrop-blur">
                <Sparkles size={13} /> Central de atendimento
              </span>
              <h1 className="mt-5 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Chamados</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Acompanhe solicitações, prioridades e responsáveis em uma fila organizada para a equipe.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">Nesta visualização</p>
                <p className="mt-1 text-2xl font-bold">{isLoading ? '—' : pagination.total}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/tickets/new')}
                className="premium-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <Plus size={19} /> Novo chamado
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tempos de resolução dos chamados">
          {[
            { label: 'Chamados concluídos', value: resolutionMetrics?.completedCount ?? '—', helper: 'Base usada no cálculo', Icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Tempo médio', value: resolutionMetrics?.completedCount ? formatResolutionTime(resolutionMetrics.averageHours) : 'Sem dados', helper: 'Da abertura à conclusão', Icon: Timer, color: 'bg-amber-50 text-amber-700' },
            { label: 'Tempo mediano', value: resolutionMetrics?.completedCount ? formatResolutionTime(resolutionMetrics.medianHours) : 'Sem dados', helper: 'Menos afetado por casos longos', Icon: BarChart3, color: 'bg-blue-50 text-blue-700' },
            { label: 'Atendimento mais rápido', value: resolutionMetrics?.completedCount ? formatResolutionTime(resolutionMetrics.fastestHours) : 'Sem dados', helper: 'Entre os concluídos', Icon: Clock3, color: 'bg-violet-50 text-violet-700' },
          ].map(({ label, value, helper, Icon, color }) => (
            <article key={label} className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div><span className={`rounded-xl p-2.5 ${color}`}><Icon size={19} /></span></div>
              <p className="mt-2 text-xs text-slate-500">{helper}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[1.5rem] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur sm:p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-5">
              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <CircleDot size={15} className="premium-accent-text" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Situação</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'ACTIVE' as const, label: 'Em atendimento', Icon: Clock3 },
                    { value: 'COMPLETED' as const, label: 'Concluídos', Icon: CheckCircle2 },
                    ...(user?.role === 'ADMIN' ? [{ value: 'ALL' as const, label: 'Histórico completo', Icon: History }] : []),
                  ].map(({ value, label, Icon }) => {
                    const active = view === value && !status && !statusGroup
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateView(value)}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/15'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-950'
                        }`}
                      >
                        <Icon size={16} /> {label}
                      </button>
                    )
                  })}
                  {detailedFilterLabel && (
                    <button
                      type="button"
                      onClick={() => updateView('ACTIVE')}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-800"
                      title="Remover filtro recebido da dashboard"
                    >
                      <CircleDot size={15} /> {detailedFilterLabel} <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <ShieldCheck size={15} className="premium-accent-text" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Escopo da fila</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: user?.role === 'USER' ? 'Fila de chamados' : 'Toda a equipe', Icon: Users },
                    ...(user?.role !== 'USER'
                      ? [
                          { value: 'my-tickets' as const, label: 'Criados por mim', Icon: UserRound },
                          { value: 'assigned-to-me' as const, label: 'Atribuídos a mim', Icon: Inbox },
                        ]
                      : []),
                  ].map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                        filter === value
                          ? 'border-red-200 bg-red-50 text-red-800 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-800'
                      }`}
                    >
                      <Icon size={16} /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:w-[420px]">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Resumo desta página</p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: 'Em andamento', value: pageStats.progressing, color: 'text-violet-700 bg-violet-50' },
                  { label: 'Urgentes', value: pageStats.urgent, color: 'text-red-700 bg-red-50' },
                  { label: 'Sem responsável', value: pageStats.unassigned, color: 'text-amber-700 bg-amber-50' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className={`inline-flex rounded-lg px-2 py-1 text-lg font-bold ${item.color}`}>
                      {isLoading ? '—' : item.value}
                    </span>
                    <p className="mt-2 text-[10px] font-bold uppercase leading-4 tracking-wide text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-bold">Não foi possível carregar os chamados</p>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
            <button type="button" onClick={loadTickets} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">
              <RotateCcw size={16} /> Tentar novamente
            </button>
          </div>
        )}

        {!error && (
          <section className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="premium-accent-text text-[11px] font-bold uppercase tracking-[0.16em]">Fila de trabalho</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                  {view === 'COMPLETED' ? 'Chamados concluídos' : view === 'ALL' ? 'Histórico de chamados' : 'Chamados em atendimento'}
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                {isLoading ? 'Atualizando informações...' : `${pagination.total} chamado${pagination.total === 1 ? '' : 's'} encontrado${pagination.total === 1 ? '' : 's'}`}
              </p>
            </div>

            {isLoading ? (
              <div className="grid min-h-72 place-items-center p-8">
                <div className="text-center">
                  <span className="premium-accent-soft mx-auto grid h-14 w-14 place-items-center rounded-2xl">
                    <Loader2 className="animate-spin" size={25} />
                  </span>
                  <p className="mt-4 font-semibold text-slate-800">Organizando a fila de chamados</p>
                  <p className="mt-1 text-sm text-slate-500">Aguarde enquanto carregamos as informações.</p>
                </div>
              </div>
            ) : tickets.length === 0 ? (
              <div className="grid min-h-80 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                    <Inbox size={28} />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">Nenhum chamado nesta fila</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Altere os filtros ou registre uma nova solicitação para começar.</p>
                  <button type="button" onClick={() => navigate('/tickets/new')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                    <Plus size={17} /> Criar chamado
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full">
                    <thead className="border-b border-slate-200 bg-slate-50/80">
                      <tr>
                        {[
                          ['Código', 'id'],
                          ['Solicitação', 'title'],
                          ['Categoria', 'category'],
                          ['Prioridade', 'priority'],
                          ['Status', 'status'],
                          ['Criado em', 'createdAt'],
                          ['Ação', undefined],
                        ].map(([title, key]) => (
                          <SortableHeader
                            key={title}
                            label={title || ''}
                            sortKey={key as TicketSortKey | undefined}
                            current={sort}
                            onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))}
                            className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {sortedTickets.map((ticket) => (
                        <tr
                          key={ticket.id}
                          className={`group transition ${canOpenTickets ? 'cursor-pointer hover:bg-slate-50/80' : 'cursor-default'}`}
                          onClick={() => {
                            if (canOpenTickets) navigate(`/tickets/${ticket.id}`)
                          }}
                        >
                          <td className="whitespace-nowrap px-5 py-4">
                            <span title={`#${ticket.id}`} className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-600">
                              #{shortId(ticket.id)}
                            </span>
                          </td>
                          <td className="max-w-md px-5 py-4">
                            <p className="truncate font-semibold text-slate-900 transition group-hover:text-red-800">{ticket.title}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              Solicitado por <span className="font-medium text-slate-700">{ticket.createdBy.name}</span>
                              {ticket.computerUser ? ` · usuário: ${ticket.computerUser}` : ''}{ticket.deviceHostname ? ` · ${ticket.deviceHostname}` : ''}
                            </p>
                            {ticket.assignedTo && <p className="mt-1 truncate text-xs text-slate-400">Responsável: {ticket.assignedTo.name}</p>}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-600">{categoryLabels[ticket.category]}</td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-black/5 ${priorityColors[ticket.priority]}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${priorityDotColors[ticket.priority] || 'bg-slate-400'}`} />
                              {priorityLabels[ticket.priority]}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-black/5 ${statusColors[ticket.status]}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${statusDotColors[ticket.status]}`} />
                              {statusLabels[ticket.status]}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">{formatDate(ticket.createdAt)}</td>
                          <td className="whitespace-nowrap px-5 py-4">
                            {canOpenTickets ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  navigate(`/tickets/${ticket.id}`)
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-red-50 hover:text-red-800"
                              >
                                Abrir <ArrowRight size={15} />
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Restrito à TI</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-100 lg:hidden">
                  {sortedTickets.map((ticket) => (
                    <article
                      key={ticket.id}
                      className={`p-5 transition ${canOpenTickets ? 'cursor-pointer active:bg-slate-50' : ''}`}
                      onClick={() => {
                        if (canOpenTickets) navigate(`/tickets/${ticket.id}`)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[11px] font-bold text-slate-600">#{shortId(ticket.id)}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusColors[ticket.status]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDotColors[ticket.status]}`} />
                          {statusLabels[ticket.status]}
                        </span>
                      </div>
                      <h3 className="mt-4 font-bold leading-6 text-slate-900">{ticket.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">Solicitado por {ticket.createdBy.name}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{categoryLabels[ticket.category]}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${priorityColors[ticket.priority]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${priorityDotColors[ticket.priority] || 'bg-slate-400'}`} />
                          {priorityLabels[ticket.priority]}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span>{formatDate(ticket.createdAt)}</span>
                        {canOpenTickets && <span className="inline-flex items-center gap-1 font-bold text-red-800">Abrir <ArrowRight size={14} /></span>}
                      </div>
                    </article>
                  ))}
                </div>

                <PaginationControls
                  page={pagination.page}
                  pageSize={pagination.limit}
                  total={pagination.total}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="chamado"
                />
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
