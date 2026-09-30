import { AppNav } from '../components/AppNav'
import { PremiumPageHeader, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader'
import { UserCog } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { userService, UpdateUserData } from '../services/user.service'
import { User, UserPermission } from '../types'
import { useAuthStore } from '../store/useAuthStore'
import { UserPermissionsField } from '../components/UserPermissionsField'

const roleOptions = [
  { value: 'USER', label: 'Usuário' },
  { value: 'ATTENDANT', label: 'Atendente' },
  { value: 'ADMIN', label: 'Administrador' },
]

export const EditUser: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuthStore()
  const [user, setUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<UpdateUserData>({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'USER',
    active: true,
    mustChangePassword: false,
    permissions: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      navigate('/users')
      return
    }

    loadUser()
  }, [id])

  const loadUser = async () => {
    if (!id) return

    try {
      setIsLoading(true)
      setError(null)
      const data = await userService.getUserById(id)
      setUser(data)
      setFormData({
        name: data.name,
        username: data.username || '',
        email: data.email,
        password: '',
        role: data.role,
        active: data.active,
        mustChangePassword: data.mustChangePassword,
        permissions: data.permissions || [],
      })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar usuário')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const handlePermissionsChange = (permissions: UserPermission[]) => {
    setFormData((prev) => ({ ...prev, permissions }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!id) return

    try {
      setIsSubmitting(true)
      setError(null)

      // Remove senha se estiver vazia
      const dataToSend = { ...formData }
      if (!dataToSend.password) {
        delete dataToSend.password
      }

      await userService.update(id, dataToSend)
      navigate('/users')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <AppNav />
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Carregando usuário...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
          <button
            onClick={() => navigate('/users')}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            ← Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <AppNav />
      <div className="max-w-2xl mx-auto">
        <PremiumPageHeader eyebrow="Administração" title="Editar usuário" description="Altere os dados abaixo para atualizar o usuário." icon={UserCog} actions={<button onClick={() => navigate('/users')} className={premiumHeaderSecondaryAction}>← Voltar</button>} />

        {/* Form */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Nome completo *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                minLength={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting}
              />
            </div>

            {/* Usuário */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Nome de usuário *
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username || ''}
                onChange={handleChange}
                required
                pattern="[a-z0-9._-]{3,50}"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: joao.silva"
                disabled={isSubmitting}
              />
              <p className="text-sm text-gray-500 mt-1">Padrão sugerido: nome.ultimo nome</p>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting}
              />
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Nova Senha
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                minLength={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Deixe em branco para manter a senha atual"
                disabled={isSubmitting}
              />
              <p className="text-sm text-gray-500 mt-1">
                Deixe em branco se não quiser alterar a senha
              </p>
            </div>

            {/* Perfil */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Perfil *
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting || user?.id === currentUser?.id}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {user?.id === currentUser?.id && (
                <p className="text-sm text-amber-600 mt-1">
                  Você não pode alterar seu próprio perfil
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleChange}
                  disabled={isSubmitting || user?.id === currentUser?.id}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Usuário ativo</span>
              </label>
              {user?.id === currentUser?.id && (
                <p className="text-sm text-amber-600 mt-1">
                  Você não pode desativar sua própria conta
                </p>
              )}
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="mustChangePassword"
                  checked={!!formData.mustChangePassword}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Trocar senha no próximo login</span>
                  <span className="mt-1 block text-xs text-slate-600">
                    Use esta opção para forçar o usuário a definir uma nova senha ao entrar novamente.
                  </span>
                </span>
              </label>
            </div>

            <UserPermissionsField
              value={formData.permissions || []}
              onChange={handlePermissionsChange}
              disabled={isSubmitting || user?.id === currentUser?.id}
            />

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/users')}
                className="flex-1 bg-white text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium border border-gray-300"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
