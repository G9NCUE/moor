/**
 * The design system, in one file. [`DESIGN.md`](../../DESIGN.md) explains the reasoning;
 * this is the only place a colour, a font or a radius is allowed to be written down.
 *
 * Closer to a well-made bank than to a crypto app: one asset, one chain, one accent. The
 * accent is near-black in light mode and near-white in dark, because a wallet that looks
 * calm is easier to trust with money than one that looks exciting.
 */
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native'

export function theme (dark: boolean) {
  return dark ? DARK : LIGHT
}

/**
 * Dark is designed rather than inverted. Inverting a light palette is what makes most dark
 * modes feel muddy — the greys go wrong and every contrast ratio has to be re-checked
 * anyway, so they are re-checked here instead of inferred.
 */
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

/**
 * IBM Plex, bundled — not fetched, and not the system font.
 *
 * React Native does **not** synthesise weight for a custom family: `fontWeight: '700'` on a
 * named font is ignored on Android and faked on iOS. So a weight is a family here, and
 * `fontWeight` should not appear anywhere outside this file.
 *
 * Mono matters more than it looks. It was `'Menlo'`, which exists only on iOS, so every
 * address and peer key fell back to a proportional font on Android — in the one place a
 * wallet needs someone to compare characters.
 */
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

/**
 * Wrap a style map before `StyleSheet.create` and every text style gets a Plex family.
 *
 * Doing it by hand across five screens means missing some, and a missed style is invisible
 * on iOS — it just quietly renders in San Francisco. This maps `fontWeight` to the family
 * that actually carries that weight and drops the now-meaningless `fontWeight`. Styles that
 * already name a family (the mono ones) are left alone.
 */
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

/**
 * Tabular figures, for any number that changes.
 *
 * The one typographic rule here that isn't taste. In proportional figures a balance reflows
 * every time a digit updates and the decimal point walks left and right while you read it.
 * Tabular figures pin every glyph to the same width. Balance, fee quotes, amounts.
 */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] }

/** Pressed feedback, on every tappable surface. Opacity, so nothing shifts. */
export const PRESSED: TextStyle = { opacity: 0.65 }

/**
 * Fixed in both themes, because they sit on something that isn't a themed surface: a QR a
 * scanner has to read, and a live camera feed. The rule is still "no raw hex outside this
 * file" — these are the exceptions, named.
 */
export const QR_LIGHT = '#FFFFFF'
export const QR_DARK = '#0B1220'
export const CAMERA_BG = '#000000'
export const CAMERA_FG = '#FFFFFF'
