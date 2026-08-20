// The Moor blind peer.
//
// A blind peer is an always-on machine that holds encrypted blocks for other people so
// their second device can catch up while the first one is switched off. It has no key to
// anything it stores. It cannot read a contact, a name, or an address — only ciphertext,
// sizes and timing.
//
// Moor runs one because nobody else does. Not Tether, not Holepunch (theirs serve Keet,
// and those keys are Keet's). Every app wanting multi-device sync must operate its own,
// which is why almost no app has the feature. See SPEC §10.
//
//   node run.js
//
// It prints a public key. That key is the only thing users need, it is the same for every
// user, and it is stable across restarts because the keypair lives in the storage
// directory. Losing that directory means a new identity and every client reconfigured, so
// back it up or accept the churn.

import BlindPeer from 'blind-peer'
import idEnc from 'hypercore-id-encoding'

const STORAGE = process.env.MOOR_BLIND_PEER_STORAGE || './storage'

/**
 * An open mirror is free storage for strangers: anyone who learns the key can ask it to
 * hold arbitrary cores. Address books are kilobytes, so the cap can be brutal — this is
 * two orders of magnitude below the library's 100 GB default and still absurdly generous
 * for what it's for.
 */
const MAX_BYTES = Number(process.env.MOOR_BLIND_PEER_MAX_BYTES || 1_000_000_000) // 1 GB

const PORT = Number(process.env.MOOR_BLIND_PEER_PORT || 0) // 0 = ephemeral

const peer = new BlindPeer(STORAGE, {
  maxBytes: MAX_BYTES,
  enableGc: true, // reclaim space from cores nobody asks for any more
  port: PORT
})

await peer.ready()
await peer.listen()

const key = idEnc.normalize(peer.publicKey)

console.log('')
console.log('  Moor blind peer')
console.log('  ───────────────')
console.log(`  key       ${key}`)
console.log(`  storage   ${STORAGE}`)
console.log(`  cap       ${(MAX_BYTES / 1e9).toFixed(2)} GB, gc on`)
console.log('')
console.log('  Point a client at it:')
console.log(`    EXPO_PUBLIC_BLIND_PEERS=${key}`)
console.log('')
console.log('  It stores sealed blocks it cannot read. If it dies, nobody loses data —')
console.log('  only the ability to sync to a device that is currently switched off.')
console.log('')

const shutdown = async (signal) => {
  console.log(`\n  ${signal} — closing`)
  try {
    await peer.close()
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
