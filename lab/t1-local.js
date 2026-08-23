// T1: the address book works offline on one device. Proves fromSeed -> create() gives a
// writable book, and that address.type is a closed enum (finding 2).

import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'

import { encodePeerKey, decodePeerKey } from '../app/src/wdk/contactCard.mjs'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const STORAGE = './.data/t1'

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

await rm(STORAGE, { recursive: true, force: true })

const seed = mnemonicToSeedSync(MNEMONIC) // 64 bytes
console.log(`seed: ${seed.length} bytes, ${Buffer.from(seed.slice(0, 8)).toString('hex')}…\n`)

const store = new Corestore(STORAGE)
const t0 = Date.now()

const book = await AddressBook.fromSeed(seed, store, {
  namespace: 'moor-wallet',
  replicate: false // stay strictly offline for this test
})

console.log(`T1 — local, offline (open took ${Date.now() - t0}ms)`)
console.log(`  autobaseKey: ${Buffer.from(book.key).toString('hex')}`)
console.log(`  writable after fromSeed(): ${book.writable}   <-- read-only, per source`)

// Finding 1: fromSeed() is read-only. create() for a new book, addMirror() to join one.
await book.create()
console.log(`  writable after create():   ${book.writable}\n`)

book.writable ? pass('create() enrolls the first device as a writer, offline') : fail('still not writable after create()')

// --- event listener before any write
let updates = 0
book.on('update', () => { updates++ })

// --- claim 2: contacts round-trip
const alice = await book.addContact({ name: 'Alice', username: 'alice' })
const contacts = await book.listContacts()
contacts.length === 1 && contacts[0].name === 'Alice'
  ? pass('addContact / listContacts round-trip')
  : fail(`expected 1 contact named Alice, got ${JSON.stringify(contacts)}`)

// --- claim 3: THE ONE THAT MATTERS — is `type` enforced?
await book.addAddress(alice.id, {
  address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  type: 'evm',
  network: 'arbitrum',
  label: 'USDT0'
})

// Finding 2: `type` is a closed enum (index.js:41, enforced at :569). No hyperdht member.
let rejected = null
try {
  await book.addAddress(alice.id, {
    address: 'yb3wkzhs4h7bxpqxbdbecgwmzquk1zuoe1pnwhw76oe1cf3nn7xy',
    type: 'moor-peer',
    network: 'hyperdht'
  })
} catch (err) {
  rejected = err.message
}
rejected
  ? pass(`address type enum is closed — "${rejected}" (expected; drives the M2 workaround)`)
  : fail('expected the closed enum to reject an unknown type, but it accepted one')

// Workaround: the key rides in Contact.username (free text, 256 chars) and syncs with the book.
//
// The app's own encoder, not a literal: an earlier literal described a format nothing shipped.
const MOORING = 'f'.repeat(64)
const bob = await book.addContact({ name: 'Bob', username: encodePeerKey(MOORING) })
const bobBack = await book.getContact(bob.id)
const stored = encodePeerKey(MOORING)

bobBack?.username === stored && decodePeerKey(bobBack.username) === MOORING
  ? pass(`mooring key round-trips in Contact.username (${stored.length} chars of the 256 limit)`)
  : fail(`username workaround failed: ${JSON.stringify(bobBack)}`)

const addrs = await book.listAddresses(alice.id)
console.log(`  stored addresses: ${addrs.map((a) => `${a.type}/${a.network}`).join(', ')}`)

// --- claim 4: update event
await new Promise((r) => setTimeout(r, 200))
updates > 0 ? pass(`'update' fired (${updates}x)`) : fail("'update' never fired")

// --- search, since the UI will need it
const found = await book.search('ali')
found.length === 1 ? pass('search() matches partial name') : fail(`search returned ${found.length}`)

console.log(`  contacts: ${(await book.listContacts()).map((c) => c.name).join(', ')}`)

await book.close()
await store.close()
console.log('\nT1 done.')
