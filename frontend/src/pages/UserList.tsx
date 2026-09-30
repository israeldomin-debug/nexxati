import { AppNav } from '../components/AppNav'
import { PremiumPageHeader, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader'
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Users } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { userService, ImportUsersResult } from '../services/user.service'
import { User, UserRole } from '../types'
import { useAuthStore } from '../store/useAuthStore'
import { hasPermission } from '../utils/permissions'
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort'
import { PaginationControls, useClientPagination } from '../components/PaginationControls'
import { requestDeletePassword } from '../utils/deleteConfirmation'

type UserSortKey = 'name' | 'email' | 'username' | 'role' | 'active' | 'createdAt'
type PasswordResetResult = { user: User; temporaryPassword: string; message: string }

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  ATTENDANT: 'Atendente',
  USER: 'Usuário',
}

const roleColors: Record<UserRole, string> = {
  ADMIN: 'bg-red-100 text-red-800',
  ATTENDANT: 'bg-blue-100 text-blue-800',
  USER: 'bg-gray-100 text-gray-800',
}

const hasPendingPasswordReset = (user: User) => {
  if (!user.passwordResetRequestedAt) return false
  if (!user.passwordResetHandledAt) return true
  return new Date(user.passwordResetRequestedAt).getTime() > new Date(user.passwordResetHandledAt).getTime()
}

const parseCsvLine = (line: string, delimiter: string) => {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      quoted = !quoted
      continue
    }

    if (char === delimiter && !quoted) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values.map((value) => value.replace(/^"|"$/g, '').trim())
}

const normalizeHeader = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const parseUsersCsv = (content: string) => {
  const cleanContent = content.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const lines = cleanContent.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) throw new Error('A planilha precisa ter cabeçalho e pelo menos um usuário.')

  const headerLine = lines[0]
  const delimiter = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ','
  const headers = parseCsvLine(headerLine, delimiter).map(normalizeHeader)
  const indexes = {
    name: headers.indexOf('nome completo'),
    username: headers.indexOf('nome do usuario'),
    email: headers.indexOf('e-mail'),
    password: headers.indexOf('senha'),
  }

  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error('Cabeçalhos esperados: Nome completo, Nome do usuario, E-mail, Senha.')
  }

  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line, delimiter)
    return {
      name: columns[indexes.name] || '',
      username: columns[indexes.username] || '',
      email: columns[indexes.email] || '',
      password: columns[indexes.password] || '',
    }
  }).filter((user) => user.name || user.username || user.email || user.password)
}

export const UserList: React.FC = () => {
  const navigate = useNavigate()
  const { user: currentUser, logout } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState<UserSortKey>>({ key: 'name', direction: 'asc' })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportUsersResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [resettingUserId, setResettingUserId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<PasswordResetResult | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const canManageUsers = hasPermission(currentUser, 'MANAGE_USERS')

  useEffect(() => {
    // Verificar permissão
    if (!hasPermission(currentUser, 'ACCESS_USERS', ['ATTENDANT', 'ADMIN'])) {
      navigate('/dashboard')
      return
    }

    loadUsers()
  }, [currentUser, navigate])

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await userService.getAllUsers()
      setUsers(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar usuários')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    const target = users.find((item) => item.id === id)
    const password = requestDeletePassword(`o usuário ${target?.name || ''}`)
    if (!password) return
    try {
      await userService.delete(id, password)
      setDeleteConfirm(null)
      await loadUsers()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao deletar usuário')
    }
  }

  const downloadTemplate = () => {
    const csv = 'Nome completo;Nome do usuario;E-mail;Senha\nJoão Silva;joao.silva;joao.silva@empresa.com;Senha@123\n'
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo-importacao-usuarios.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setImporting(true)
      setImportError(null)
      setImportResult(null)
      const content = await file.text()
      const usersToImport = parseUsersCsv(content)
      const result = await userService.importUsers({
        users: usersToImport,
        mustChangePassword: true,
      })
      setImportResult(result)
      await loadUsers()
    } catch (err: any) {
      setImportError(err.response?.data?.error || err.message || 'Erro ao importar usuários')
    } finally {
      setImporting(false)
    }
  }

  const handleResetPassword = async (target: User) => {
    if (!window.confirm(`Gerar uma senha provisória para ${target.name}? O usuário será obrigado a trocar no próximo acesso.`)) return

    try {
      setResettingUserId(target.id)
      setError(null)
      const result = await userService.resetPassword(target.id)
      setResetResult(result)
      setCopiedPassword(false)
      await loadUsers()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar senha provisória')
    } finally {
      setResettingUserId(null)
    }
  }

  const copyTemporaryPassword = async () => {
    if (!resetResult?.temporaryPassword) return
    try {
      await navigator.clipboard.writeText(resetResult.temporaryPassword)
      setCopiedPassword(true)
    } catch {
      setCopiedPassword(false)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const sortedUsers = useMemo(() => sortByDirection(users, sort.direction, (user) => {
    if (sort.key === 'active') return user.active ? 1 : 0
    if (sort.key === 'role') return roleLabels[user.role]
    return user[sort.key] || ''
  }), [users, sort])
  const pendingPasswordResets = useMemo(() => users.filter(hasPendingPasswordReset), [users])
  const userPagination = useClientPagination(sortedUsers, `${sort.key}-${sort.direction}`)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Carregando usuários...</p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <AppNav />
      <div className="max-w-7xl mx-auto">
        <PremiumPageHeader eyebrow="Administração" title="Gerenciar usuários" description={`Bem-vindo, ${currentUser?.name || 'usuário'} (${roleLabels[currentUser?.role || 'USER']})`} icon={Users} actions={<><button onClick={() => navigate('/dashboard')} className={premiumHeaderSecondaryAction}>Voltar ao Dashboard</button><button onClick={logout} className={premiumHeaderSecondaryAction}>Sair</button></>} />

        {/* Actions */}
        <div className="mb-6 flex justify-between items-center">
          <p className="text-gray-600">
            Total: <span className="font-semibold">{users.length}</span> usuários
          </p>
          {canManageUsers && <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Baixar modelo CSV
            </button>
            <label className="cursor-pointer rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50">
              {importing ? 'Importando...' : 'Importar planilha'}
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={handleImportFile}
                disabled={importing}
                className="sr-only"
              />
            </label>
            <button
              onClick={() => navigate('/users/new')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Novo Usuário
            </button>
          </div>}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {importError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {importError}
          </div>
        )}

        {importResult && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-semibold">
              Importação concluída: {importResult.createdCount} criado(s), {importResult.skippedCount} ignorado(s).
            </p>
            {importResult.skipped.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Ver itens ignorados</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {importResult.skipped.slice(0, 20).map((item) => (
                    <li key={`${item.row}-${item.identifier}`}>Linha {item.row}: {item.reason} — {item.identifier}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {pendingPasswordResets.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <p className="font-bold">{pendingPasswordResets.length} pedido(s) de recuperação de senha pendente(s)</p>
                  <p className="mt-1 text-sm text-amber-800">Gere uma senha provisória e entregue ao usuário. No próximo login ele será obrigado a trocar.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingPasswordResets.slice(0, 3).map((item) => (
                  <button key={item.id} type="button" onClick={() => handleResetPassword(item)} disabled={resettingUserId === item.id} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60">
                    <KeyRound size={14} /> {resettingUserId === item.id ? 'Gerando...' : item.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader label="Nome" sortKey="name" current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Email" sortKey="email" current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Usuário" sortKey="username" current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Perfil" sortKey="role" current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Status" sortKey="active" current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Criado em" sortKey="createdAt" current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {userPagination.paginatedItems.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      {hasPendingPasswordReset(user) && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          <KeyRound size={12} /> Recuperação pendente
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-mono text-sm text-gray-600">{user.username || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          roleColors[user.role]
                        }`}
                      >
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {canManageUsers && <button
                          onClick={() => navigate(`/users/${user.id}/edit`)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Editar
                        </button>}
                        {canManageUsers && user.active && (
                          <>
                            <span className="text-gray-400">|</span>
                            <button
                              onClick={() => handleResetPassword(user)}
                              disabled={resettingUserId === user.id}
                              className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 disabled:opacity-50"
                            >
                              <KeyRound size={14} /> {resettingUserId === user.id ? 'Gerando...' : 'Gerar senha'}
                            </button>
                          </>
                        )}
                        {canManageUsers && user.id !== currentUser?.id && (
                          <>
                            {deleteConfirm === user.id ? (
                              <>
                                <span className="text-gray-400">|</span>
                                <button
                                  onClick={() => handleDelete(user.id)}
                                  className="text-red-600 hover:text-red-900 font-semibold"
                                >
                                  Confirmar?
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="text-gray-600 hover:text-gray-900"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-gray-400">|</span>
                                <button
                                  onClick={() => setDeleteConfirm(user.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Deletar
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && !error && (
            <div className="text-center py-12">
              <p className="text-gray-500">Nenhum usuário encontrado</p>
            </div>
          )}
          {users.length > 0 && <PaginationControls page={userPagination.page} pageSize={userPagination.pageSize} total={sortedUsers.length} totalPages={userPagination.totalPages} onPageChange={userPagination.setPage} onPageSizeChange={userPagination.setPageSize} itemLabel="usuário" />}
        </div>
      </div>
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={22} />
              </span>
              <div>
                <h2 className="text-xl font-black text-slate-950">Senha provisória criada</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Entregue esta senha para {resetResult.user.name}. Ela aparece aqui uma única vez e deverá ser trocada no próximo acesso.</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Senha provisória</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <code className="break-all rounded-lg bg-white px-3 py-2 font-mono text-base font-bold text-slate-900 shadow-sm">{resetResult.temporaryPassword}</code>
                <button type="button" onClick={copyTemporaryPassword} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white hover:bg-blue-800">
                  <Copy size={16} /> {copiedPassword ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            </div>
            <button type="button" onClick={() => setResetResult(null)} className="mt-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
