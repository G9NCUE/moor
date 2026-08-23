// Tether's P2P address book over the JSON-RPC transport, which no consumer has done.
// Local only: no mirror. The mirror run is on the device, against lab/seed-contact.js.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWire, initialize } from './wire.mjs'

const AddressBook = (await import('@tetherto/wdk-p2p-address-book')).default
const PHONE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const storagePath = mkdtempSync(join(tmpdir(), 'a-wire-'))

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`) }

const { call, callModule, nextNotification } = createWire({
  moduleManagers: { addressBook: { events: ['update'], createModule: (ctx) => AddressBook.createWorkletModule(ctx) } },
  allowedModuleMethods: { addressBook: { methods: ['getInfo', 'create', 'addContact', 'listContacts', 'addAddress', 'listAddresses', 'search', 'listMirrors'] } }
})

try {
  const init = await initialize(call, PHONE, { addressBook: { namespace: 'moor-wallet', mirrors: [], storagePath } })
  init.status === 'initialized' ? pass('address book constructed from config') : fail(JSON.stringify(init))

  const info = await callModule('addressBook', 'getInfo')
  info.writable === false ? pass('fromSeed() is read-only until enrolled (finding 1)') : fail(JSON.stringify(info))

  const [update] = await Promise.all([nextNotification(), callModule('addressBook', 'create')])
  update.params?.module === 'addressBook' && update.params?.event === 'update'
    ? pass('create() enrols and the update event arrives as a notification')
    : fail(JSON.stringify(update))
  ;(await callModule('addressBook', 'getInfo')).writable ? pass('writable after create()') : fail('still read-only')

  const t0 = Date.now()
  const [n, alice] = await Promise.all([nextNotification(), callModule('addressBook', 'addContact', [{ name: 'Alice' }])])
  alice.id && n.params?.event === 'update' ? pass(`addContact, update in ${Date.now() - t0}ms`) : fail(JSON.stringify({ alice, n }))

  await callModule('addressBook', 'addAddress', [alice.id, { address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', type: 'evm', network: 'arbitrum' }])
  const contacts = await callModule('addressBook', 'listContacts')
  const addresses = await callModule('addressBook', 'listAddresses', [alice.id])
  contacts.length === 1 && addresses.length === 1 ? pass('contact and address read back') : fail(JSON.stringify({ contacts, addresses }))

  await callModule('addressBook', 'addAddress', [alice.id, { address: 'x', type: 'hyperdht', network: 'hyperdht' }])
    .then(() => fail('hyperdht type accepted on beta.3'), (e) => pass(`closed enum over the wire: ${e.message}`))

  await callModule('addressBook', 'deleteContact', [alice.id]).then(() => fail('deleteContact allowed'), () => pass('allow-list holds'))

  await call('dispose'); pass('dispose')
} catch (e) {
  fail(`threw: ${e.stack || e.message}`)
} finally {
  rmSync(storagePath, { recursive: true, force: true })
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
  process.exit(failures ? 1 : 0)
}
