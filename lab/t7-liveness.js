// T7 — Does a book that is already open notice a write made somewhere else?
//
// Phase 3 shipped with a gap: contacts reach another device when the app OPENS, not while
// it is on screen. That's tolerable for a contact list and fatal for Phase 4, which is
// entirely about a message arriving on a phone somebody is holding.
//
// Before blaming React Native, find out whether plain Node behaves the same. Two long-lived
// clients on one seed, both already open, both mirrored. B writes; does A hear about it?
//
//   MOOR_BLIND_PEER=<key> node t7-liveness.js
//
// A pass means the library pushes fine and the problem is mobile-specific.
// A fail means live propagation isn't happening anywhere, and Phase 4 needs a different
// mechanism than "write to the address book and hope".

import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'

const MIRROR = process.env.MOOR_BLIND_PEER || 'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o'
const NAMESPACE = 'moor-liveness-' + (process.env.MOOR_RUN_ID || 'default')
const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const WAIT_MS = Number(process.env.MOOR_WAIT_MS || 45_000)

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

const seed = mnemonicToSeedSync(MNEMONIC)
await rm('./.data/t7', { recursive: true, force: true })

const guard = setTimeout(() => { console.log('\n  FAIL  hard timeout'); process.exit(1) }, WAIT_MS + 120_000)

console.log(`T7 — liveness on an already-open book\n  namespace ${NAMESPACE}\n`)

// ── A: the "phone left on screen"
const storeA = new Corestore('./.data/t7/A')
const A = await AddressBook.fromSeed(seed, storeA, { namespace: NAMESPACE, mirrors: [MIRROR], timeout: 60_000 })
if (!A.writable) {
  try { await A.addMirror(MIRROR) } catch { await A.create(); await A.addMirror(MIRROR) }
}
await A.addContact({ name: 'Existing' })
console.log(`  A open · writable=${A.writable} · contacts=${(await A.listContacts()).length}`)

// Count events and record when the new name first becomes visible to A.
let updates = 0
let sawAt = null
const t0 = Date.now()
A.on('update', () => {
  updates++
  A.listContacts()
    .then((cs) => { if (sawAt === null && cs.some((c) => c.name === 'FromB')) sawAt = Date.now() - t0 })
    .catch(() => {})
})

// ── B: the other device, joining the same book
const storeB = new Corestore('./.data/t7/B')
const B = await AddressBook.fromSeed(seed, storeB, { namespace: NAMESPACE, mirrors: [MIRROR], timeout: 60_000 })
if (!B.writable) await B.addMirror(MIRROR)
console.log(`  B open · writable=${B.writable} · contacts=${(await B.listContacts()).length}`)

console.log(`\n  B writes "FromB" — A stays open and is not polled…\n`)
await B.addContact({ name: 'FromB' })

// Poll only for reporting; A is never told to update.
const deadline = Date.now() + WAIT_MS
let visible = false
while (Date.now() < deadline && !visible) {
  await new Promise((r) => setTimeout(r, 2000))
  visible = (await A.listContacts()).some((c) => c.name === 'FromB')
  if (visible && sawAt === null) sawAt = Date.now() - t0
}

const secs = sawAt === null ? null : (sawAt / 1000).toFixed(1)
console.log(`  A saw it: ${visible ? `yes, after ~${secs}s` : `NO (waited ${WAIT_MS / 1000}s)`}`)
console.log(`  'update' events on A: ${updates}\n`)

visible
  ? pass('an open book DOES receive remote writes — the gap is mobile-specific')
  : fail('an open book does NOT receive remote writes in Node either — library/topology, not RN')

await A.close(); await storeA.close()
await B.close(); await storeB.close()
clearTimeout(guard)
console.log('\nT7 done.')
