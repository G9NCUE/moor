// Write one contact into the app's address book from a laptop, through the mirror.
//     node seed-contact.js "Alice" 0x742d…

import Corestore from 'corestore'
import AddressBook from '@tetherto/wdk-p2p-address-book'
import { mnemonicToSeedSync } from '@scure/bip39'

const MNEMONIC = process.env.MOOR_SEED ||
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const MIRROR = process.env.MOOR_BLIND_PEER ||
  'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o'

// Must match the app: app/src/wdk/config.ts ADDRESS_BOOK_NAMESPACE.
const NAMESPACE = 'moor-wallet'

const name = process.argv[2] || 'Alice'
const address = process.argv[3] || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'

const seed = mnemonicToSeedSync(MNEMONIC)
const store = new Corestore('./.data/seed-contact')

console.log(`\n  namespace ${NAMESPACE}`)
console.log(`  mirror    ${MIRROR.slice(0, 16)}…\n`)

const book = await AddressBook.fromSeed(seed, store, { namespace: NAMESPACE, mirrors: [MIRROR], timeout: 60_000 })

// Join an existing book if there is one; only create when there genuinely isn't.
// Backwards, and this laptop starts a second history for the same identity.
if (!book.writable) {
  try {
    await book.addMirror(MIRROR)
    console.log('  joined the existing book')
  } catch {
    await book.create()
    await book.addMirror(MIRROR)
    console.log('  created a new book (nothing to join)')
  }
}

const contact = await book.addContact({ name })
await book.addAddress(contact.id, { address, type: 'evm', network: 'arbitrum', label: 'USD₮0' })

const all = await book.listContacts()
console.log(`  added "${name}"`)
console.log(`  book now holds ${all.length}: ${all.map((c) => c.name).join(', ')}`)
console.log('\n  Watch it appear on every device running this seed.\n')

// Give replication a moment to push to the mirror before the process exits.
await new Promise((r) => setTimeout(r, 4000))
await book.close()
await store.close()
