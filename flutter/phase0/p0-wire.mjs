// The real @moor/pay-requests over pear-wrk-wdk#83's JSON-RPC handler, on a local DHT.
import { mnemonicToSeedSync } from '@scure/bip39'
import { createWire, initialize } from './wire.mjs'

const { PayRequests, createModule } = await import('@moor/pay-requests')
const DHT = (await import('@moor/pay-requests/node_modules/hyperdht/index.js')).default

const PHONE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const ALICE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const MALLORY = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`) }

// Three relays: a bootstrapper alone connects nothing (finding 11).
const { default: getPort } = await import('get-port')
const port = await getPort()
const bootstrapNode = DHT.bootstrapper(port, '127.0.0.1')
await bootstrapNode.ready()
const bootstrap = [{ host: '127.0.0.1', port }]
const relays = []
for (let i = 0; i < 3; i++) {
  const n = new DHT({ bootstrap, ephemeral: false, firewalled: false })
  await n.ready(); relays.push(n)
}

const { call, callModule, nextNotification, notifications } = createWire({
  moduleManagers: { payRequests: { events: [], createModule: (ctx) => createModule(ctx) } },
  allowedModuleMethods: { payRequests: { methods: ['getIdentity', 'setPeers', 'request'] } }
})

try {
  console.log('\n1. workletStart → getSeedAndEntropyFromMnemonic → initializeWDK')
  const init = await initialize(call, PHONE, { payRequests: { bootstrap } })
  init.status === 'initialized' ? pass('module constructed from config') : fail(JSON.stringify(init))

  console.log('\n2. callModule payRequests.getIdentity')
  const t0 = Date.now()
  const { publicKey } = await callModule('payRequests', 'getIdentity')
  const expected = new PayRequests({ seed: mnemonicToSeedSync(PHONE) }).publicKey
  publicKey === expected
    ? pass(`same key lab/ask-phone.js derives, in ${Date.now() - t0}ms`)
    : fail(`got ${publicKey}, expected ${expected}`)

  console.log('\n3. allowedModuleMethods')
  await callModule('payRequests', 'close').then(() => fail('close() allowed'), (e) => pass(`close() refused: ${e.message}`))
  await callModule('nope', 'x').then(() => fail('unknown module accepted'), (e) => pass(`unknown module refused: ${e.message}`))

  console.log('\n4. moduleEvent: worklet → host, unsolicited')
  const alice = new PayRequests({ seed: mnemonicToSeedSync(ALICE), config: { bootstrap }, emit: () => {} })
  const mallory = new PayRequests({ seed: mnemonicToSeedSync(MALLORY), config: { bootstrap }, emit: () => {} })
  await Promise.all([alice.ready(), mallory.ready()])
  await callModule('payRequests', 'setPeers', [[alice.publicKey]])
  pass('setPeers over JSON-RPC')

  await mallory.request({ to: expected, amount: '1' }).then(() => fail('Mallory got through'), (e) => pass(`Mallory refused: ${e.message}`))
  notifications.length === 0 ? pass('nothing leaked for the stranger') : fail(JSON.stringify(notifications))

  const t1 = Date.now()
  const [n] = await Promise.all([nextNotification(), alice.request({ to: expected, amount: '25', note: 'phase 0' })])
  const p = n.params ?? {}
  n.jsonrpc === '2.0' && n.method === 'moduleEvent' && n.id === undefined ? pass('JSON-RPC 2.0 notification, no id') : fail('wrong envelope')
  p.module === 'payRequests' && p.event === 'request' ? pass('params.module / params.event') : fail(JSON.stringify(p))
  p.payload?.from === alice.publicKey ? pass('payload.from is Alice, from the Noise session') : fail(`from: ${p.payload?.from}`)
  p.payload?.amount === '25' && p.payload?.note === 'phase 0' ? pass(`payload intact, in ${Date.now() - t1}ms`) : fail(JSON.stringify(p.payload))

  console.log('\n5. dispose')
  await call('dispose'); pass('dispose')
  await Promise.all([alice.close(), mallory.close()])
} catch (e) {
  fail(`threw: ${e.stack || e.message}`)
} finally {
  for (const n of relays) await n.destroy()
  await bootstrapNode.destroy()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
  process.exit(failures ? 1 : 0)
}
