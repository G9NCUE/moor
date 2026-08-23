// Payment requests between two people with nothing in between. Different seeds, no account,
// no server: they exchange a QR once, then reach each other directly over HyperDHT. The
// allowlist the app derives from the address book is the firewall: a stranger is not
// blocked, they are unroutable. Loaded into the wallet's worklet through `modules:`.

import HyperDHT from 'hyperdht'
import { deriveSeedKeyPair } from '@tetherto/wdk-utils'
import b4a from 'b4a'

// Domain separation from the wallet and the address book, which derive from the same seed.
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
    // peerKey -> live socket. Held open: redialling per request fights the holepuncher.
    this._sockets = new Map()
    // peerKey -> in-flight dial
    this._dialling = new Map()
    // request id -> resolver
    this._pending = new Map()
    this._nextId = 0
  }

  /** Hex public key others reach this wallet at. Safe in a QR. */
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
    // A cached rejection would be handed to every later caller; clear it so the next call retries.
    this._opening.catch(async () => {
      this._opening = null
      const dht = this._dht
      this._dht = this._server = null
      if (dht) await dht.destroy().catch(() => {})
    })
    return this._opening
  }

  /** Runs before the Noise handshake completes. Returning true rejects. */
  _firewall (remotePublicKey) {
    return !this._allowed.has(b4a.toString(remotePublicKey, 'hex'))
  }

  /** Newline-delimited JSON, both directions. */
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

      // `from` is the authenticated session's key, never the payload's.
      this._emit('request', {
        from,
        amount: String(message.amount ?? ''),
        note: typeof message.note === 'string' ? message.note.slice(0, 140) : '',
        at: Date.now()
      })

      // The ack is what `request()` resolves on.
      socket.write(JSON.stringify({ type: 'ack', id: message.id ?? null }) + '\n')
    })
  }

  // host API

  async getIdentity () {
    await this.ready()
    return { publicKey: this.publicKey }
  }

  /** Replace the allowlist. */
  async setPeers (peers = []) {
    this._allowed = new Set((peers || []).map(normalizeKey).filter(Boolean))
    return { count: this._allowed.size }
  }

  /** Resolves once the peer's app acknowledged. Fails if they are offline; durable is Phase 5. */
  async request ({ to, amount, note = '' }) {
    await this.ready()
    const key = normalizeKey(to)
    if (!key) throw new Error('a payment request needs a peer key')
    if (!/^\d+(\.\d+)?$/.test(String(amount))) throw new Error('amount must be a positive number')

    const socket = await this._socketFor(key)
    const id = String(++this._nextId)

    // Writing is not delivering: on a real device the phone accepted the connection and
    // received zero bytes after a "successful" write. Wait for the receiver's ack.
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

  /** Open or reuse an authenticated stream. */
  async _socketFor (key) {
    const existing = this._sockets.get(key)
    if (existing && !existing.destroyed) return existing

    // Concurrent requests to one peer share a dial.
    const pending = this._dialling.get(key)
    if (pending) return pending

    const socket = this._dht.connect(b4a.from(key, 'hex'), { keyPair: this._keyPair })

    // An unhandled stream 'error' takes the worklet, and so the wallet, down.
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

// The bundler's contract: createModule({ seed, config, capabilities, emit }). Does not await
// ready(): the runtime records a construction failure permanently, so one launch without
// network would kill requests until restart. Each method awaits ready() itself. No default
// export: the generated entry does `Raw.default || Raw`, which would shadow the factory.
export async function createModule (ctx) {
  return new PayRequests(ctx)
}
