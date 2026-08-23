// pear-wrk-wdk#83's JSON-RPC handler on a fake IPC: the frames a native host speaks, in Node.
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
require('../pear/test/setup.js') // bare-crypto shim, as the PR's tests do
const { registerJsonRpcHandlers } = require('../pear/src/jsonrpc-handlers')

class MockWDK {
  constructor (seed) { this.seed = seed; this.wallets = {} }
  registerWallet (n, m, c) { this.wallets[n] = { m, c } }
  dispose () { this.wallets = {} }
}

export function createWire ({ moduleManagers, allowedModuleMethods }) {
  const emitter = new EventEmitter()
  const responses = new Map()
  const notifications = []
  const waiters = []
  const ipc = {
    on: emitter.on.bind(emitter),
    write: (buf) => {
      const msg = JSON.parse(buf.subarray(4, 4 + buf.readUInt32BE(0)).toString())
      if (msg.id != null) { responses.get(msg.id)?.(msg); responses.delete(msg.id); return }
      notifications.push(msg)
      waiters.splice(0).forEach((r) => r(msg))
    }
  }
  let wdk = null
  registerJsonRpcHandlers(ipc, {
    WDK: MockWDK,
    walletManagers: { arbitrum: {} },
    protocolManagers: {},
    moduleManagers,
    allowedMethods: {},
    allowedModuleMethods,
    wdkLoadError: null,
    get wdk () { return wdk },
    set wdk (v) { wdk = v }
  })

  let nextId = 0
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const t = setTimeout(() => reject(new Error(`timeout: ${method}`)), 20_000)
    responses.set(id, (msg) => {
      clearTimeout(t)
      msg.error ? reject(Object.assign(new Error(msg.error.message), msg.error)) : resolve(msg.result)
    })
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    const head = Buffer.allocUnsafe(4); head.writeUInt32BE(body.length, 0)
    emitter.emit('data', Buffer.concat([head, body]))
  })
  const callModule = (module, method, args = []) =>
    call('callModule', { module, method, args: JSON.stringify(args) }).then((r) => r.result)
  const nextNotification = () => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout: notification')), 20_000)
    waiters.push((m) => { clearTimeout(t); resolve(m) })
  })

  return { call, callModule, nextNotification, notifications }
}

export async function initialize (call, mnemonic, modules) {
  await call('workletStart')
  const seed = await call('getSeedAndEntropyFromMnemonic', { mnemonic })
  return call('initializeWDK', {
    encryptionKey: seed.encryptionKey,
    encryptedSeed: seed.encryptedSeedBuffer,
    config: JSON.stringify({ networks: { arbitrum: { blockchain: 'arbitrum', config: {} } }, modules })
  })
}
