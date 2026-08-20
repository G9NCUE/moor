import { BaseAsset, type AssetConfig } from '@tetherto/wdk-react-native-core'

/**
 * Moor holds exactly one asset. That's a design choice, not a limitation — a reference
 * app earns its keep by being readable, and every extra asset is another row, another
 * empty state, and another thing between the reader and the point.
 *
 * USD₮0 is Tether's omnichain USD₮ on Arbitrum One.
 */
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

/**
 * Format a raw integer balance for display. Balances arrive as base units in a string,
 * because they routinely exceed what a JS number can hold without lying.
 */
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

/**
 * Parse a typed amount into base units. Returns null if it isn't a plain positive decimal
 * or carries more precision than the asset has — never a rounded approximation, because
 * silently dropping a digit off somebody's transfer is not an acceptable failure mode.
 */
export function parseUnits (input: string, decimals: number): bigint | null {
  const text = input.trim()
  if (!/^\d*(\.\d*)?$/.test(text) || text === '' || text === '.') return null

  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > decimals) return null

  return BigInt(whole + fraction.padEnd(decimals, '0'))
}
