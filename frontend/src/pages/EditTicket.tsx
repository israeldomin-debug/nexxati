import { AppNav } from '../components/AppNav'
import { PremiumPageHeader, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader'
import { PencilLine } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ticketService } from '../services/ticket.service'
import { userService } from '../services/user.service'
import { assetService } from '../services/asset.service'
import { Asset, TicketDetail, UpdateTicketData, User, TicketStatus } from '../types'
import { useAuthStore } from '../store/useAuthStore'
import { categories } from '../utils/ticketHelpers'

const priorities = [
  { value: 1, label: 'Baixa' },
  { value: 2, label: 'Média' },
  { value: 3, label: 'Alta' },
  { value: 4, label: 'Urgente' },
]

const statuses: { value: TicketStatus; label: string }[] = [
  { value: 'OPEN', label: 'Aberto' },
  { value: 'IN_ANALYSIS', label: 'Em Análise' },
  { value: 'IN_PROGRESS', label: 'Em Progresso' },
  { value: 'COMPLETED', label: 'Concluído' },
]

export const EditTicket: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [attendants, setAttendants] = useState<User[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  
  const [formData, setFormData] = useState<UpdateTicketData>({
    title: '',
    description: '',
    category: 'TI',
    priority: 2,
    status: 'OPEN',
  })

  useEffect(() => {
    loadData()
  }, [id])


  const loadData = async () => {
    if (!id) return

    try {
      setIsLoading(true)
      setError(null)
      
      const ticketData = await ticketService.getById(id)
      const assetData = await assetService.list({ page: 1, limit: 500, sortKey: 'name', sortDirection: 'asc' })
      setAssets(assetData.assets)
      setTicket(ticketData)
      
      setFormData({
        title: ticketData.title,
        description: ticketData.description,
        category: ticketData.category,
        priority: ticketData.priority,
        computerUser: ticketData.computerUser || '',
        deviceHostname: ticketData.deviceHostname || '',
        deviceIp: ticketData.deviceIp || '',
        sourceAgentId: ticketData.sourceAgentId || null,
        assetId: ticketData.assetId || null,
        status: ticketData.status,
        assignedToId: ticketData.assignedToId || undefined,
      })

      // Load attendants if user is admin or attendant
      if (user?.role === 'ADMIN' || user?.role === 'ATTENDANT') {
        const users = await userService.getAllUsers()
        const attendantUsers = users.filter(
          (u) => u.role === 'ATTENDANT' || u.role === 'ADMIN'
        )
        setAttendants(attendantUsers)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar ticket')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    
    if (name === 'assignedToId') {
      setFormData((prev) => ({
        ...prev,
        assignedToId: value ? value : undefined,
      }))
    } else if (name === 'assetId') {
      setFormData((prev) => ({ ...prev, assetId: value || null }))
    } else if (name === 'priority') {
      setFormData((prev) => ({ ...prev, priority: parseInt(value) }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!id) return

    try {
      setIsSaving(true)
      setError(null)
      
      await ticketService.update(id, formData)
      navigate(`/tickets/${id}`)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar ticket')
    } finally {
      setIsSaving(false)
    }
  }

  const canEdit = () => {
    if (!ticket || !user) return false
    return (
      user.role === 'ADMIN' ||
      user.role === 'ATTENDANT' ||
      (user.id === ticket.createdById && ticket.status === 'OPEN')
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <AppNav />
        <div className="max-w-3xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Carregando ticket...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !ticket || !canEdit()) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || 'Você não tem permissão para editar este ticket'}
          </div>
          <button
            onClick={() => navigate('/tickets')}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            ← Voltar para lista
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <AppNav />
      <div className="max-w-3xl mx-auto">
        <PremiumPageHeader eyebrow="Atendimento" title={`Editar chamado #${ticket.id}`} description="Atualize as informações do chamado." icon={PencilLine} actions={<button onClick={() => navigate(`/tickets/${id}`)} className={premiumHeaderSecondaryAction}>← Voltar aos detalhes</button>} />

        {/* Form */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Título */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Título *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                maxLength={200}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Descrição */}
            <div>
              <label htmlFor="computerUser" className="block text-sm font-medium text-gray-700 mb-2">
                Usuário da máquina
              </label>
              <input
                type="text"
                id="computerUser"
                name="computerUser"
                value={formData.computerUser || ''}
                onChange={handleChange}
                required
                maxLength={120}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="deviceHostname" className="mb-2 block text-sm font-medium text-gray-700">Hostname do dispositivo</label>
                <input type="text" id="deviceHostname" name="deviceHostname" value={formData.deviceHostname || ''} onChange={handleChange} maxLength={255} className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label htmlFor="deviceIp" className="mb-2 block text-sm font-medium text-gray-700">IP identificado</label>
                <input type="text" id="deviceIp" name="deviceIp" value={formData.deviceIp || ''} onChange={handleChange} maxLength={64} className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div><label htmlFor="assetId" className="mb-2 block text-sm font-medium text-gray-700">Ativo relacionado</label><select id="assetId" name="assetId" value={formData.assetId || ''} onChange={handleChange} className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500"><option value="">Sem ativo relacionado</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetTag} · {asset.name}{asset.hostname ? ` · ${asset.hostname}` : ''}</option>)}</select></div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Descrição *
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Categoria e Prioridade */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Categoria */}
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Categoria *
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prioridade */}
              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                  Prioridade *
                </label>
                <select
                  id="priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {priorities.map((pri) => (
                    <option key={pri.value} value={pri.value}>
                      {pri.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status e Atribuição (só para admin/atendente) */}
            {(user?.role === 'ADMIN' || user?.role === 'ATTENDANT') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Status */}
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                    Status *
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {statuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Atribuir para */}
                <div>
                  <label htmlFor="assignedToId" className="block text-sm font-medium text-gray-700 mb-2">
                    Atribuir para
                  </label>
                  <select
                    id="assignedToId"
                    name="assignedToId"
                    value={formData.assignedToId || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Nenhum atendente</option>
                    {attendants.map((attendant) => (
                      <option key={attendant.id} value={attendant.id}>
                        {attendant.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate(`/tickets/${id}`)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
