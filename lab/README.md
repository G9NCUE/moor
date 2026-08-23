# lab

The validation harness. Every architectural claim in [`SPEC.md`](../SPEC.md) ran here before
it was written down, because the first thing we tested contradicted its own README. These
test the assumptions the app is built on, not the app.

```bash
npm install
npm install --prefix ../app/modules/pay-requests     # t8 and t11 import the module directly
npm run t1 && npm run t2 && npm run t3 && npm run t4 && npm run t5
MOOR_BLIND_PEER=a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o npm run t6
npm run t7 && npm run t8 && npm run t9 && npm run t10 && npm run t11
```

Node 24, which wrote the lockfiles. `t6`, `t7`, `t9`, `t10` need the internet; `t10` is the
only one that touches real money, and quotes without spending unless you pass `--send`.

| | Proves | Found |
|---|---|---|
| **t1** | `fromSeed()` → `create()` gives a writable book offline, in under 100ms | `fromSeed()` alone is read-only and `create()` is undocumented (finding 1). `address.type` is a closed enum, so the peer key rides in `Contact.username` (finding 2) |
| **t2** | The book's key is a pure function of (seed, namespace) | |
| **t3** | Device B restores the whole book from twelve words through a blind peer that cannot read it; writes on B propagate back | Join took 14–17s on a one-node local DHT. Retracted by t6: the rig, not the library |
| **t4** | `modules:` bundles the address book into a Bare worklet on `hrpc` | Silently dropped on `jsonrpc`, which rules out Flutter (finding 14). `--install` misdirects (finding 6) |
| **t5** | The EIP-7702 delegation contract is byte-identical on Arbitrum, Ethereum and Polygon | Does not prove it is honest; rules out the cheap failures |
| **t6** | t3 over the public DHT against a real blind peer: **2.1–3.8s** | The public network is six times faster than our private imitation of it. [Corrected upstream](https://github.com/tetherto/wdk-p2p-address-book/issues/8) |
| **t7** | An already-open book receives a remote write in ~4s, no restart or polling | We had written down that it only syncs on open. It was a startup race |
| **t8** | A payment request crosses between two strangers on a local DHT; sender identity comes from the Noise session; a stranger who knows the key is refused until added | A one-node local DHT cannot connect anything: no relays, so every punch aborts (finding 11). Three relays: 7ms |
| **t9** | t8 over the public DHT, real NAT: **1.5–2.7s** | |
| **t10** | An account holding **zero ETH** transfers USD₮0 on Arbitrum, fee charged in USD₮ on top ([`0xad810dc2…`](https://arbiscan.io/tx/0xad810dc20ff55d2d5cbe3b6dff9475ba2af56cab2e1dada7e52d2e473e4221a8)) | The gasless wallet cannot make a first transaction: it prices before it signs the authorization (finding 16). Candide cannot submit EntryPoint v0.8 (finding 17) |
| **t11** | One QR scan lets a refused sender through and carries the address to pay back; a re-scan updates rather than duplicates; eleven malformed inputs rejected | Imports `app/src/wdk/contactCard.mjs`, so there is one codec |

The lesson that repeats through t3, t7 and t8: **a test that isolates everything also
measures nothing.** One observation of something not happening is weak evidence.

## Drivers, not tests

`seed-contact.js` writes a contact into the app's book from a laptop, through the mirror.
`check-book.js` reads it. `ask-phone.js` derives a running phone's peer key from the shared
phrase, introduces itself through the address book, and asks for 25 USD₮; `--probe` only
checks the phone is announced and refusing strangers.

**Found here: writing is not delivering.** `request()` used to resolve on `socket.write()`;
the phone received zero bytes because the sender closed the socket first. The receiver now
acknowledges and `request()` waits for it.

## Versions

Captured 2026-08-10: `wdk-p2p-address-book` 1.0.0-beta.3, `wdk-react-native-core` beta.15,
`wdk-worklet-bundler` beta.9, `wdk-wallet-evm-7702-gasless` beta.3, `blind-peer` 3.13.0,
`hyperdht` 6.33.0. If a test starts failing, check whether the finding it encodes has been
fixed upstream, and update `SPEC.md §2`.
