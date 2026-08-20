// T6 — Does it work on the real internet?
//
// t3 proved two devices converge, but on a LOCAL DHT with a LOCAL mirror — hermetic, and
// therefore silent about NAT, hole-punching, and whether a blind peer is reachable by
// strangers. This is the same test over the PUBLIC DHT against a running Moor blind peer.
//
// Start the peer first, in another terminal:
//     cd infra/blind-peer && npm start
// then pass its key:
//     MOOR_BLIND_PEER=<key> npm run t6
//
// This is the topology real users get, so a failure here matters far more than a failure
// in t3.

import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'

const MIRROR = process.env.MOOR_BLIND_PEER
if (!MIRROR) {
  console.log('T6 skipped — set MOOR_BLIND_PEER to the key printed by infra/blind-peer')
  process.exit(0)
}

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

// A throwaway phrase, distinct from the other tests so runs never collide on the DHT.
const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const NAMESPACE = 'moor-wallet-t6'
const seed = mnemonicToSeedSync(MNEMONIC)

await rm('./.data/t6', { recursive: true, force: true })

const guard = setTimeout(() => {
  console.log('\n  FAIL  timed out after 180s on the public DHT')
  process.exit(1)
}, 180_000)

console.log(`T6 — public DHT, mirror ${MIRROR.slice(0, 12)}…\n`)

// ── device A
const storeA = new Corestore('./.data/t6/deviceA')
const bookA = await AddressBook.fromSeed(seed, storeA, { namespace: NAMESPACE })
await bookA.create()
await bookA.addMirror(MIRROR)
await bookA.addContact({ name: 'Alice', username: 'moor:yb3wkzhs4h7bxpqxbdbecgwmzquk1zuoe1pnwhw76oe1cf3nn7xy' })
console.log(`  device A: writable=${bookA.writable}, mirrors=${(await bookA.listMirrors()).length}`)

// Give the mirror a moment to actually pull A's blocks. MOOR_NO_WARMUP=1 skips this to
// measure the race where a second device arrives before the mirror has the data — which
// is exactly what happens when someone installs on phone B right after phone A.
const WARMUP = process.env.MOOR_NO_WARMUP === '1' ? 0 : 5000
if (WARMUP) await new Promise((r) => setTimeout(r, WARMUP))
console.log(`  mirror warmup: ${WARMUP / 1000}s`)

// ── device B, fresh store, same seed, never met A
const t0 = Date.now()
const storeB = new Corestore('./.data/t6/deviceB')
const bookB = await AddressBook.fromSeed(seed, storeB, {
  namespace: NAMESPACE,
  mirrors: [MIRROR],
  timeout: 120_000 // the public DHT is slower than a loopback bootstrap
})
await bookB.addMirror(MIRROR)
const elapsed = Date.now() - t0

const seen = await bookB.listContacts()
console.log(`  device B: writable=${bookB.writable}, joined in ${(elapsed / 1000).toFixed(1)}s`)
console.log(`  contacts on B: ${JSON.stringify(seen.map((c) => c.name))}\n`)

seen.some((c) => c.name === 'Alice')
  ? pass(`device B restored over the public DHT in ${(elapsed / 1000).toFixed(1)}s`)
  : fail('device B saw nothing — the mirror is not reachable, or not mirroring')

// The number people will feel on a real phone.
elapsed < 20_000
  ? pass('joined within the library default 20s timeout')
  : console.log(`  ..    joined in ${(elapsed / 1000).toFixed(1)}s — ABOVE the 20s default; apps must raise it`)

await bookA.close(); await storeA.close()
await bookB.close(); await storeB.close()
clearTimeout(guard)
console.log('\nT6 done.')
