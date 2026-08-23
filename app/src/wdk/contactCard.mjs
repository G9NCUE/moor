// The contact card a QR carries between two people:
//
//     moor://contact?n=Alice&a=0x742d…f44e&k=<64 hex>
//
// `k` is the HyperDHT peer key, the field no other wallet's QR has. The only .mjs in a
// folder of .ts because lab/t11 imports this exact file: one codec, or the format drifts.
// The parser is hand-rolled because URL and URLSearchParams differ between Node, Hermes
// and the RN polyfill, and this string is where a stranger's bytes enter the address book.

const SCHEME = 'moor://contact?'

const MAX_NAME = 64

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const PEER_KEY = /^[0-9a-fA-F]{64}$/

/** @typedef {{ name: string|null, address: string|null, peerKey: string|null }} ContactCard */

/** @param {Partial<ContactCard>} card */
export function encodeCard ({ name, address, peerKey } = {}) {
  const parts = []
  if (name) parts.push('n=' + encodeURIComponent(String(name).slice(0, MAX_NAME)))
  if (address) parts.push('a=' + address)
  if (peerKey) parts.push('k=' + peerKey)
  if (parts.length === 0) throw new Error('a contact card needs an address or a peer key')
  return SCHEME + parts.join('&')
}

/**
 * Null for anything that is not a Moor card, including a bare-address QR: the caller says
 * "that is an address, not a Moor code" rather than half-importing it.
 * @param {unknown} text
 * @returns {ContactCard|null}
 */
export function decodeCard (text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (trimmed.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return null

  /** @type {Map<string, string>} */
  const params = new Map()
  for (const pair of trimmed.slice(SCHEME.length).split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    if (eq < 1) return null
    const key = pair.slice(0, eq)
    // `k=<mine>&k=<theirs>` is ambiguous; refuse rather than pick.
    if (params.has(key)) return null
    params.set(key, pair.slice(eq + 1))
  }

  const rawAddress = params.get('a')
  const rawPeerKey = params.get('k')

  // Present but malformed is a corrupt card, not a missing field.
  if (rawAddress !== undefined && !ADDRESS.test(rawAddress)) return null
  if (rawPeerKey !== undefined && !PEER_KEY.test(rawPeerKey)) return null

  const address = rawAddress ?? null
  const peerKey = rawPeerKey ? rawPeerKey.toLowerCase() : null
  if (address === null && peerKey === null) return null

  let name = null
  if (params.has('n')) {
    try {
      name = decodeURIComponent(params.get('n'))
    } catch {
      return null
    }
    // Control characters and bidi overrides have no place in a name.
    name = name.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e]/g, '')
      .trim().slice(0, MAX_NAME)
    if (name === '') name = null
  }

  // Unknown parameters are ignored so a future field does not break today's app.
  return { name, address, peerKey }
}

// The address book cannot store a peer key as an address (finding 2), so it rides in
// `Contact.username` with a prefix.

const USERNAME_PREFIX = 'moor:'

/** @param {string} peerKey */
export function encodePeerKey (peerKey) {
  return USERNAME_PREFIX + peerKey
}

/** @param {string|null|undefined} username */
export function decodePeerKey (username) {
  if (typeof username !== 'string' || !username.startsWith(USERNAME_PREFIX)) return null
  const key = username.slice(USERNAME_PREFIX.length).trim().toLowerCase()
  return PEER_KEY.test(key) ? key : null
}
