import { BaseAsset, type AssetConfig } from '@tetherto/wdk-react-native-core'

// One asset by design. USD₮0 is Tether's omnichain USD₮ on Arbitrum One.
export const USDT0_ARBITRUM_CONFIG: AssetConfig = {
  id: 'usdt0-arbitrum',
  network: 'arbitrum',
  symbol: 'USD₮0',
  name: 'Tether USD₮0',
  decimals: 6,
  isNative: false,
  address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
}

export const USDT0 = new BaseAsset(USDT0_ARBITRUM_CONFIG)

/** Native ETH on Arbitrum — shown only because a plain account needs it for gas. */
export const ETH_ARBITRUM_CONFIG: AssetConfig = {
  id: 'eth-arbitrum',
  network: 'arbitrum',
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  isNative: true,
  address: null
}

export const ETH = new BaseAsset(ETH_ARBITRUM_CONFIG)

/** Base units arrive as a string; they exceed what a JS number holds. */
export function formatUnits (raw: string | null | undefined, decimals: number, maxFractionDigits = 2): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const negative = raw.startsWith('-')
  const digits = (negative ? raw.slice(1) : raw).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals)

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const shown = fraction.slice(0, maxFractionDigits).replace(/0+$/, '')

  return `${negative ? '-' : ''}${grouped}${shown ? '.' + shown : ''}`
}

/** Null for anything but a plain positive decimal within the asset's precision; never rounds. */
export function parseUnits (input: string, decimals: number): bigint | null {
  const text = input.trim()
  if (!/^\d*(\.\d*)?$/.test(text) || text === '' || text === '.') return null

  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > decimals) return null

  return BigInt(whole + fraction.padEnd(decimals, '0'))
}
