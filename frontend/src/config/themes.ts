export type AppThemeId = 'controlall' | 'burgundy' | 'black-red' | 'blue-orange' | 'teal-gold' | 'violet-pink'
export type AppearanceMode = 'LIGHT' | 'DARK' | 'SYSTEM'

export type AppTheme = {
  id: AppThemeId
  name: string
  description: string
  colors: [string, string, string]
}

export const appThemes: AppTheme[] = [
  {
    id: 'controlall',
    name: 'NEXXATI Azul',
    description: 'Identidade principal do sistema',
    colors: ['#081426', '#0b5ed7', '#20a4ff'],
  },
  {
    id: 'burgundy',
    name: 'Bordô & Grafite',
    description: 'Identidade corporativa atual',
    colors: ['#991b2d', '#dc4650', '#111827'],
  },
  {
    id: 'black-red',
    name: 'Preto & Vermelho',
    description: 'Forte e tecnológico',
    colors: ['#09090b', '#e11d48', '#fb3c52'],
  },
  {
    id: 'blue-orange',
    name: 'Azul & Laranja',
    description: 'Moderno e energético',
    colors: ['#0c3b70', '#2563eb', '#f97316'],
  },
  {
    id: 'teal-gold',
    name: 'Petróleo & Dourado',
    description: 'Sóbrio e sofisticado',
    colors: ['#0f3d46', '#0f766e', '#d6a632'],
  },
  {
    id: 'violet-pink',
    name: 'Violeta & Rosa',
    description: 'Criativo e contemporâneo',
    colors: ['#312e81', '#7c3aed', '#ec4899'],
  },
]

const storageKey = 'idl-ativos-theme'
const defaultTheme: AppThemeId = 'controlall'
const appearanceStorageKey = 'controlall-appearance-mode'

export function getStoredTheme(): AppThemeId {
  try {
    const stored = window.localStorage.getItem(storageKey) as AppThemeId | null
    return appThemes.some((theme) => theme.id === stored) ? stored! : defaultTheme
  } catch {
    return defaultTheme
  }
}

export function applyTheme(theme: AppThemeId) {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(storageKey, theme)
  } catch {
    // O tema continua aplicado na sessão mesmo quando o armazenamento está indisponível.
  }
}

export function applyStoredTheme() {
  applyTheme(getStoredTheme())
  applyAppearanceMode(getStoredAppearanceMode())
}

export function getStoredAppearanceMode(): AppearanceMode {
  try {
    const stored = window.localStorage.getItem(appearanceStorageKey) as AppearanceMode | null
    return stored === 'DARK' || stored === 'SYSTEM' || stored === 'LIGHT' ? stored : 'LIGHT'
  } catch { return 'LIGHT' }
}

export function applyAppearanceMode(mode: AppearanceMode) {
  const dark = mode === 'DARK' || (mode === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.appearance = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  try { window.localStorage.setItem(appearanceStorageKey, mode) } catch { /* mantém na sessão */ }
}
