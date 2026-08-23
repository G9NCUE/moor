// Ask a running phone for money from a laptop. Derives the phone's peer key from the shared
// phrase, introduces itself through the address book, asks for 25 USD₮. --probe only checks
// it is listening and firewalling.

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

// A refusal here is the good outcome: the phone is up and its firewall said no.
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

// The QR scan, done through the mirror instead of a camera.
console.log('\n  introducing alice through the address book…')
const store = new Corestore('./.data/ask-phone')
const book = await AddressBook.fromSeed(phoneSeed, store, {
  namespace: NAMESPACE, mirrors: [MIRROR], timeout: 60_000
})
if (!book.writable) await book.addMirror(MIRROR)

// Reuse Alice's contact across runs. No address: the book rejects a duplicate anyway.
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
