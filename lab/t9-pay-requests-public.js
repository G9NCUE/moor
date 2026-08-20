// T9 — the same payment request, on the real internet.
//
// t8 is hermetic and therefore silent about the only network anyone actually uses. This is
// t8's central claim — Alice asks Bob for money, no server in the path — run against the
// PUBLIC DHT, over real NAT, with real hole-punching. A failure here matters far more than
// a failure in t8; see t6, where a hermetic rig produced a reliability number that was off
// by a factor of six and had to be retracted publicly.
//
// No infrastructure needed: no bootstrap to run, no blind peer, no keys. Just a connection.
// Set MOOR_SKIP_PUBLIC=1 to skip it on a machine with no internet.
//
// Identities are random per run: t8's well-known test phrases would announce the same
// public key for everyone running this file, so two people testing at once would dial each
// other's Bob. The determinism check below doesn't touch the network, so it keeps a fixed one.

import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js' // the .js is required by its exports map
import { PayRequests } from '../app/modules/pay-requests/index.js'

if (process.env.MOOR_SKIP_PUBLIC === '1') {
  console.log('T9 skipped — MOOR_SKIP_PUBLIC=1')
  process.exit(0)
}

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

const guard = setTimeout(() => {
  console.log('\n  FAIL  timed out after 180s on the public DHT')
  process.exit(1)
}, 180_000)

console.log('T9 — payment requests over the public DHT\n')

// A fixed phrase, no network involved: same words in, same peer key out. Restoring a wallet
// restores the identity people already have in their contacts.
const FIXED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const seedFixed = mnemonicToSeedSync(FIXED)
new PayRequests({ seed: seedFixed }).publicKey === new PayRequests({ seed: seedFixed }).publicKey
  ? pass('peer identity is a pure function of the recovery phrase')
  : fail('identity is not deterministic')

// ── two strangers, fresh phrases, nothing shared ───────────────────────────────────────
const alice = new PayRequests({ seed: mnemonicToSeedSync(generateMnemonic(wordlist)), emit: () => {} })
const inbox = []
const bob = new PayRequests({
  seed: mnemonicToSeedSync(generateMnemonic(wordlist)),
  emit: (event, payload) => { if (event === 'request') inbox.push(payload) }
})
const mallory = new PayRequests({ seed: mnemonicToSeedSync(generateMnemonic(wordlist)), emit: () => {} })

const tReady = Date.now()
await Promise.all([alice.ready(), bob.ready(), mallory.ready()])
console.log(`  three peers announced on the public DHT in ${((Date.now() - tReady) / 1000).toFixed(1)}s`)

// The QR exchange, which is the only introduction there is.
await bob.setPeers([alice.publicKey])
await alice.setPeers([bob.publicKey])

const tSend = Date.now()
try {
  await alice.request({ to: bob.publicKey, amount: '25.00', note: 'dinner' })
} catch (err) {
  fail(`alice could not reach bob over the public DHT: ${err.code || err.message}`)
}
const dialled = Date.now() - tSend

for (let i = 0; i < 60 && inbox.length === 0; i++) await new Promise((r) => setTimeout(r, 250))

if (inbox.length === 0) {
  fail('Bob never received the request')
} else {
  const req = inbox[0]
  console.log(`  bob received: ${req.amount} USD₮ — "${req.note}"`)
  pass(`a payment request crossed the public internet in ${(dialled / 1000).toFixed(1)}s, no server in the path`)

  req.from === alice.publicKey
    ? pass('sender identity comes from the authenticated session, not the payload')
    : fail(`sender mismatch: ${req.from}`)
}

// ── the firewall, against the real network ─────────────────────────────────────────────
// Mallory knows Bob's key. On the public DHT she can also find him, which is exactly the
// point: reachability is not permission.
let refused = false
try {
  await mallory.request({ to: bob.publicKey, amount: '9999', note: 'urgent, please pay' })
} catch {
  refused = true
}
await new Promise((r) => setTimeout(r, 2000))

refused && inbox.length === 1
  ? pass('a stranger who knows the key is still refused — contacts are the firewall')
  : fail(`stranger got through: refused=${refused}, inbox=${inbox.length}`)

await Promise.all([alice.close(), bob.close(), mallory.close()])
clearTimeout(guard)
console.log('\nT9 done.')
