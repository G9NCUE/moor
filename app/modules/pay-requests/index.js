// Moor — payment requests between two people, with nothing in between.
//
// This is the part no wallet ships. Everything else in Moor is one person with several
// devices, held together by a shared recovery phrase. Here Alice and Bob share nothing:
// different seeds, different books, no account, no server. Alice asks Bob for 25 USD₮ and
// it arrives on his phone.
//
// It runs inside the same Bare worklet as the wallet, loaded through the bundler's
// `modules:` key — the extension point the P2P address book uses, and the reason Moor is
// React Native (see tetherto/wdk-worklet-bundler#46).
//
// ── How Alice finds Bob ──────────────────────────────────────────────────────────────
// She doesn't. There is no directory in a system with no company in it, and any design
// claiming otherwise has smuggled a server in. They exchange a QR code once — the same
// gesture every wallet already uses for addresses — and after that they can reach each
// other forever. Both identities are derived from their own recovery phrases, so nothing
// new has to be stored or backed up.
//
// ── Your contacts are your firewall ──────────────────────────────────────────────────
// The server rejects any connection whose public key isn't in the allowlist the app
// derives from the address book. A stranger cannot send you a payment request: not
// blocked, unroutable. Request spam is the unsolved abuse channel on Venmo, Zelle and
// Cash App, all of which fight it with moderation because their architecture lets
// strangers address you. This one can't be spammed for the same reason it can't be shut
// down.

import HyperDHT from 'hyperdht'
import { deriveSeedKeyPair } from '@tetherto/wdk-utils'
import b4a from 'b4a'

/** Domain separation. The wallet, the address book and this all derive from one seed and
 *  must never collide — different `info`, different identity, provably unrelated keys. */
const SALT = 'moor-pay-requests-v1'
const INFO = 'moor:peer-identity'

const MAX_FRAME = 4096 // a request is a few hundred bytes; anything larger is not a request
const ACK_TIMEOUT = 15_000 // a phone that is on answers in well under a second

export class PayRequests {
  constructor ({ seed, config = {}, emit }) {
    this._emit = typeof emit === 'function' ? emit : () => {}
    this._keyPair = deriveSeedKeyPair(seed, { salt: SALT, info: INFO })
    this._allowed = new Set((config.peers || []).map(normalizeKey).filter(Boolean))
    this._bootstrap = config.bootstrap || undefined
    this._dht = null
    this._server = null
    this._opening = null
    /** peerKey -> live socket. Requests should land instantly, and a wallet has a handful
     *  of contacts, not thousands — so hold the connection rather than dialling each time.
     *  Reconnecting per request also fights the holepuncher, which aborts mid-punch when
     *  you tear a stream down seconds after opening it. */
    this._sockets = new Map()
    /** peerKey -> in-flight dial, so concurrent requests share one. */
    this._dialling = new Map()
    /** request id -> resolver, waiting for the recipient's acknowledgement. */
    this._pending = new Map()
    this._nextId = 0
  }

  /** z-base32/hex public key others use to reach this wallet. Safe to put in a QR. */
  get publicKey () {
    return b4a.toString(this._keyPair.publicKey, 'hex')
  }

  async ready () {
    if (this._opening) return this._opening
    this._opening = (async () => {
      this._dht = new HyperDHT({ keyPair: this._keyPair, bootstrap: this._bootstrap })
      await this._dht.ready()

      this._server = this._dht.createServer({ firewall: this._firewall.bind(this) })
      this._server.on('connection', this._onconnection.bind(this))
      await this._server.listen(this._keyPair)
    })()
    // Clear the cache on failure, and tear down whatever half-opened. A rejected promise
    // left in place would be handed to every later caller, so one bad startup — no network
    // on app launch, say — would keep payment requests dead until the app restarted.
    this._opening.catch(async () => {
      this._opening = null
      const dht = this._dht
      this._dht = this._server = null
      if (dht) await dht.destroy().catch(() => {})
    })
    return this._opening
  }

  /**
   * The firewall runs BEFORE the Noise handshake completes, so an unknown peer is turned
   * away without ever establishing a session. Returning true rejects.
   */
  _firewall (remotePublicKey) {
    return !this._allowed.has(b4a.toString(remotePublicKey, 'hex'))
  }

  /**
   * Newline-delimited JSON off a stream. Both directions speak it: requests one way,
   * acknowledgements the other.
   */
  _readLines (socket, onMessage) {
    let buffered = ''
    socket.on('data', (chunk) => {
      buffered += b4a.toString(chunk, 'utf8')
      if (buffered.length > MAX_FRAME) { socket.destroy(); return }

      let index
      while ((index = buffered.indexOf('\n')) !== -1) {
        const line = buffered.slice(0, index)
        buffered = buffered.slice(index + 1)
        if (!line.trim()) continue

        let message
        try {
          message = JSON.parse(line)
        } catch {
          socket.destroy() // not our protocol
          return
        }
        onMessage(message)
      }
    })
  }

  _onconnection (socket) {
    const from = b4a.toString(socket.remotePublicKey, 'hex')

    socket.setKeepAlive(5000)
    socket.on('error', () => socket.destroy())

    this._readLines(socket, (message) => {
      if (!message || message.type !== 'request') return

      // `from` comes from the authenticated Noise session, never from the payload.
      // A sender cannot claim to be somebody else.
      this._emit('request', {
        from,
        amount: String(message.amount ?? ''),
        note: typeof message.note === 'string' ? message.note.slice(0, 140) : '',
        at: Date.now()
      })

      // Tell the sender it landed. This is what makes `request()` able to resolve
      // truthfully — see the note there.
      socket.write(JSON.stringify({ type: 'ack', id: message.id ?? null }) + '\n')
    })
  }

  // ── host API ───────────────────────────────────────────────────────────────────────

  async getIdentity () {
    await this.ready()
    return { publicKey: this.publicKey }
  }

  /** Replace the allowlist. The app derives this from the address book. */
  async setPeers (peers = []) {
    this._allowed = new Set((peers || []).map(normalizeKey).filter(Boolean))
    return { count: this._allowed.size }
  }

  /**
   * Ask one peer for money. Resolves once their app has acknowledged the request — which
   * means delivered to a phone that is on, not that anyone agreed to pay.
   *
   * Fails if the peer is offline. That is honest rather than convenient: making it durable
   * is Phase 5, and pretending otherwise would be the kind of quiet lie this project keeps
   * finding in other people's wallets.
   */
  async request ({ to, amount, note = '' }) {
    await this.ready()
    const key = normalizeKey(to)
    if (!key) throw new Error('a payment request needs a peer key')
    if (!/^\d+(\.\d+)?$/.test(String(amount))) throw new Error('amount must be a positive number')

    const socket = await this._socketFor(key)
    const id = String(++this._nextId)

    /**
     * Resolve only when the RECIPIENT says it has the request.
     *
     * Writing is not delivering. `socket.write()` queues, and draining the Noise stream
     * doesn't get you much further — this was measured on a real device: the phone accepted
     * the connection and received zero bytes, because the sender closed the socket
     * immediately after a "successful" write. Both layers had reported success.
     *
     * So the receiver acknowledges, and `request()` waits for that. The word "delivered"
     * then means what a person would assume it means.
     */
    const acked = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new Error('the request was sent but never acknowledged'))
      }, ACK_TIMEOUT)
      this._pending.set(id, () => { clearTimeout(timer); resolve() })
    })

    socket.write(JSON.stringify({
      type: 'request',
      id,
      amount: String(amount),
      note: String(note).slice(0, 140)
    }) + '\n')

    await acked
    return { ok: true, to: key }
  }

  /** Open (or reuse) an authenticated stream to a peer. */
  async _socketFor (key) {
    const existing = this._sockets.get(key)
    if (existing && !existing.destroyed) return existing

    // Two requests to the same peer at once must share one dial, not race and leak the
    // loser's connection.
    const pending = this._dialling.get(key)
    if (pending) return pending

    const socket = this._dht.connect(b4a.from(key, 'hex'), { keyPair: this._keyPair })

    // A permanent error sink, attached before anything can fail. These streams emit errors
    // routinely during teardown, and an unhandled 'error' on a stream takes the whole
    // process down — which inside a worklet means the wallet, not just the request.
    socket.on('error', () => {})
    socket.on('close', () => {
      if (this._sockets.get(key) === socket) this._sockets.delete(key)
    })

    this._readLines(socket, (message) => {
      if (!message || message.type !== 'ack') return
      const resolve = this._pending.get(message.id)
      if (resolve) { this._pending.delete(message.id); resolve() }
    })

    this._sockets.set(key, socket)

    const dial = waitForOpen(socket).then(
      () => socket,
      (err) => {
        this._sockets.delete(key)
        socket.destroy()
        throw err
      }
    )
    this._dialling.set(key, dial)
    try {
      return await dial
    } finally {
      this._dialling.delete(key)
    }
  }

  async close () {
    for (const socket of this._sockets.values()) {
      try { socket.destroy() } catch {}
    }
    this._sockets.clear()
    this._dialling.clear()
    this._pending.clear()
    try { if (this._server) await this._server.close() } catch {}
    try { if (this._dht) await this._dht.destroy() } catch {}
    this._server = null
    this._dht = null
    this._opening = null
  }
}

function normalizeKey (value) {
  if (!value) return null
  if (typeof value !== 'string') return b4a.toString(value, 'hex')
  const trimmed = value.trim().replace(/^moor:/, '')
  return /^[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null
}

function waitForOpen (socket) {
  return new Promise((resolve, reject) => {
    const onOpen = () => { cleanup(); resolve() }
    const onError = (err) => { cleanup(); reject(err) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('peer did not answer — they may be offline')) }, 15_000)
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeListener('open', onOpen)
      socket.removeListener('error', onError)
    }
    socket.once('open', onOpen)
    socket.once('error', onError)
  })
}

/**
 * The bundler's module contract: createModule({ seed, config, capabilities, emit }).
 *
 * Deliberately does NOT await ready(). The worklet runtime constructs every module during
 * WDK init and the seed must be consumed synchronously — which the constructor does — but
 * announcing on the public DHT takes several seconds, and awaiting it here would hold up
 * app startup by that much. Worse, the runtime records a construction failure permanently:
 * one launch with no network and the module reports "failed to initialize" for the rest of
 * the process. Every method awaits ready() on its own, so the first call opens the DHT and
 * a failure is retried on the next one.
 *
 * There is no default export on purpose: the generated worklet does
 * `const M = Raw.default || Raw` and then `M.createModule(ctx)`, so a default export of the
 * class would shadow the namespace and lose the factory.
 */
export async function createModule (ctx) {
  return new PayRequests(ctx)
}
