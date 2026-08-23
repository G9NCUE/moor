import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode
} from 'react'
import { useColorScheme } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'

export type ThemeMode = 'system' | 'light' | 'dark'

const MODES: ThemeMode[] = ['system', 'light', 'dark']

type ThemeState = {
  /** What the user chose. */
  mode: ThemeMode
  /** What that resolves to right now, once the system setting is folded in. */
  dark: boolean
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeState>({
  mode: 'system',
  dark: false,
  setMode: () => {}
})

// Theme chosen by the person, "system" by default. One source of truth for every screen,
// persisted as a one-value file in the document directory.
export function ThemeProvider ({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('system')

  useEffect(() => {
    void (async () => {
      try {
        const stored = readMode()
        if (stored) setModeState(stored)
      } catch { /* no preference saved yet, or unreadable — system is a fine default */ }
    })()
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      settingsFile().write(JSON.stringify({ theme: next }))
    } catch { /* the choice still applies this session; it just won't survive a restart */ }
  }, [])

  const dark = mode === 'system' ? system === 'dark' : mode === 'dark'

  const value = useMemo(() => ({ mode, dark, setMode }), [mode, dark, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** What almost every screen wants: is it dark right now. */
export function useDark (): boolean {
  return useContext(ThemeContext).dark
}

/** The settings control wants the chosen mode and the setter too. */
export function useThemeMode (): ThemeState {
  return useContext(ThemeContext)
}

export const THEME_MODES = MODES

function settingsFile (): File {
  const dir = new Directory(Paths.document, 'moor')
  if (!dir.exists) dir.create({ intermediates: true })
  return new File(dir, 'settings.json')
}

function readMode (): ThemeMode | null {
  const file = settingsFile()
  if (!file.exists) return null
  const parsed: unknown = JSON.parse(file.textSync())
  const theme = (parsed as { theme?: unknown })?.theme
  return MODES.includes(theme as ThemeMode) ? theme as ThemeMode : null
}
