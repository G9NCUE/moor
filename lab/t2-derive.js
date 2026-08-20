// T2 — Is the book identity really derived from the seed alone?
//
// M1 claims "same 12 words on a new device = same address book". That only holds if the
// autobase key is a pure function of (seed, namespace) with no device-local entropy.
//
// Also tests the claim that namespace isolates apps sharing one seed.

import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }
const hex = (b) => Buffer.from(b).toString('hex')

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const seed = mnemonicToSeedSync(MNEMONIC)
const otherSeed = mnemonicToSeedSync(OTHER_MNEMONIC)

await rm('./.data/t2', { recursive: true, force: true })

console.log('T2 — key derivation\n')

// Open the same seed+namespace under three *separate* corestores, as three devices would.
async function keyFor (seedBytes, namespace, dir) {
  const store = new Corestore(`./.data/t2/${dir}`)
  const book = await AddressBook.fromSeed(seedBytes, store, { namespace, replicate: false })
  const key = hex(book.key)
  await book.close()
  await store.close()
  return key
}

const deviceA = await keyFor(seed, 'moor-wallet', 'a')
const deviceB = await keyFor(seed, 'moor-wallet', 'b')
const deviceC = await keyFor(seed, 'moor-wallet', 'c')

console.log(`  device A: ${deviceA}`)
console.log(`  device B: ${deviceB}`)
console.log(`  device C: ${deviceC}\n`)

deviceA === deviceB && deviceB === deviceC
  ? pass('same seed + namespace -> identical autobase key across three fresh stores')
  : fail('autobase key is NOT deterministic — multi-device restore cannot work')

// Namespace isolation: same seed, different app.
const otherApp = await keyFor(seed, 'some-other-wallet', 'd')
console.log(`  other namespace: ${otherApp}\n`)
otherApp !== deviceA
  ? pass('different namespace -> different book (apps sharing a seed stay isolated)')
  : fail('namespace does not isolate — two apps would share one address book')

// Different seed, same namespace.
const otherUser = await keyFor(otherSeed, 'moor-wallet', 'e')
otherUser !== deviceA
  ? pass('different seed -> different book')
  : fail('different seeds collide')

// deriveAutobaseKey is exposed statically — can the app compute the key without opening?
try {
  const k = AddressBook.deriveAutobaseKey
  typeof k === 'function'
    ? pass('deriveAutobaseKey() exposed statically (lets the UI show book identity pre-open)')
    : fail('deriveAutobaseKey missing')
} catch (err) {
  fail(`deriveAutobaseKey threw: ${err.message}`)
}

console.log('\nT2 done.')
