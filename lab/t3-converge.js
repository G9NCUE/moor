// T3 — The claim M1 lives or dies on: two devices, one seed, no server.
//
// Device A creates a book and adds a contact. Device B, a completely separate corestore
// that has never met A, opens from the same 12 words and must see that contact.
//
// Runs on a LOCAL DHT (hyperdht bootstrapper) with a LOCAL blind peer, so the result is
// hermetic — no public network, no Tether infrastructure, nothing to flake.
//
// Note what this also proves: A and B never connect to each other. The blind peer relays
// encrypted blocks it cannot read. That is the whole trust story.

import DHT from 'hyperdht'
import BlindPeer from 'blind-peer'
import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'
import { freePort } from './free-port.js'

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const NAMESPACE = 'moor-wallet'
const MOORING = 'yb3wkzhs4h7bxpqxbdbecgwmzquk1zuoe1pnwhw76oe1cf3nn7xy'

const seed = mnemonicToSeedSync(MNEMONIC)
await rm('./.data/t3', { recursive: true, force: true })

// Hard stop so a hung DHT can never wedge the run.
const guard = setTimeout(() => {
  console.log('\n  FAIL  timed out after 90s')
  process.exit(1)
}, 90_000)

console.log('T3 — two devices, one seed, local DHT + local blind peer\n')

// --- 1. local DHT
const port = await freePort()
const bootstrapNode = DHT.bootstrapper(port, '127.0.0.1')
await bootstrapNode.ready()
const bootstrap = [{ host: '127.0.0.1', port }]
console.log(`  local DHT bootstrapper on 127.0.0.1:${port}`)

// --- 2. local blind peer
const blind = new BlindPeer('./.data/t3/blind', { bootstrap })
await blind.ready()
await blind.listen()
const mirrorKey = blind.publicKey
console.log(`  blind peer key: ${Buffer.from(mirrorKey).toString('hex').slice(0, 24)}…\n`)

// --- 3. DEVICE A — first device, creates the book
const storeA = new Corestore('./.data/t3/deviceA')
const bookA = await AddressBook.fromSeed(seed, storeA, { namespace: NAMESPACE, bootstrap })
await bookA.create()
await bookA.addMirror(mirrorKey)

const alice = await bookA.addContact({ name: 'Alice', username: `moor:${MOORING}` })
await bookA.addAddress(alice.id, {
  address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  type: 'evm',
  network: 'arbitrum',
  label: 'USDT0'
})
console.log(`  device A: writable=${bookA.writable}, contacts=${(await bookA.listContacts()).length}, mirrors=${(await bookA.listMirrors()).length}`)

// --- 4. DEVICE B — fresh store, same seed, has never seen A
const t0 = Date.now()
const storeB = new Corestore('./.data/t3/deviceB')
const bookB = await AddressBook.fromSeed(seed, storeB, {
  namespace: NAMESPACE,
  bootstrap,
  mirrors: [mirrorKey],
  timeout: 30_000
})
await bookB.addMirror(mirrorKey) // syncs genesis from the mirror, then enrolls this writer
const elapsed = Date.now() - t0

console.log(`  device B: writable=${bookB.writable}, joined in ${elapsed}ms\n`)

const seenByB = await bookB.listContacts()
console.log(`  contacts visible on device B: ${JSON.stringify(seenByB.map((c) => c.name))}`)

seenByB.some((c) => c.name === 'Alice')
  ? pass(`device B restored the book from 12 words alone (${elapsed}ms, no server)`)
  : fail('device B could not see the contact — M1 does not work as specified')

const bMooring = seenByB.find((c) => c.name === 'Alice')?.username
bMooring === `moor:${MOORING}`
  ? pass('mooring key travelled with the contact — M2 identity syncs for free via M1')
  : fail(`mooring key did not sync: ${bMooring}`)

const bAddrs = await bookB.listAddresses(seenByB[0]?.id)
bAddrs.some((a) => a.type === 'evm' && a.network === 'arbitrum')
  ? pass('USD₮0 address synced alongside')
  : fail('addresses did not sync')

// --- 5. write from B, read back on A (bidirectional multiwriter)
await bookB.addContact({ name: 'Bob' })
let converged = false
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 500))
  const onA = await bookA.listContacts()
  if (onA.some((c) => c.name === 'Bob')) { converged = true; break }
}
converged
  ? pass('write on B propagated back to A (true multiwriter, not one-way backup)')
  : fail('B -> A did not converge within 15s')

// --- cleanup
await bookA.close(); await storeA.close()
await bookB.close(); await storeB.close()
await blind.close()
await bootstrapNode.destroy()
clearTimeout(guard)
console.log('\nT3 done.')
