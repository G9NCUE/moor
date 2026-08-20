/**
 * The contact card — what a QR code between two people actually carries.
 *
 * Two Moor users standing together need to exchange three things: a name to file each other
 * under, an Arbitrum address to pay to, and a HyperDHT peer key to be reachable at. The
 * first two are ordinary. The third is the one no other wallet's QR carries, and it is what
 * turns a scan into "this person can now ask me for money, and nobody else can".
 *
 *     moor://contact?n=Alice&a=0x742d…f44e&k=<64 hex>
 *
 * All three fields are optional individually; a card with neither an address nor a peer key
 * is meaningless and is rejected. In practice Moor emits `a` and `k` and leaves `n` out —
 * you name your own contacts, the way a phone works — but the field exists because a card
 * can also be produced by a script or a shop till that does know who it is.
 *
 * ── Why this is the one .mjs file in a folder of .ts ──────────────────────────────────────
 * `lab/t11` imports this exact module. A codec that both the app and its own test agree on
 * only proves something if there is one of it; two implementations that drift is how a QR
 * format quietly stops round-tripping. Bare and Hermes both run plain ESM, TypeScript does
 * not, so plain ESM is the format both can hold.
 *
 * ── Why the parser is hand-rolled ───────────────────────────────────────────────────────
 * `new URL()` and `URLSearchParams` behave differently in Node, in Hermes, and under
 * React Native's polyfill — and this string is the boundary where a stranger's bytes enter
 * your address book. Twenty lines that behave the same everywhere beat a built-in that
 * mostly does.
 */

const SCHEME = 'moor://contact?'

/** Longer than any name worth typing, short enough that a QR stays comfortable to scan. */
const MAX_NAME = 64

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const PEER_KEY = /^[0-9a-fA-F]{64}$/

/**
 * @typedef {object} ContactCard
 * @property {string|null} name     suggested name, or null if the card doesn't claim one
 * @property {string|null} address  EVM address, original casing preserved (EIP-55 checksum)
 * @property {string|null} peerKey  HyperDHT peer key, lowercase hex
 */

/**
 * @param {Partial<ContactCard>} card
 * @returns {string} the string to put in a QR
 */
export function encodeCard ({ name, address, peerKey } = {}) {
  const parts = []
  if (name) parts.push('n=' + encodeURIComponent(String(name).slice(0, MAX_NAME)))
  if (address) parts.push('a=' + address)
  if (peerKey) parts.push('k=' + peerKey)
  if (parts.length === 0) throw new Error('a contact card needs an address or a peer key')
  return SCHEME + parts.join('&')
}

/**
 * Parse whatever the camera read. Returns null for anything that isn't a Moor card, which
 * includes the perfectly valid bare-address QR every other wallet shows — the caller wants
 * to tell the user "that is an address, not a Moor code" rather than half-import it.
 *
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
    // A card that says `k=<mine>&k=<theirs>` is ambiguous, and which one wins would come
    // down to parser trivia. Refuse it rather than pick.
    if (params.has(key)) return null
    params.set(key, pair.slice(eq + 1))
  }

  const rawAddress = params.get('a')
  const rawPeerKey = params.get('k')

  // Present-but-malformed is a corrupt card, not a card without that field. Half-importing
  // it would file someone under an address that is off by a character.
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
      return null // a stray % — the string was mangled somewhere, don't guess at the rest
    }
    // Strip control characters. A name goes straight into the address book and onto
    // a screen; a newline or a right-to-left override in one is somebody playing games.
    name = name.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e]/g, '')
      .trim().slice(0, MAX_NAME)
    if (name === '') name = null
  }

  // Unknown parameters are ignored on purpose: a future field must not make today's app
  // refuse the card outright.
  return { name, address, peerKey }
}

// ── Where the peer key goes once you've scanned it ───────────────────────────────────────
//
// The address book's `address.type` is a closed, runtime-enforced enum of seven payment
// types, so a HyperDHT peer key cannot be stored as an address (SPEC.md finding 2).
// `Contact.username` is free text with a 256-character limit, and 64 hex characters fit.
// The prefix is there so the field stays recognisable if it ever holds anything else.

const USERNAME_PREFIX = 'moor:'

/**
 * @param {string} peerKey
 * @returns {string} the value to store in `Contact.username`
 */
export function encodePeerKey (peerKey) {
  return USERNAME_PREFIX + peerKey
}

/**
 * @param {string|null|undefined} username
 * @returns {string|null} lowercase peer key, or null if this contact carries none
 */
export function decodePeerKey (username) {
  if (typeof username !== 'string' || !username.startsWith(USERNAME_PREFIX)) return null
  const key = username.slice(USERNAME_PREFIX.length).trim().toLowerCase()
  return PEER_KEY.test(key) ? key : null
}
