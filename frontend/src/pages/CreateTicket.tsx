import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardEdit,
  FileText,
  ImagePlus,
  Laptop,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  UserRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppNav } from '../components/AppNav'
import { ticketService } from '../services/ticket.service'
import { assetService } from '../services/asset.service'
import { useAuthStore } from '../store/useAuthStore'
import { Asset, CreateTicketData } from '../types'
import { categories, priorities } from '../utils/ticketHelpers'

const getDefaultComputerUser = (user: ReturnType<typeof useAuthStore.getState>['user']) => {
  if (!user) return ''
  if (user.username) return user.username
  if (user.email) return user.email.split('@')[0]
  return user.name || ''
}

const inputClassName = 'premium-input mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400'

export const CreateTicket: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<File[]>([])
  const [deviceDetection, setDeviceDetection] = useState<'loading' | 'found' | 'not-found'>('loading')
  const [detectedAsset, setDetectedAsset] = useState<{ assetTag: string; name: string } | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [formData, setFormData] = useState<CreateTicketData>({
    title: '',
    description: '',
    category: 'TI',
    priority: 2,
    computerUser: getDefaultComputerUser(user),
    deviceHostname: '',
    deviceIp: '',
    sourceAgentId: null,
    assetId: null,
  })

  useEffect(() => {
    assetService.list({ page: 1, limit: 500, sortKey: 'name', sortDirection: 'asc' }).then((result) => setAssets(result.assets)).catch(() => setAssets([]))
  }, [])

  useEffect(() => {
    const defaultComputerUser = getDefaultComputerUser(user)
    if (!defaultComputerUser) return

    setFormData((current) => (
      current.computerUser
        ? current
        : { ...current, computerUser: defaultComputerUser }
    ))
  }, [user])

  useEffect(() => {
    let active = true
    ticketService.deviceContext()
      .then((context) => {
        if (!active) return
        if (!context.found) { setDeviceDetection('not-found'); return }
        setFormData((current) => ({
          ...current,
          computerUser: context.computerUser || current.computerUser,
          deviceHostname: context.hostname || current.deviceHostname,
          deviceIp: context.deviceIp || null,
          sourceAgentId: context.agentId || null,
          assetId: context.asset?.id || null,
        }))
        setDetectedAsset(context.asset || null)
        setDeviceDetection('found')
      })
      .catch(() => { if (active) setDeviceDetection('not-found') })
    return () => { active = false }
  }, [])

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    if (name === 'priority') {
      setFormData((current) => ({ ...current, priority: parseInt(value, 10) }))
      return
    }
    if (name === 'assetId') {
      setFormData((current) => ({ ...current, assetId: value || null }))
      return
    }
    setFormData((current) => ({ ...current, [name]: value }))
  }

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    const accepted = selected.filter((file) => (
      ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'].includes(file.type)
    ))
    setAttachments((current) => [...current, ...accepted].slice(0, 5))
    event.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setIsLoading(true)
      setError(null)
      const ticket = await ticketService.create(formData)
      if (attachments.length) {
        await Promise.all(attachments.map((file) => ticketService.uploadAttachment(ticket.id, file)))
      }
      navigate(user?.role === 'ADMIN' || user?.role === 'ATTENDANT' ? `/tickets/${ticket.id}` : '/tickets')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar chamado')
    } finally {
      setIsLoading(false)
    }
  }

  const priorityLabel = priorities.find((item) => item.value === formData.priority)?.label || 'Média'

  return (
    <div className="min-h-screen bg-transparent p-4 sm:p-6">
      <AppNav />

      <main className="mx-auto max-w-[1250px] space-y-6">
        <section className="premium-hero relative overflow-hidden rounded-[1.75rem] px-6 py-7 text-white shadow-2xl shadow-slate-950/15 sm:px-8 lg:px-10">
          <div className="premium-hero-glow pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full opacity-20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-8 hidden h-full w-72 items-center justify-center opacity-[0.07] lg:flex">
            <ClipboardEdit size={220} strokeWidth={1} />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <button
                type="button"
                onClick={() => navigate('/tickets')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/15 hover:text-white"
              >
                <ArrowLeft size={15} /> Voltar para chamados
              </button>
              <span className="mt-6 flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-red-100 backdrop-blur">
                <Sparkles size={13} /> Nova solicitação
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Abrir novo chamado</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Conte o que aconteceu e inclua os detalhes necessários para agilizar o atendimento.
              </p>
            </div>

            <div className="grid max-w-md grid-cols-3 gap-2">
              {[
                { value: '1', label: 'Descreva' },
                { value: '2', label: 'Classifique' },
                { value: '3', label: 'Envie' },
              ].map((step) => (
                <div key={step.value} className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 backdrop-blur">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15 text-[11px] font-bold">{step.value}</span>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-300">{step.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
            <AlertCircle className="mt-0.5 shrink-0" size={20} />
            <div>
              <p className="font-bold">Não foi possível criar o chamado</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <p className="premium-accent-text text-[11px] font-bold uppercase tracking-[0.16em]">Dados do chamado</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Conte como podemos ajudar</h2>
              <p className="mt-1 text-sm text-slate-500">Os campos marcados com * são obrigatórios.</p>
            </div>

            <div className="space-y-7 p-5 sm:p-7">
              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="premium-accent-soft grid h-10 w-10 place-items-center rounded-xl">
                    <FileText size={19} />
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-900">Sobre o problema</h3>
                    <p className="text-xs text-slate-500">Use um título curto e uma descrição detalhada.</p>
                  </div>
                </div>

                <label htmlFor="title" className="block text-sm font-semibold text-slate-700">
                  Título *
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    maxLength={200}
                    placeholder="Ex.: Computador não liga"
                    className={inputClassName}
                  />
                  <span className="mt-1.5 block text-right text-[11px] font-normal text-slate-400">{formData.title.length}/200</span>
                </label>

                <label htmlFor="description" className="block text-sm font-semibold text-slate-700">
                  Descrição *
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    rows={7}
                    placeholder="Descreva o que aconteceu, quando começou e quais mensagens aparecem..."
                    className={`${inputClassName} resize-y leading-6`}
                  />
                </label>
              </section>

              <div className="h-px bg-slate-100" />

              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                    <Laptop size={19} />
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-900">Identificação e classificação</h3>
                    <p className="text-xs text-slate-500">Ajude a direcionar o chamado para o atendimento correto.</p>
                  </div>
                </div>

                <div className={`rounded-2xl border px-4 py-3 text-sm ${deviceDetection === 'found' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : deviceDetection === 'loading' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="flex items-center gap-2 font-bold">
                    {deviceDetection === 'loading' ? <Loader2 size={17} className="animate-spin" /> : deviceDetection === 'found' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
                    {deviceDetection === 'loading' ? 'Identificando esta máquina pelo agente...' : deviceDetection === 'found' ? 'Máquina identificada automaticamente' : 'Agente desta máquina não foi localizado'}
                  </div>
                  <p className="mt-1 text-xs leading-5">
                    {deviceDetection === 'found'
                      ? `${formData.deviceHostname || 'Hostname não informado'}${formData.deviceIp ? ` · ${formData.deviceIp}` : ''}${detectedAsset ? ` · ${detectedAsset.assetTag} — ${detectedAsset.name}` : ''}`
                      : 'Você ainda pode informar manualmente o usuário do Windows e o hostname.'}
                  </p>
                  <p className="mt-1 text-xs">Solicitante autenticado: <b>{user?.name || user?.username || user?.email || 'Usuário atual'}</b></p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor="computerUser" className="block text-sm font-semibold text-slate-700">
                  Usuário logado no Windows *
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute bottom-3.5 left-4 text-slate-400" size={17} />
                    <input
                      type="text"
                      id="computerUser"
                      name="computerUser"
                      value={formData.computerUser || ''}
                      onChange={handleChange}
                      required
                      maxLength={120}
                      placeholder="Digite o usuário logado no Windows"
                      className={`${inputClassName} pl-11`}
                    />
                  </div>
                  <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
                    Informe o usuário da máquina onde o problema está acontecendo.
                  </span>
                </label>

                <label htmlFor="deviceHostname" className="block text-sm font-semibold text-slate-700">
                  Hostname do dispositivo
                  <div className="relative">
                    <Laptop className="pointer-events-none absolute bottom-3.5 left-4 text-slate-400" size={17} />
                    <input
                      type="text"
                      id="deviceHostname"
                      name="deviceHostname"
                      value={formData.deviceHostname || ''}
                      onChange={handleChange}
                      maxLength={255}
                      placeholder="Ex.: GEO_014"
                      className={`${inputClassName} pl-11`}
                    />
                  </div>
                  <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
                    Preenchido automaticamente quando o agente for identificado.
                  </span>
                </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="assetId" className="block text-sm font-semibold text-slate-700 sm:col-span-2">Ativo relacionado<select id="assetId" name="assetId" value={formData.assetId || ''} onChange={handleChange} className={inputClassName}><option value="">Sem ativo relacionado</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetTag} · {asset.name}{asset.hostname ? ` · ${asset.hostname}` : ''}</option>)}</select><span className="mt-1.5 block text-xs font-normal text-slate-500">O agente preenche automaticamente; você pode corrigir ou selecionar outro ativo.</span></label>
                  <label htmlFor="category" className="block text-sm font-semibold text-slate-700">
                    Categoria *
                    <div className="relative">
                      <Tag className="pointer-events-none absolute bottom-3.5 left-4 text-slate-400" size={17} />
                      <select
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        required
                        className={`${inputClassName} appearance-none pl-11`}
                      >
                        {categories.map((category) => (
                          <option key={category.value} value={category.value}>{category.label}</option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label htmlFor="priority" className="block text-sm font-semibold text-slate-700">
                    Prioridade *
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      required
                      className={`${inputClassName} appearance-none`}
                    >
                      {priorities.map((priority) => (
                        <option key={priority.value} value={priority.value}>{priority.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <div className="h-px bg-slate-100" />

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <ImagePlus size={19} />
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-900">Evidências e anexos</h3>
                    <p className="text-xs text-slate-500">Imagens do erro ajudam a identificar o problema mais rapidamente.</p>
                  </div>
                </div>

                <label
                  htmlFor="attachments"
                  className="group flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-center transition hover:border-red-300 hover:bg-red-50/40"
                >
                  <span className="premium-accent-text grid h-11 w-11 place-items-center rounded-xl bg-white shadow-sm transition group-hover:-translate-y-0.5">
                    <UploadCloud size={21} />
                  </span>
                  <span className="mt-3 text-sm font-bold text-slate-800">Clique para escolher os arquivos</span>
                  <span className="mt-1 text-xs text-slate-500">JPG, PNG, GIF ou PDF · até 5 arquivos</span>
                  <span className="mt-2 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">
                    {attachments.length}/5 selecionados
                  </span>
                  <input
                    id="attachments"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,application/pdf"
                    multiple
                    onChange={handleFiles}
                    className="sr-only"
                  />
                </label>

                {attachments.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {attachments.map((file, index) => {
                      const isImage = file.type.startsWith('image/')
                      const previewUrl = isImage ? URL.createObjectURL(file) : ''
                      return (
                        <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          {isImage ? (
                            <img
                              src={previewUrl}
                              alt={file.name}
                              className="h-12 w-12 rounded-xl object-cover"
                              onLoad={() => URL.revokeObjectURL(previewUrl)}
                            />
                          ) : (
                            <span className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-[11px] font-bold text-red-700">PDF</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-red-600 transition hover:bg-red-50"
                            aria-label={`Remover ${file.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-5 sm:flex-row sm:justify-end sm:px-7">
              <button
                type="button"
                onClick={() => navigate('/tickets')}
                disabled={isLoading}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:min-w-36"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="premium-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-48"
              >
                {isLoading ? <><Loader2 className="animate-spin" size={18} /> Criando chamado...</> : <><Send size={18} /> Criar chamado</>}
              </button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-[1.5rem] border border-white/80 bg-white/95 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Lightbulb size={19} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Antes de enviar</p>
                  <h2 className="font-bold text-slate-900">Ajude-nos a resolver mais rápido</h2>
                </div>
              </div>
              <ul className="mt-5 space-y-4">
                {[
                  'Informe mensagens de erro exatamente como aparecem.',
                  'Conte quando o problema começou e se ele acontece sempre.',
                  'Anexe uma imagem quando houver algo visível na tela.',
                ].map((tip) => (
                  <li key={tip} className="flex gap-3 text-sm leading-6 text-slate-600">
                    <CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={16} />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900 p-5 text-white shadow-xl shadow-slate-950/10">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck size={17} />
                <p className="text-[10px] font-bold uppercase tracking-[0.15em]">Resumo do chamado</p>
              </div>
              <dl className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <dt className="text-xs text-slate-400">Categoria</dt>
                  <dd className="max-w-[170px] truncate text-sm font-bold">{categories.find((item) => item.value === formData.category)?.label}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <dt className="text-xs text-slate-400">Prioridade</dt>
                  <dd className="inline-flex items-center gap-2 text-sm font-bold">
                    <span className={`h-2 w-2 rounded-full ${formData.priority === 4 ? 'bg-red-500' : formData.priority === 3 ? 'bg-orange-500' : formData.priority === 2 ? 'bg-amber-400' : 'bg-blue-400'}`} />
                    {priorityLabel}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-slate-400">Anexos</dt>
                  <dd className="inline-flex items-center gap-2 text-sm font-bold"><Paperclip size={14} /> {attachments.length}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </form>
      </main>
    </div>
  )
}
