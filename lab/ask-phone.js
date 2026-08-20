// Ask the phone for money, from a laptop. A demo driver, not a test.
//
// This is Phase 4 end to end on a real device: a peer the phone has never met introduces
// itself through the address book (the QR exchange, done over the mirror instead of a
// camera), then opens a stream to the phone's peer key on the public DHT and asks for 25
// USD₮. Nothing in the middle holds the request.
//
//   node ask-phone.js            # introduce, then ask
//   node ask-phone.js --probe    # only check the phone is listening and firewalling
//
// The phone's identity is derived from the same recovery phrase as its wallet, so this
// script can compute it without the phone telling anyone.

import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync, generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { PayRequests } from '../app/modules/pay-requests/index.js'

const MNEMONIC = process.env.MOOR_SEED ||
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const MIRROR = process.env.MOOR_BLIND_PEER ||
  'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o'
const NAMESPACE = 'moor-wallet'
const PROBE_ONLY = process.argv.includes('--probe')

const phoneSeed = mnemonicToSeedSync(MNEMONIC)

// Same derivation the phone runs, from the same words. Nothing is exchanged to learn this.
const phoneKey = new PayRequests({ seed: phoneSeed }).publicKey
console.log(`\n  phone peer key  ${phoneKey}`)

// Alice is a stranger with her own phrase — a different person, not another device.
const alice = new PayRequests({ seed: mnemonicToSeedSync(generateMnemonic(wordlist)) })
await alice.ready()
console.log(`  alice           ${alice.publicKey}\n`)

// ── Is the phone listening at all? ─────────────────────────────────────────────────────
// Before any introduction, Alice is a stranger. A refusal here is the good outcome: it
// means the phone's server is up on the DHT and its firewall said no.
try {
  await alice.request({ to: phoneKey, amount: '1', note: 'probe' })
  console.log('  ⚠️  the phone ACCEPTED a stranger — the allowlist is not being enforced')
} catch (err) {
  // PEER_NOT_FOUND means nobody is announcing that key. PEER_CONNECTION_FAILED means the
  // phone WAS found on the DHT and every attempt to connect was turned away — which is the
  // firewall doing its job, and the two are worth telling apart.
  console.log(err.code === 'PEER_NOT_FOUND'
    ? '  ✗ nobody is announcing that key — the module is not running on the phone'
    : `  ✓ found on the DHT, connection refused (${err.code}) — listening and firewalling`)
}

if (PROBE_ONLY) {
  await alice.close()
  process.exit(0)
}

// ── The introduction ───────────────────────────────────────────────────────────────────
// On a phone this is a QR scan. Here Alice writes herself into the shared address book,
// which reaches the device through the mirror — same effect, no camera.
console.log('\n  introducing alice through the address book…')
const store = new Corestore('./.data/ask-phone')
const book = await AddressBook.fromSeed(phoneSeed, store, {
  namespace: NAMESPACE, mirrors: [MIRROR], timeout: 60_000
})
if (!book.writable) await book.addMirror(MIRROR)

// Alice gets a fresh peer key every run, so reuse her contact rather than piling up
// duplicates. No address: a payment request needs her peer key, not somewhere to pay her,
// and the book rejects a second contact holding the same arbitrum address anyway.
const NAME = 'Alice (laptop)'
const existing = (await book.listContacts()).find((c) => c.name === NAME)
if (existing) await book.editContact(existing.id, { username: `moor:${alice.publicKey}` })
else await book.addContact({ name: NAME, username: `moor:${alice.publicKey}` })

console.log('  written. waiting for the phone to pick it up and re-run setPeers…')
await new Promise((r) => setTimeout(r, 12_000))

// ── The request ────────────────────────────────────────────────────────────────────────
try {
  const t0 = Date.now()
  await alice.request({ to: phoneKey, amount: '25.00', note: 'dinner' })
  console.log(`\n  ✓ request delivered in ${((Date.now() - t0) / 1000).toFixed(1)}s — look at the phone\n`)
} catch (err) {
  console.log(`\n  ✗ still refused: ${err.code || err.message}`)
  console.log('    the phone has not applied the new contact yet; run again in a moment\n')
}

await alice.close()
await book.close()
await store.close()
