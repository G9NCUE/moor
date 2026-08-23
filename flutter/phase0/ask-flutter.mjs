// Phase 2 driver. Like lab/ask-phone.js, but the Flutter app has no address book, so the
// introduction is a build-time --dart-define=ALLOW_PEER=<alice key> instead of a contact write.
//   node ask-flutter.mjs --key      print Alice's key, for the define
//   node ask-flutter.mjs            probe as a stranger, then ask as Alice
//   --bootstrap host:port           use a local DHT (dht-rig.mjs) instead of the public one
import { mnemonicToSeedSync, generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { PayRequests } from '@moor/pay-requests'

const PHONE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const ALICE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

const bs = process.argv[process.argv.indexOf('--bootstrap') + 1]
const config = process.argv.includes('--bootstrap') ? { bootstrap: [{ host: bs.split(':')[0], port: Number(bs.split(':')[1]) }] } : {}

const phoneKey = new PayRequests({ seed: mnemonicToSeedSync(PHONE) }).publicKey
const alice = new PayRequests({ seed: mnemonicToSeedSync(ALICE), config })
if (process.argv.includes('--key')) { console.log(alice.publicKey); process.exit(0) }

const mallory = new PayRequests({ seed: mnemonicToSeedSync(generateMnemonic(wordlist)), config })
await Promise.all([alice.ready(), mallory.ready()])
console.log(`phone   ${phoneKey}\nalice   ${alice.publicKey}\nmallory ${mallory.publicKey}\n`)

await mallory.request({ to: phoneKey, amount: '1', note: 'probe' }).then(
  () => console.log('FAIL  the phone accepted a stranger'),
  (e) => console.log(e.code === 'PEER_NOT_FOUND'
    ? 'FAIL  nobody is announcing that key'
    : `PASS  stranger refused (${e.code}); the phone is announced and firewalling`))

const t0 = Date.now()
await alice.request({ to: phoneKey, amount: '25', note: 'phase 2' }).then(
  () => console.log(`PASS  Alice's request acknowledged by the phone in ${Date.now() - t0}ms`),
  (e) => console.log(`FAIL  Alice refused: ${e.code} ${e.message}`))

await Promise.all([alice.close(), mallory.close()])
