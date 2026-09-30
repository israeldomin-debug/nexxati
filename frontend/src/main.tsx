import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ArrowRight, ImagePlus, LockKeyhole, RotateCcw, ShieldCheck, UserRound } from 'lucide-react'
import { useAuthStore } from './store/useAuthStore'
import { authService } from './services/auth.service'
import { applyDocumentBranding, branding } from './config/branding'
import { applyStoredTheme } from './config/themes'
import type { UserPermission, UserRole } from './types'
import { hasPermission } from './utils/permissions'
import './index.css'

const Dashboard = React.lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })))
const TicketList = React.lazy(() => import('./pages/TicketList').then((module) => ({ default: module.TicketList })))
const CreateTicket = React.lazy(() => import('./pages/CreateTicket').then((module) => ({ default: module.CreateTicket })))
const TicketDetails = React.lazy(() => import('./pages/TicketDetails').then((module) => ({ default: module.TicketDetails })))
const EditTicket = React.lazy(() => import('./pages/EditTicket').then((module) => ({ default: module.EditTicket })))
const UserList = React.lazy(() => import('./pages/UserList').then((module) => ({ default: module.UserList })))
const CreateUser = React.lazy(() => import('./pages/CreateUser').then((module) => ({ default: module.CreateUser })))
const EditUser = React.lazy(() => import('./pages/EditUser').then((module) => ({ default: module.EditUser })))
const Assets = React.lazy(() => import('./pages/Assets').then((module) => ({ default: module.Assets })))
const Companies = React.lazy(() => import('./pages/Companies').then((module) => ({ default: module.Companies })))
const Suppliers = React.lazy(() => import('./pages/Suppliers').then((module) => ({ default: module.Suppliers })))
const Accessories = React.lazy(() => import('./pages/Accessories').then((module) => ({ default: module.Accessories })))
const Disposals = React.lazy(() => import('./pages/Disposals').then((module) => ({ default: module.Disposals })))
const Licenses = React.lazy(() => import('./pages/Licenses').then((module) => ({ default: module.Licenses })))
const IpAddresses = React.lazy(() => import('./pages/IpAddresses').then((module) => ({ default: module.IpAddresses })))
const PasswordVault = React.lazy(() => import('./pages/PasswordVault').then((module) => ({ default: module.PasswordVault })))
const MovementReports = React.lazy(() => import('./pages/MovementReports').then((module) => ({ default: module.MovementReports })))
const AccessDenied = React.lazy(() => import('./pages/AccessDenied').then((module) => ({ default: module.AccessDenied })))
const ChangePassword = React.lazy(() => import('./pages/ChangePassword').then((module) => ({ default: module.ChangePassword })))
const BackupRestore = React.lazy(() => import('./pages/BackupRestore').then((module) => ({ default: module.BackupRestore })))
const SystemHealth = React.lazy(() => import('./pages/SystemHealth').then((module) => ({ default: module.SystemHealth })))
const AuditReports = React.lazy(() => import('./pages/AuditReports').then((module) => ({ default: module.AuditReports })))
const ManagementHub = React.lazy(() => import('./pages/ManagementHub').then((module) => ({ default: module.ManagementHub })))

applyDocumentBranding()
applyStoredTheme()

const loginCompanyLogoStorageKey = 'controlall-login-company-logo'
const defaultLoginCompanyLogo = '/nexxati-logo-modern.svg'

function LoginCompanyLogo() {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = React.useState(() => localStorage.getItem(loginCompanyLogoStorageKey) || defaultLoginCompanyLogo)
  const [logoError, setLogoError] = React.useState('')

  const changeLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoError('Selecione uma imagem.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Use uma imagem de até 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const nextLogo = String(reader.result || '')
      localStorage.setItem(loginCompanyLogoStorageKey, nextLogo)
      setLogoUrl(nextLogo)
      setLogoError('')
    }
    reader.onerror = () => setLogoError('Não foi possível carregar o logo.')
    reader.readAsDataURL(file)
  }

  const restoreDefaultLogo = () => {
    localStorage.removeItem(loginCompanyLogoStorageKey)
    setLogoUrl(defaultLoginCompanyLogo)
    setLogoError('')
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-h-28 min-w-0 items-center">
          <img src={logoUrl} alt="Logo da empresa" className="max-h-24 max-w-[230px] object-contain" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="Trocar logo da empresa" aria-label="Trocar logo da empresa">
            <ImagePlus size={18} />
          </button>
          {logoUrl !== defaultLoginCompanyLogo && (
            <button type="button" onClick={restoreDefaultLogo} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900" title="Restaurar logo padrão" aria-label="Restaurar logo padrão">
              <RotateCcw size={17} />
            </button>
          )}
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={changeLogo} className="sr-only" />
      {logoError && <p className="mt-2 text-xs font-medium text-red-600">{logoError}</p>}
    </div>
  )
}

// Componente temporário de Login
const Login = () => {
  const { login, isLoading, error } = useAuthStore()
  const [loginId, setLoginId] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [forgotOpen, setForgotOpen] = React.useState(false)
  const [forgotLogin, setForgotLogin] = React.useState('')
  const [forgotCode, setForgotCode] = React.useState('')
  const [forgotNewPassword, setForgotNewPassword] = React.useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = React.useState('')
  const [forgotLoading, setForgotLoading] = React.useState(false)
  const [forgotMessage, setForgotMessage] = React.useState('')
  const [forgotError, setForgotError] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  try {
    const response = await login({ login: loginId, password })
    window.location.href = response.user.mustChangePassword ? '/change-password' : '/dashboard'
  } catch (err) {
    console.error(err)
  }
}

  const openForgotPassword = () => {
    setForgotOpen(true)
    setForgotLogin(loginId)
    setForgotCode('')
    setForgotNewPassword('')
    setForgotConfirmPassword('')
    setForgotMessage('')
    setForgotError('')
  }

  const handleForgotSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      setForgotLoading(true)
      setForgotError('')
      const response = await authService.resetPasswordWithCode({
        login: forgotLogin,
        recoveryCode: forgotCode,
        newPassword: forgotNewPassword,
        confirmPassword: forgotConfirmPassword,
      })
      setForgotMessage(response.message)
      setLoginId(forgotLogin)
      setPassword('')
      setForgotCode('')
      setForgotNewPassword('')
      setForgotConfirmPassword('')
    } catch (err: any) {
      setForgotError(err.response?.data?.error || 'Não foi possível redefinir a senha agora.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="premium-login min-h-screen p-5 sm:p-8">
      <div className="premium-login-card mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-[0_32px_90px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="premium-hero relative hidden min-h-[650px] overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="premium-hero-glow absolute -right-28 -top-28 h-80 w-80 rounded-full opacity-20 blur-3xl" />
          <div className="premium-hero-glow absolute -bottom-32 -left-24 h-96 w-96 rounded-full opacity-20 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              <ShieldCheck size={14} /> Ambiente corporativo
            </span>
          </div>
          <div className="relative">
            <div className="max-w-[390px]">
              <img src="/nexxati-logo-modern-animated.svg?v=2" alt={branding.appName} className="login-brand-animated w-full object-contain" />
            </div>
            <p className="mb-7 mt-5 text-sm font-bold uppercase tracking-[0.16em] text-white">
              Controle completo. <span className="text-sky-400">Resultados reais.</span>
            </p>
            <h1 className="max-w-md text-4xl font-black leading-tight tracking-[-0.04em]">Gestão clara para ativos e atendimento.</h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">Inventário, chamados, estoque e licenças reunidos em um ambiente seguro e organizado.</p>
          </div>
          <p className="relative text-xs font-medium uppercase tracking-[0.16em] text-white/50">NEXXATI · Controle completo, resultados reais</p>
        </aside>

        <main className="flex min-h-[650px] items-center px-7 py-10 sm:px-14 lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-9">
              <LoginCompanyLogo />
              <div className="mt-8">
                <p className="premium-accent-text text-xs font-bold uppercase tracking-[0.2em]">Acesso ao sistema</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-950">Bem-vindo de volta</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Entre com suas credenciais para continuar.</p>
              </div>
            </div>

            {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login" className="mb-2 block text-sm font-semibold text-slate-700">Usuário ou e-mail</label>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" id="login" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoComplete="username" className="premium-input w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-12 pr-4 text-slate-900" placeholder="Digite seu usuário" />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-700">Senha</label>
                  <button type="button" onClick={openForgotPassword} className="text-xs font-bold text-blue-700 transition hover:text-blue-900">
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="premium-input w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-12 pr-4 text-slate-900" placeholder="••••••••" />
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="premium-primary-action group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50">
                {isLoading ? 'Entrando...' : 'Entrar'} {!isLoading && <ArrowRight size={18} className="transition group-hover:translate-x-1" />}
              </button>
            </form>
            {forgotOpen && (
              <form onSubmit={handleForgotSubmit} className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Recuperar acesso</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Informe seu usuário ou e-mail, o código de recuperação e cadastre uma nova senha.</p>
                  </div>
                  <button type="button" onClick={() => setForgotOpen(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-800">
                    Fechar
                  </button>
                </div>
                <div className="mt-4">
                  <label htmlFor="forgot-login" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Usuário ou e-mail</label>
                  <input id="forgot-login" value={forgotLogin} onChange={(event) => setForgotLogin(event.target.value)} required autoComplete="username" className="premium-input w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900" placeholder="seu.usuario ou email@empresa.com" />
                </div>
                <div className="mt-4">
                  <label htmlFor="forgot-code" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Código de recuperação</label>
                  <input id="forgot-code" value={forgotCode} onChange={(event) => setForgotCode(event.target.value)} required inputMode="numeric" autoComplete="one-time-code" className="premium-input w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900" placeholder="Digite o código" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="forgot-new-password" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Nova senha</label>
                    <input id="forgot-new-password" type="password" value={forgotNewPassword} onChange={(event) => setForgotNewPassword(event.target.value)} required autoComplete="new-password" className="premium-input w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900" placeholder="Nova senha" />
                  </div>
                  <div>
                    <label htmlFor="forgot-confirm-password" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Confirmar</label>
                    <input id="forgot-confirm-password" type="password" value={forgotConfirmPassword} onChange={(event) => setForgotConfirmPassword(event.target.value)} required autoComplete="new-password" className="premium-input w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900" placeholder="Repita a senha" />
                  </div>
                </div>
                {forgotError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{forgotError}</p>}
                {forgotMessage && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{forgotMessage}</p>}
                <button type="submit" disabled={forgotLoading || !forgotLogin.trim() || !forgotCode.trim() || !forgotNewPassword || !forgotConfirmPassword} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {forgotLoading ? 'Redefinindo...' : 'Redefinir senha'}
                </button>
              </form>
            )}
            <p className="mt-8 text-center text-xs text-slate-400">Acesso protegido e monitorado</p>
          </div>
        </main>
      </div>
    </div>
  )
}

// Componente de rota protegida
const PrivateRoute = ({ children, adminOnly = false, allowedRoles, permission, permissionFallbackRoles = ['ADMIN'], allowPasswordChange = false }: { children: React.ReactNode; adminOnly?: boolean; allowedRoles?: UserRole[]; permission?: UserPermission; permissionFallbackRoles?: UserRole[]; allowPasswordChange?: boolean }) => {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.mustChangePassword && !allowPasswordChange) return <Navigate to="/change-password" replace />
  if (adminOnly && user?.role !== 'ADMIN') return <AccessDenied />
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return <AccessDenied />
  if (permission && !hasPermission(user, permission, permissionFallbackRoles)) return <AccessDenied />
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

// App principal
const App = () => {
  return (
    <BrowserRouter>
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">Carregando módulo...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <PrivateRoute allowPasswordChange>
              <ChangePassword />
            </PrivateRoute>
          }
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Navigate to="/dashboard" replace />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/tickets"
          element={
            <PrivateRoute>
              <TicketList />
            </PrivateRoute>
          }
        />
        <Route
          path="/tickets/new"
          element={
            <PrivateRoute>
              <CreateTicket />
            </PrivateRoute>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <PrivateRoute>
              <TicketDetails />
            </PrivateRoute>
          }
        />
        <Route
          path="/tickets/:id/edit"
          element={
            <PrivateRoute>
              <EditTicket />
            </PrivateRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <PrivateRoute permission="ACCESS_ASSETS">
              <Assets />
            </PrivateRoute>
          }
        />
        <Route
          path="/companies"
          element={
            <PrivateRoute permission="ACCESS_COMPANIES">
              <Companies />
            </PrivateRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <PrivateRoute permission="ACCESS_SUPPLIERS">
              <Suppliers />
            </PrivateRoute>
          }
        />
        <Route
          path="/accessories"
          element={
            <PrivateRoute permission="ACCESS_ACCESSORIES">
              <Accessories />
            </PrivateRoute>
          }
        />
        <Route
          path="/disposals"
          element={
            <PrivateRoute permission="ACCESS_ASSETS">
              <Disposals />
            </PrivateRoute>
          }
        />
        <Route
          path="/licenses"
          element={
            <PrivateRoute permission="ACCESS_LICENSES">
              <Licenses />
            </PrivateRoute>
          }
        />
        <Route
          path="/ip-addresses"
          element={
            <PrivateRoute permission="ACCESS_IP_ADDRESSES">
              <IpAddresses />
            </PrivateRoute>
          }
        />
        <Route
          path="/password-vault"
          element={
            <PrivateRoute permission="ACCESS_PASSWORD_VAULT">
              <PasswordVault />
            </PrivateRoute>
          }
        />
        <Route
          path="/accessories/reports"
          element={
            <PrivateRoute permission="ACCESS_ACCESSORIES">
              <MovementReports />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports/movements"
          element={
            <PrivateRoute permission="ACCESS_ACCESSORIES">
              <Navigate to="/accessories/reports" replace />
            </PrivateRoute>
          }
        />
        <Route
          path="/users"
          element={
            <PrivateRoute adminOnly>
              <UserList />
            </PrivateRoute>
          }
        />
        <Route
          path="/users/new"
          element={
            <PrivateRoute adminOnly>
              <CreateUser />
            </PrivateRoute>
          }
        />
        <Route
          path="/users/:id/edit"
          element={
            <PrivateRoute adminOnly>
              <EditUser />
            </PrivateRoute>
          }
        />
        <Route
          path="/backup"
          element={
            <PrivateRoute adminOnly>
              <BackupRestore />
            </PrivateRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <PrivateRoute adminOnly>
              <AuditReports />
            </PrivateRoute>
          }
        />
        <Route
          path="/management"
          element={
            <PrivateRoute adminOnly>
              <ManagementHub />
            </PrivateRoute>
          }
        />
        <Route
          path="/system-health"
          element={
            <PrivateRoute adminOnly>
              <SystemHealth />
            </PrivateRoute>
          }
        />
      </Routes>
      </React.Suspense>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
