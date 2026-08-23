// The design system, in one file; DESIGN.md has the reasoning. No colour, font or radius
// is written down anywhere else.
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native'

export function theme (dark: boolean) {
  return dark ? DARK : LIGHT
}

// Dark is designed, not inverted.
const LIGHT = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  line: '#E2E8F0',
  fg: '#020617',
  dim: '#64748B',
  accent: '#0F172A',
  onAccent: '#FFFFFF',
  gold: '#A16207',
  danger: '#DC2626',
  warning: '#8A5A00',
  onWarning: '#FFFFFF'
}

const DARK: typeof LIGHT = {
  bg: '#0B1220',
  card: '#151C2B',
  line: '#263041',
  fg: '#F8FAFC',
  dim: '#94A3B8',
  accent: '#F8FAFC',
  onAccent: '#0B1220',
  gold: '#D6A339',
  danger: '#F87171',
  warning: '#D79A3C',
  onWarning: '#0B1220'
}

// IBM Plex, bundled. RN does not synthesise weight for a custom family, so a weight is a
// family here and `fontWeight` appears nowhere else. Mono must be bundled too: Menlo is
// iOS-only, and addresses fell back to a proportional font on Android.
export const FONT = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium'
}

const BY_WEIGHT: Record<string, string> = {
  400: FONT.regular,
  500: FONT.medium,
  600: FONT.semibold,
  700: FONT.bold
}

// Maps `fontWeight` to the Plex family that carries it; a missed style renders silently in
// San Francisco on iOS. Styles that already name a family are left alone.
type Named<T> = { [K in keyof T]: ViewStyle | TextStyle | ImageStyle }

export function sheet<T extends Named<T>> (styles: T): T {
  for (const style of Object.values(styles) as TextStyle[]) {
    if (style.fontFamily !== undefined) continue
    if (style.fontSize === undefined && style.fontWeight === undefined) continue
    style.fontFamily = BY_WEIGHT[String(style.fontWeight ?? 400)] ?? FONT.regular
    delete style.fontWeight
  }
  return styles
}

// Tabular figures for any number that changes, so the decimal point stays put.
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] }

// Pressed feedback: opacity, so nothing shifts.
export const PRESSED: TextStyle = { opacity: 0.65 }

// Fixed in both themes: a QR a scanner reads, and a camera feed.
export const QR_LIGHT = '#FFFFFF'
export const QR_DARK = '#0B1220'
export const CAMERA_BG = '#000000'
export const CAMERA_FG = '#FFFFFF'
