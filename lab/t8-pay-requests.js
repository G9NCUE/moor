// T8 — Alice asks Bob for money. Nothing in between.
//
// This is Phase 4's claim, and the one thing in Moor that no wallet ships. Everything up to
// now has been one person with several devices, held together by a shared recovery phrase.
// Here Alice and Bob share nothing: different seeds, different books, no account, no server.
//
// Also tests the property that makes it worth having — a stranger cannot get through.
//
// Runs on a LOCAL DHT so it's hermetic and can't be flaky. t9 does the same on the public
// network, because a hermetic test measures its own topology (see t6's retraction).
//
// The local DHT needs to be a NETWORK, not a node. With only a bootstrapper, nobody can be
// observed from two vantage points, so every node stays firewalled, hyperdht falls back to
// holepunching, and holepunching has no relays to probe through — every dial aborts with
// HOLEPUNCH_ABORTED. We read that as a bug in the module for a while. Third time a hermetic
// rig has misled this project; see t6 and t7.

import DHT from 'hyperdht'
import { mnemonicToSeedSync } from '@scure/bip39'
import { PayRequests } from '../app/modules/pay-requests/index.js'
import { freePort } from './free-port.js'

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

const ALICE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const BOB = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const MALLORY = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'

const guard = setTimeout(() => { console.log('\n  FAIL  timed out'); process.exit(1) }, 90_000)

console.log('T8 — payment requests between two people\n')

const port = await freePort()
const bootstrapNode = DHT.bootstrapper(port, '127.0.0.1')
await bootstrapNode.ready()
const bootstrap = [{ host: '127.0.0.1', port }]

// Relays. Without these the DHT has one node, nobody can be observed from two places, and
// every dial aborts mid-holepunch. See the note at the top — this line is the fix.
const relays = []
for (let i = 0; i < 3; i++) {
  const node = new DHT({ bootstrap, ephemeral: false, firewalled: false })
  await node.ready()
  relays.push(node)
}
await new Promise((r) => setTimeout(r, 2000)) // let them settle into the routing table
console.log(`  local DHT: 1 bootstrapper + ${relays.length} relay nodes\n`)

const alice = new PayRequests({ seed: mnemonicToSeedSync(ALICE), config: { bootstrap }, emit: () => {} })
const inbox = []
const bob = new PayRequests({
  seed: mnemonicToSeedSync(BOB),
  config: { bootstrap },
  emit: (event, payload) => { if (event === 'request') inbox.push(payload) }
})
const mallory = new PayRequests({ seed: mnemonicToSeedSync(MALLORY), config: { bootstrap }, emit: () => {} })

await Promise.all([alice.ready(), bob.ready(), mallory.ready()])
console.log(`  alice   ${alice.publicKey.slice(0, 16)}…`)
console.log(`  bob     ${bob.publicKey.slice(0, 16)}…`)
console.log(`  mallory ${mallory.publicKey.slice(0, 16)}… (not in anyone's contacts)\n`)

// Identity is derived from the recovery phrase, so it survives a reinstall and needs no
// separate backup. Same phrase in, same peer key out.
const again = new PayRequests({ seed: mnemonicToSeedSync(ALICE), config: { bootstrap }, emit: () => {} })
again.publicKey === alice.publicKey
  ? pass('peer identity is derived from the recovery phrase — nothing extra to back up')
  : fail('identity is not deterministic')

// They meet once, by QR. That exchange is what the allowlists below represent.
await bob.setPeers([alice.publicKey])
await alice.setPeers([bob.publicKey])

// ── the request ────────────────────────────────────────────────────────────────────────
// Caught, not left to reject: an unhandled rejection here kills the process before any of
// the assertions below run, which is how a plain dial failure once read as a crash.
try {
  await alice.request({ to: bob.publicKey, amount: '25.00', note: 'dinner' })
} catch (err) {
  fail(`alice could not reach bob: ${err.code || err.message}`)
}

for (let i = 0; i < 20 && inbox.length === 0; i++) await new Promise((r) => setTimeout(r, 250))

if (inbox.length === 0) {
  fail('Bob never received the request')
} else {
  const req = inbox[0]
  console.log(`  bob received: ${req.amount} USD₮ — "${req.note}"`)
  pass('a payment request crossed between two strangers with no server in the path')

  req.from === alice.publicKey
    ? pass('sender identity comes from the authenticated session, not the payload')
    : fail(`sender mismatch: ${req.from}`)
}

// ── the firewall ───────────────────────────────────────────────────────────────────────
// Mallory knows Bob's key — it's public, it's in QR codes. Knowing it must not be enough.
let refused = false
try {
  await mallory.request({ to: bob.publicKey, amount: '9999', note: 'urgent, please pay' })
} catch {
  refused = true
}
await new Promise((r) => setTimeout(r, 1500))

refused && inbox.length === 1
  ? pass('a stranger who knows the key is still refused — contacts are the firewall')
  : fail(`stranger got through: refused=${refused}, inbox=${inbox.length}`)

// ── after they meet ────────────────────────────────────────────────────────────────────
await bob.setPeers([alice.publicKey, mallory.publicKey])
try {
  await mallory.request({ to: bob.publicKey, amount: '5', note: 'now we have met' })
} catch (err) {
  fail(`mallory still refused after being added: ${err.code || err.message}`)
}
for (let i = 0; i < 20 && inbox.length < 2; i++) await new Promise((r) => setTimeout(r, 250))

inbox.length === 2
  ? pass('adding them to contacts lets them through — the allowlist is the whole mechanism')
  : fail('allowlist update had no effect')

await Promise.all([alice.close(), bob.close(), mallory.close(), again.close()])
for (const node of relays) await node.destroy()
await bootstrapNode.destroy()
clearTimeout(guard)
console.log('\nT8 done.')
