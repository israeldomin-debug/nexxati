import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Laptop, Moon, Palette, Sun } from 'lucide-react'
import { AppearanceMode, applyAppearanceMode, applyTheme, appThemes, AppThemeId, getStoredAppearanceMode, getStoredTheme } from '../config/themes'
import { useAuthStore } from '../store/useAuthStore'
import { userService } from '../services/user.service'
import { handleApiError } from '../services/api'

export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<AppThemeId>(() => getStoredTheme())
  const [saveError, setSaveError] = useState('')
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => getStoredAppearanceMode())
  const rootRef = useRef<HTMLDivElement>(null)
  const { user, loadUser } = useAuthStore()

  useEffect(() => {
    if (!user?.themePreference || !appThemes.some((theme) => theme.id === user.themePreference)) return
    setSelectedTheme(user.themePreference)
    applyTheme(user.themePreference)
  }, [user?.themePreference])

  useEffect(() => {
    const mode = user?.appearanceMode || getStoredAppearanceMode()
    setAppearanceMode(mode)
    applyAppearanceMode(mode)
  }, [user?.appearanceMode])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => { if (appearanceMode === 'SYSTEM') applyAppearanceMode('SYSTEM') }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [appearanceMode])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  const selectTheme = async (theme: AppThemeId) => {
    setSelectedTheme(theme)
    applyTheme(theme)
    setOpen(false)
    setSaveError('')
    if (!user) return
    try {
      await userService.updateThemePreference(user.id, theme)
      await loadUser()
    } catch (error) {
      setSaveError(handleApiError(error))
    }
  }

  const selectAppearance = async (mode: AppearanceMode) => {
    setAppearanceMode(mode); applyAppearanceMode(mode); setSaveError('')
    if (!user) return
    try { await userService.updateAppearanceMode(user.id, mode); await loadUser() }
    catch (error) { setSaveError(handleApiError(error)) }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="theme-picker-trigger inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Alterar tema do sistema"
      >
        <Palette size={17} />
        <span className="hidden sm:inline">Tema</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[70] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/15" role="menu">
          <div className="px-3 pb-2 pt-2">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Aparência do sistema</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Escolha uma combinação. A preferência fica salva no seu usuário e acompanha o próximo acesso.</p>
            {saveError && <p className="mt-2 text-xs font-medium text-red-600">{saveError}</p>}
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {([{ id: 'LIGHT', label: 'Claro', Icon: Sun }, { id: 'DARK', label: 'Escuro', Icon: Moon }, { id: 'SYSTEM', label: 'Sistema', Icon: Laptop }] as const).map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => selectAppearance(id)} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition ${appearanceMode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Icon size={14} />{label}</button>)}
          </div>
          <div className="space-y-1">
            {appThemes.map((theme) => {
              const selected = selectedTheme === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => selectTheme(theme.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? 'theme-picker-selected border-transparent'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex shrink-0 -space-x-1">
                    {theme.colors.map((color) => (
                      <span key={color} className="h-7 w-7 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-slate-800">{theme.name}</strong>
                    <span className="block text-xs text-slate-500">{theme.description}</span>
                  </span>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${selected ? 'theme-picker-check text-white' : 'bg-slate-100 text-transparent'}`}>
                    <Check size={15} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
