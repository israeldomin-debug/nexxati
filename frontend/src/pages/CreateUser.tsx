import { AppNav } from '../components/AppNav'
import { PremiumPageHeader, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader'
import { UserPlus } from 'lucide-react'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { userService, CreateUserData } from '../services/user.service'
import { UserPermissionsField } from '../components/UserPermissionsField'
import { defaultPermissionsByRole } from '../utils/permissions'
import { UserPermission, UserRole } from '../types'

const roleOptions = [
  { value: 'USER', label: 'Usuário' },
  { value: 'ATTENDANT', label: 'Atendente' },
  { value: 'ADMIN', label: 'Administrador' },
]

export const CreateUser = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState<CreateUserData>({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'USER',
    mustChangePassword: true,
    permissions: defaultPermissionsByRole.USER,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name === 'role') {
      const role = value as UserRole
      setFormData((prev) => ({
        ...prev,
        role,
        permissions: defaultPermissionsByRole[role],
      }))
      return
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handlePermissionsChange = (permissions: UserPermission[]) => {
    setFormData((prev) => ({ ...prev, permissions }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsSubmitting(true)
      setError(null)
      await userService.create(formData)
      navigate('/users')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar usuário')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <AppNav />
      <div className="max-w-2xl mx-auto">
        <PremiumPageHeader eyebrow="Administração" title="Novo usuário" description="Preencha os dados abaixo para criar um novo usuário." icon={UserPlus} actions={<button onClick={() => navigate('/users')} className={premiumHeaderSecondaryAction}>← Voltar</button>} />

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
                placeholder="Ex: João Silva"
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
                value={formData.username}
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
                placeholder="Ex: joao.silva@empresa.com"
                disabled={isSubmitting}
              />
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Senha *
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Mínimo 6 caracteres"
                disabled={isSubmitting}
              />
              <p className="text-sm text-gray-500 mt-1">A senha deve ter no mínimo 6 caracteres</p>
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
                disabled={isSubmitting}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-1">
                <strong>Usuário:</strong> Pode criar e visualizar seus próprios chamados.
                <br />
                <strong>Atendente:</strong> Pode visualizar e gerenciar chamados atribuídos.
                <br />
                <strong>Administrador:</strong> Acesso total ao sistema.
              </p>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="mustChangePassword"
                  checked={!!formData.mustChangePassword}
                  onChange={(event) => setFormData((prev) => ({ ...prev, mustChangePassword: event.target.checked }))}
                  disabled={isSubmitting}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Trocar senha no primeiro login</span>
                  <span className="mt-1 block text-xs text-slate-600">
                    O usuário entra com a senha provisória e será obrigado a criar sua própria senha antes de usar o sistema.
                  </span>
                </span>
              </label>
            </div>

            <UserPermissionsField
              value={formData.permissions || []}
              onChange={handlePermissionsChange}
              disabled={isSubmitting}
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
                {isSubmitting ? 'Criando...' : 'Criar Usuário'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
