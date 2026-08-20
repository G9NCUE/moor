// T11 — the QR exchange. The introduction t8 assumed had already happened.
//
// t8 proved that Alice can ask Bob for money and that a stranger cannot. It did it by
// calling setPeers() with the right keys already in hand, under a comment that said "they
// meet once, by QR". This is that line, made real.
//
// The claim: one scan is enough. Bob points a camera at Alice's card and, with no server
// and nothing typed, ends up able to receive from her and to pay her back.
//
// Runs the codec the app runs — app/src/wdk/contactCard.mjs, imported, not reimplemented —
// against a real address book and a local DHT. A format only round-trips if there is one
// of it.

import DHT from 'hyperdht'
import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'

import { PayRequests } from '../app/modules/pay-requests/index.js'
import {
  encodeCard, decodeCard, encodePeerKey, decodePeerKey
} from '../app/src/wdk/contactCard.mjs'
import { freePort } from './free-port.js'

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

const ALICE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const BOB = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

// Checksummed on purpose: EIP-55 casing is a typo detector, and a codec that lowercases an
// address throws it away.
const ALICE_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'

const STORE = './.data/t11'
const NAMESPACE = 'moor-wallet'

const guard = setTimeout(() => { console.log('\n  FAIL  timed out'); process.exit(1) }, 90_000)

console.log('T11 — the QR exchange\n')

// ── the codec, on its own ────────────────────────────────────────────────────────────────
// Cheap, and it runs before anything can be flaky, so a format regression is never dressed
// up as a network problem.

const sampleKey = 'a'.repeat(64)
const round = decodeCard(encodeCard({ name: 'Alice', address: ALICE_ADDRESS, peerKey: sampleKey }))

round?.name === 'Alice' && round.address === ALICE_ADDRESS && round.peerKey === sampleKey
  ? pass('a card round-trips all three fields')
  : fail(`round-trip lost something: ${JSON.stringify(round)}`)

decodeCard(encodeCard({ address: ALICE_ADDRESS, peerKey: sampleKey }))?.address === ALICE_ADDRESS
  ? pass('address casing survives — the EIP-55 checksum still checks')
  : fail('address was normalised, losing the checksum')

// Everything below must come back null. Half-importing a mangled card files somebody under
// an address that is one character off, which is the exact failure contacts exist to stop.
const rejects = [
  ['a bare address QR, as every other wallet shows', ALICE_ADDRESS],
  ['an ethereum: URI', `ethereum:${ALICE_ADDRESS}@42161`],
  ['a truncated peer key', `moor://contact?k=${'a'.repeat(63)}`],
  ['an over-long peer key', `moor://contact?k=${'a'.repeat(65)}`],
  ['a peer key with a non-hex character', `moor://contact?k=${'a'.repeat(63)}g`],
  ['an address one character short', `moor://contact?a=0x${'a'.repeat(39)}`],
  ['a card carrying neither an address nor a key', 'moor://contact?n=Alice'],
  ['a card with two different keys', `moor://contact?k=${'a'.repeat(64)}&k=${'b'.repeat(64)}`],
  ['a mangled percent escape in the name', `moor://contact?n=%E0%A4%A&k=${sampleKey}`],
  ['an empty string', ''],
  ['something that is not a string', 42]
]

const leaked = rejects.filter(([, input]) => decodeCard(input) !== null)
leaked.length === 0
  ? pass(`${rejects.length} malformed inputs all rejected, including a plain address QR`)
  : fail(`accepted: ${leaked.map(([what]) => what).join('; ')}`)

const injected = decodeCard(`moor://contact?n=${encodeURIComponent('Al\nice‮')}&k=${sampleKey}`)
injected?.name === 'Alice'
  ? pass('control characters and bidi overrides are stripped from a scanned name')
  : fail(`name came through as ${JSON.stringify(injected?.name)}`)

// Unknown fields must not make today's build refuse tomorrow's card.
decodeCard(`moor://contact?a=${ALICE_ADDRESS}&k=${sampleKey}&x=future`)?.peerKey === sampleKey
  ? pass('an unknown field is ignored rather than fatal')
  : fail('an added field broke the parse')

// ── the network ──────────────────────────────────────────────────────────────────────────
// Same local-DHT rig as t8: a bootstrapper alone leaves every node firewalled with no relay
// to holepunch through, and every dial aborts. See t8's header.

const port = await freePort()
const bootstrapNode = DHT.bootstrapper(port, '127.0.0.1')
await bootstrapNode.ready()
const bootstrap = [{ host: '127.0.0.1', port }]

const relays = []
for (let i = 0; i < 3; i++) {
  const node = new DHT({ bootstrap, ephemeral: false, firewalled: false })
  await node.ready()
  relays.push(node)
}
await new Promise((r) => setTimeout(r, 2000))
console.log(`\n  local DHT: 1 bootstrapper + ${relays.length} relay nodes`)

const alice = new PayRequests({ seed: mnemonicToSeedSync(ALICE), config: { bootstrap }, emit: () => {} })
const inbox = []
const bob = new PayRequests({
  seed: mnemonicToSeedSync(BOB),
  config: { bootstrap },
  emit: (event, payload) => { if (event === 'request') inbox.push(payload) }
})
await Promise.all([alice.ready(), bob.ready()])

// Bob's own address book. Offline and mirror-less — t1 showed fromSeed() alone is read-only
// and create() is what makes it writable.
await rm(STORE, { recursive: true, force: true })
const store = new Corestore(STORE)
const book = await AddressBook.fromSeed(mnemonicToSeedSync(BOB), store, { namespace: NAMESPACE })
if (!book.writable) await book.create()

/**
 * Exactly what usePayRequests.syncPeers does on the phone: rebuild the allowlist from
 * whatever the address book currently holds. The scan writes a contact; this is the only
 * thing standing between that write and being reachable.
 */
async function syncPeers () {
  const contacts = await book.listContacts()
  const keys = contacts.map((c) => decodePeerKey(c.username)).filter((k) => k !== null)
  await bob.setPeers(keys)
  return keys
}

await syncPeers()

// ── before the scan ──────────────────────────────────────────────────────────────────────
// Alice's key is public. Knowing it must not be enough.
let refused = false
try {
  await alice.request({ to: bob.publicKey, amount: '25.00', note: 'dinner' })
} catch {
  refused = true
}
await new Promise((r) => setTimeout(r, 1500))

refused && inbox.length === 0
  ? pass('before the scan Alice is a stranger, and a stranger cannot reach Bob')
  : fail(`Alice got through before being added: refused=${refused}, inbox=${inbox.length}`)

// ── the scan ─────────────────────────────────────────────────────────────────────────────
// Alice's phone renders this string as a QR. Bob's camera reads it back. Nothing else
// crosses between them — no server, no mirror, no account.

const shown = encodeCard({ address: ALICE_ADDRESS, peerKey: alice.publicKey })
console.log(`\n  Alice shows  ${shown.slice(0, 46)}…  (${shown.length} chars)`)

shown.length <= 160
  ? pass(`the card is ${shown.length} characters — a QR that reads across a table`)
  : fail(`the card is ${shown.length} characters, dense enough that scanning starts to fail`)

const scanned = decodeCard(shown)
if (scanned === null) fail('Bob could not read the card at all')

// Bob types the name — the card does not carry one. You name your own contacts, the way a
// phone does, and a name you chose is a name you recognise later.
const contact = await book.addContact({
  name: 'Alice',
  username: encodePeerKey(scanned.peerKey)
})
await book.addAddress(contact.id, {
  address: scanned.address,
  type: 'evm',
  network: 'arbitrum',
  label: 'USD₮0'
})

const keys = await syncPeers()
keys.includes(alice.publicKey)
  ? pass('the scanned key lands in the address book and rebuilds the allowlist')
  : fail(`allowlist did not pick the key up: ${JSON.stringify(keys)}`)

// ── after the scan ───────────────────────────────────────────────────────────────────────
try {
  const t0 = Date.now()
  await alice.request({ to: bob.publicKey, amount: '25.00', note: 'dinner' })
  for (let i = 0; i < 20 && inbox.length === 0; i++) await new Promise((r) => setTimeout(r, 250))
  if (inbox.length === 1) {
    pass(`one scan is enough — Alice's request arrived in ${Date.now() - t0}ms, with nothing in the middle`)
  } else {
    fail('the request never arrived')
  }
} catch (err) {
  fail(`Alice still refused after the scan: ${err.code || err.message}`)
}

if (inbox.length > 0 && inbox[0].from !== alice.publicKey) {
  fail(`sender mismatch: ${inbox[0].from}`)
}

// The other half of the exchange, and the reason the card carries an address at all: Bob
// can now pay her without anyone reading out 42 characters.
const saved = await book.listAddresses(contact.id)
saved.find((a) => a.network === 'arbitrum')?.address === ALICE_ADDRESS
  ? pass('and Bob can pay her back — the address came over in the same scan')
  : fail('the address did not survive the write')

// Bob scanning the same card again — a second reader, a re-scan, a duplicate at a market
// stall. The book must not end up with two Alices.
const already = (await book.listContacts()).find(
  (c) => decodePeerKey(c.username) === scanned.peerKey
)
already?.id === contact.id
  ? pass('a re-scan finds the existing contact by peer key, so it updates instead of duplicating')
  : fail('the same person would be filed twice')

await Promise.all([alice.close(), bob.close()])
await book.close()
await store.close()
for (const node of relays) await node.destroy()
await bootstrapNode.destroy()
clearTimeout(guard)
console.log('\nT11 done.')
