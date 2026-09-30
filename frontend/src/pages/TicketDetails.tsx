import { AppNav } from '../components/AppNav'
import { PremiumPageHeader, premiumHeaderPrimaryAction, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader'
import { ClipboardList } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ticketService } from '../services/ticket.service'
import { TicketDetail } from '../types'
import { useAuthStore } from '../store/useAuthStore'
import { FileUpload, AttachmentList } from '../components/FileUpload'
import { 
  priorityColors, 
  priorityLabels, 
  statusColors, 
  statusLabels, 
  categoryLabels 
} from '../utils/ticketHelpers'

export const TicketDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentMessage, setCommentMessage] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    loadTicket()
  }, [id])

  const loadTicket = async () => {
    if (!id) return

    try {
      setIsLoading(true)
      setError(null)
      const data = await ticketService.getById(id)
      setTicket(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar ticket')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (startDate: string, endDate: string) => {
    const diffMinutes = Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 60000))
    if (diffMinutes < 60) return `${Math.max(1, diffMinutes)} min`
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    if (hours < 24) return minutes ? `${hours}h ${minutes}min` : `${hours}h`
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
  }

  const canEdit = () => {
    if (!ticket || !user) return false
    return (
      user.role === 'ADMIN' ||
      user.role === 'ATTENDANT' ||
      (user.id === ticket.createdById && ticket.status === 'OPEN')
    )
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !commentMessage.trim()) return

    try {
      setIsSubmittingComment(true)
      setCommentError(null)
      await ticketService.addComment(id, commentMessage.trim())
      setCommentMessage('')
      await loadTicket() // Recarrega ticket com novo comentário
    } catch (err: any) {
      setCommentError(err.response?.data?.error || 'Erro ao adicionar comentário')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleUploadFile = async (file: File) => {
    if (!id) return

    try {
      setIsUploadingFile(true)
      await ticketService.uploadAttachment(id, file)
      await loadTicket() // Recarrega ticket com novo anexo
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Erro ao enviar arquivo')
    } finally {
      setIsUploadingFile(false)
    }
  }

  const handleDownloadAttachment = async (filename: string) => {
    if (!id) return
    try {
      await ticketService.downloadAttachment(id, filename)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao baixar arquivo')
    }
  }

  const handleDeleteAttachment = async (filename: string) => {
    if (!id) return
    if (!window.confirm('Tem certeza que deseja remover este anexo?')) return

    try {
      await ticketService.deleteAttachment(id, filename)
      await loadTicket() // Recarrega ticket sem o anexo
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao remover anexo')
    }
  }

  const canManageAttachments = () => {
    if (!ticket || !user) return false
    return (
      user.role === 'ADMIN' ||
      user.role === 'ATTENDANT' ||
      user.id === ticket.createdById
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Carregando ticket...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <AppNav />
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || 'Ticket não encontrado'}
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

  const completedHistory = ticket.history
    ?.filter((item) => item.newStatus === 'COMPLETED')
    .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())[0]
  const completedAt = completedHistory?.changedAt || (ticket.status === 'COMPLETED' ? ticket.updatedAt : null)
  const resolutionTime = completedAt ? formatDuration(ticket.createdAt, completedAt) : null

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <AppNav />
      <div className="max-w-4xl mx-auto">
        <PremiumPageHeader eyebrow="Atendimento" title={`Chamado #${ticket.id}`} description={ticket.title} icon={ClipboardList} actions={<><button onClick={() => navigate('/tickets')} className={premiumHeaderSecondaryAction}>← Voltar para lista</button>{canEdit() && <button onClick={() => navigate(`/tickets/${ticket.id}/edit`)} className={premiumHeaderPrimaryAction}>Editar</button>}</>} />

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          {/* Status and Priority */}
          <div className="flex gap-4 mb-6">
            <div>
              <span className="text-sm text-gray-500 block mb-1">Status</span>
              <span
                className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                  statusColors[ticket.status]
                }`}
              >
                {statusLabels[ticket.status]}
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-500 block mb-1">Prioridade</span>
              <span
                className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                  priorityColors[ticket.priority]
                }`}
              >
                {priorityLabels[ticket.priority]}
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-500 block mb-1">Categoria</span>
              <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-gray-100 text-gray-800">
                {categoryLabels[ticket.category]}
              </span>
            </div>
            {ticket.computerUser && (
              <div>
                <span className="text-sm text-gray-500 block mb-1">Usuário da máquina</span>
                <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-blue-50 text-blue-800">
                  {ticket.computerUser}
                </span>
              </div>
            )}
            {ticket.deviceHostname && (
              <div>
                <span className="text-sm text-gray-500 block mb-1">Dispositivo</span>
                <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-violet-50 text-violet-800">
                  {ticket.deviceHostname}{ticket.deviceIp ? ` · ${ticket.deviceIp}` : ''}
                </span>
              </div>
            )}
            {ticket.asset && (
              <div>
                <span className="text-sm text-gray-500 block mb-1">Ativo vinculado</span>
                <a href={`/assets?search=${encodeURIComponent(ticket.asset.assetTag)}`} className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
                  {ticket.asset.assetTag} · {ticket.asset.name}
                </a>
              </div>
            )}
            {ticket.dueAt && (
              <div>
                <span className="text-sm text-gray-500 block mb-1">Prazo de atendimento</span>
                <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${!ticket.resolvedAt && new Date(ticket.dueAt) < new Date() ? 'bg-red-50 text-red-800' : 'bg-sky-50 text-sky-800'}`}>
                  {formatDate(ticket.dueAt)}{!ticket.resolvedAt && new Date(ticket.dueAt) < new Date() ? ' · Atrasado' : ''}
                </span>
              </div>
            )}
            {resolutionTime && (
              <div>
                <span className="text-sm text-gray-500 block mb-1">Tempo de resolução</span>
                <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-amber-50 text-amber-800">
                  {resolutionTime}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Descrição</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-200">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Criado por</h3>
              <p className="text-gray-900">{ticket.createdBy.name}</p>
              <p className="text-sm text-gray-500">{ticket.createdBy.email}</p>
              <p className="text-xs text-gray-400 mt-1">{formatDate(ticket.createdAt)}</p>
            </div>

            {ticket.assignedTo && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Atribuído para</h3>
                <p className="text-gray-900">{ticket.assignedTo.name}</p>
                <p className="text-sm text-gray-500">{ticket.assignedTo.email}</p>
              </div>
            )}

            {!ticket.assignedTo && (user?.role === 'ATTENDANT' || user?.role === 'ADMIN') && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Atribuído para</h3>
                <p className="text-sm text-gray-400 italic">Nenhum atendente atribuído</p>
              </div>
            )}
          </div>

          {ticket.updatedAt !== ticket.createdAt && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400">
                Última atualização: {formatDate(ticket.updatedAt)}
              </p>
            </div>
          )}
        </div>

        {/* Attachments Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Anexos ({ticket.attachments?.length || 0})
          </h2>

          {/* Upload Area */}
          {canManageAttachments() && (
            <div className="mb-6">
              <FileUpload 
                onUpload={handleUploadFile}
                isUploading={isUploadingFile}
              />
            </div>
          )}

          {/* Attachments List */}
          <AttachmentList
            attachments={(ticket.attachments || []).map(filename => ({ filename }))}
            onDownload={handleDownloadAttachment}
            onDelete={canManageAttachments() ? handleDeleteAttachment : undefined}
            getPreviewUrl={(filename) => ticketService.getAttachmentObjectUrl(ticket.id, filename)}
            onPreviewImage={(url, name) => setImagePreview({ url, name })}
            canDelete={canManageAttachments()}
          />
        </div>

        {/* Comments Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Comentários ({ticket.comments?.length || 0})
          </h2>

          {/* Comment Form */}
          <form onSubmit={handleSubmitComment} className="mb-6">
            <div className="mb-2">
              <textarea
                value={commentMessage}
                onChange={(e) => setCommentMessage(e.target.value)}
                placeholder="Adicione um comentário..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                disabled={isSubmittingComment}
              />
            </div>
            {commentError && (
              <div className="mb-2 text-sm text-red-600">{commentError}</div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingComment || !commentMessage.trim()}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingComment ? 'Enviando...' : 'Adicionar Comentário'}
              </button>
            </div>
          </form>

          {/* Comments List */}
          <div className="space-y-4">
            {ticket.comments && ticket.comments.length > 0 ? (
              ticket.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{comment.user.name}</p>
                      <p className="text-sm text-gray-500">{comment.user.email}</p>
                    </div>
                    <p className="text-xs text-gray-400">{formatDate(comment.createdAt)}</p>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap mt-2">{comment.message}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">
                Nenhum comentário ainda. Seja o primeiro a comentar!
              </p>
            )}
          </div>
        </div>
      </div>
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true">
          <button className="absolute inset-0" onClick={() => setImagePreview(null)} aria-label="Fechar visualização" />
          <div className="relative max-h-[92vh] max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="truncate pr-4 text-sm font-semibold text-slate-800">{imagePreview.name}</p>
              <button onClick={() => setImagePreview(null)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Fechar</button>
            </div>
            <div className="max-h-[82vh] overflow-auto bg-slate-100 p-3">
              <img src={imagePreview.url} alt={imagePreview.name} className="mx-auto max-h-[78vh] max-w-full rounded-lg object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
