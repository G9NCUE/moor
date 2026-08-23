// Phase 0, extended: drive pear-wrk-wdk#83's JSON-RPC handler with the REAL @moor/pay-requests
// module over a fake IPC, in Node. No Android, no BareKit. This is the exact byte stream a
// Flutter host would speak, so whatever passes here is plumbing the host still has to do, and
// whatever fails here is not the host's fault.
//
// Local DHT, t8's recipe: a bootstrapper alone cannot connect anything (finding 11).

import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { mnemonicToSeedSync } from '@scure/bip39'

const require = createRequire(import.meta.url)
const PEAR = '../pear/' // clone of localhost41/pear-wrk-wdk#feat/jsonrpc-modules, see README
require(PEAR + 'test/setup.js') // bare-crypto -> node:crypto shim, as the PR's own tests do
const { registerJsonRpcHandlers } = require(PEAR + 'src/jsonrpc-handlers')

const { PayRequests, createModule } = await import('@moor/pay-requests')
const DHT = (await import('@moor/pay-requests/node_modules/hyperdht/index.js')).default

const PHONE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const ALICE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const MALLORY = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`) }
const step = (m) => console.log(`\n${m}`)

// ── local DHT ──────────────────────────────────────────────────────────────────────────────
const { default: getPort } = await import('get-port').catch(() => ({ default: async () => 49737 }))
const port = await getPort()
const bootstrapNode = DHT.bootstrapper(port, '127.0.0.1')
await bootstrapNode.ready()
const bootstrap = [{ host: '127.0.0.1', port }]
const relays = []
for (let i = 0; i < 3; i++) {
  const n = new DHT({ bootstrap, ephemeral: false, firewalled: false })
  await n.ready(); relays.push(n)
}
console.log(`local DHT: 1 bootstrapper + ${relays.length} relays on :${port}`)

// ── fake IPC: the byte stream a Flutter host would read and write ──────────────────────────
const emitter = new EventEmitter()
const responses = new Map() // id -> resolver
const notifications = []
const notificationWaiters = []
const ipc = {
  on: emitter.on.bind(emitter),
  write: (buf) => {
    const len = buf.readUInt32BE(0)
    const msg = JSON.parse(buf.subarray(4, 4 + len).toString())
    if (msg.id != null) { responses.get(msg.id)?.(msg); responses.delete(msg.id) } else {
      notifications.push(msg)
      notificationWaiters.splice(0).forEach((r) => r(msg))
    }
  }
}
const frame = (obj) => {
  const body = Buffer.from(JSON.stringify(obj))
  const head = Buffer.allocUnsafe(4); head.writeUInt32BE(body.length, 0)
  return Buffer.concat([head, body])
}
let nextId = 0
function call (method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${method}`)), 20_000)
    responses.set(id, (msg) => { clearTimeout(t); msg.error ? reject(Object.assign(new Error(msg.error.message), msg.error)) : resolve(msg.result) })
    emitter.emit('data', frame({ jsonrpc: '2.0', id, method, params }))
  })
}
const callModule = (module, method, args = []) => call('callModule', { module, method, args: JSON.stringify(args) }).then((r) => r.result)
const nextNotification = () => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout: notification')), 20_000)
  notificationWaiters.push((m) => { clearTimeout(t); resolve(m) })
})

// ── context: what the generated entry builds, minus real WDK ───────────────────────────────
class MockWDK {
  constructor (seed) { this.seed = seed; this.wallets = {} }
  registerWallet (n, m, c) { this.wallets[n] = { m, c } }
  dispose () { this.wallets = {} }
}
let wdk = null
const context = {
  WDK: MockWDK,
  walletManagers: { arbitrum: {} },
  protocolManagers: {},
  moduleManagers: { payRequests: { events: [], createModule: (ctx) => createModule(ctx) } },
  allowedMethods: {},
  allowedModuleMethods: { payRequests: { methods: ['getIdentity', 'setPeers', 'request'] } },
  wdkLoadError: null,
  get wdk () { return wdk }, set wdk (v) { wdk = v }
}
registerJsonRpcHandlers(ipc, context)

try {
  // ── 1. the sequence a host must send ───────────────────────────────────────────────────
  step('1. workletStart → getSeedAndEntropyFromMnemonic → initializeWDK')
  const started = await call('workletStart')
  started.status === 'started' ? pass('workletStart') : fail(`workletStart: ${JSON.stringify(started)}`)

  const seedData = await call('getSeedAndEntropyFromMnemonic', { mnemonic: PHONE })
  seedData.encryptionKey && seedData.encryptedSeedBuffer ? pass('seed derived and encrypted in the worklet') : fail('no seed data')

  const init = await call('initializeWDK', {
    encryptionKey: seedData.encryptionKey,
    encryptedSeed: seedData.encryptedSeedBuffer,
    config: JSON.stringify({
      networks: { arbitrum: { blockchain: 'arbitrum', config: {} } },
      modules: { payRequests: { bootstrap } }
    })
  })
  init.status === 'initialized' ? pass('initializeWDK constructed the module from config') : fail(`init: ${JSON.stringify(init)}`)

  // ── 2. callModule, and is it the same identity the lab derives? ─────────────────────────
  step('2. callModule payRequests.getIdentity')
  const t0 = Date.now()
  const identity = await callModule('payRequests', 'getIdentity')
  const expected = new PayRequests({ seed: mnemonicToSeedSync(PHONE) }).publicKey
  console.log(`  identity ${JSON.stringify(identity)} in ${Date.now() - t0}ms`)
  const got = typeof identity === 'string' ? identity : identity?.publicKey ?? identity?.key
  got === expected
    ? pass('peer key over JSON-RPC equals the key lab/ask-phone.js derives from the same mnemonic')
    : fail(`identity mismatch: got ${got}, expected ${expected}`)

  // ── 3. the allow-list is enforced on this transport ─────────────────────────────────────
  step('3. allowedModuleMethods')
  await callModule('payRequests', 'close').then(
    () => fail('close() is not allow-listed and should have been refused'),
    (e) => pass(`close() refused: ${e.message}`))
  await callModule('nope', 'x').then(
    () => fail('unknown module accepted'),
    (e) => pass(`unknown module refused: ${e.message}`))

  // ── 4. the event: a stranger is refused, a contact's request arrives as a notification ──
  step('4. moduleEvent: worklet → host, unsolicited')
  const alice = new PayRequests({ seed: mnemonicToSeedSync(ALICE), config: { bootstrap }, emit: () => {} })
  const mallory = new PayRequests({ seed: mnemonicToSeedSync(MALLORY), config: { bootstrap }, emit: () => {} })
  await Promise.all([alice.ready(), mallory.ready()])

  await callModule('payRequests', 'setPeers', [[alice.publicKey]])
  pass('setPeers over JSON-RPC (Alice allowed, Mallory not)')

  await mallory.request({ to: expected, amount: '1' }).then(
    () => fail('Mallory got through'),
    (e) => pass(`Mallory refused: ${e.message}`))
  notifications.length === 0 ? pass('no notification leaked for the refused stranger') : fail(`unexpected notifications: ${JSON.stringify(notifications)}`)

  const t1 = Date.now()
  const [notification] = await Promise.all([nextNotification(), alice.request({ to: expected, amount: '25', note: 'phase 0' })])
  const ms = Date.now() - t1
  console.log(`  ${JSON.stringify(notification)}`)
  notification.jsonrpc === '2.0' && notification.method === 'moduleEvent' && notification.id === undefined
    ? pass('arrived as a JSON-RPC 2.0 notification with no id (the frame a Kotlin host currently drops)')
    : fail('wrong envelope')
  const p = notification.params ?? {}
  p.module === 'payRequests' && p.event === 'request' ? pass('params.module / params.event') : fail(`params: ${JSON.stringify(p)}`)
  p.payload?.from === alice.publicKey ? pass('payload.from is Alice, from the Noise session') : fail(`from: ${p.payload?.from}`)
  p.payload?.amount === '25' && p.payload?.note === 'phase 0' ? pass(`payload intact, not double-encoded, in ${ms}ms`) : fail(`payload: ${JSON.stringify(p.payload)}`)

  // ── 5. dispose ──────────────────────────────────────────────────────────────────────────
  step('5. dispose')
  await call('dispose')
  pass('dispose')

  await Promise.all([alice.close(), mallory.close()])
} catch (e) {
  fail(`threw: ${e.stack || e.message}`)
} finally {
  for (const n of relays) await n.destroy()
  await bootstrapNode.destroy()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
  process.exit(failures ? 1 : 0)
}
