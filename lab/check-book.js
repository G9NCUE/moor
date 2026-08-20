// Read the app's address book from a neutral client that has never seen it.
import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'
import { rm } from 'node:fs/promises'

const MNEMONIC = process.env.MOOR_SEED ||
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const MIRROR = process.env.MOOR_BLIND_PEER || 'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o'
const DIR = './.data/check-book'

await rm(DIR, { recursive: true, force: true })
const store = new Corestore(DIR)
const book = await AddressBook.fromSeed(mnemonicToSeedSync(MNEMONIC), store, {
  namespace: 'moor-wallet', mirrors: [MIRROR], timeout: 60_000
})
if (!book.writable) {
  try { await book.addMirror(MIRROR) } catch (e) { console.log('  join failed:', e.message) }
}
const c = await book.listContacts()
console.log(`\n  autobase ${Buffer.from(book.key).toString('hex').slice(0, 24)}…`)
console.log(`  fresh client sees ${c.length} contact(s): ${c.map((x) => x.name).join(', ') || '(none)'}\n`)
await book.close(); await store.close()
