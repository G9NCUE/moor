# lab

The validation harness. **Every architectural claim in [`SPEC.md`](../SPEC.md) was run here
before it was written down**, because the first thing we tested contradicted its own README.

These are not unit tests of the app. They are tests of the *assumptions the app is built on*,
kept in the repo so anyone can re-check them when the packages move.

```bash
npm install
npm run t1 && npm run t2 && npm run t3 && npm run t4 && npm run t5
MOOR_BLIND_PEER=a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o npm run t6
npm run t7 && npm run t8 && npm run t9 && npm run t10 && npm run t11
```

Node 20+ to run these; CI uses **Node 24**, which is what wrote the lockfiles — `npm ci` on
`app/` is rejected by npm 10. `t6`, `t7`, `t9` and `t10` need the internet; `t4` needs it to
install. `t3`, `t8` and `t11` run their own local DHT and pick free ports rather than
assuming any. `t10` is the only one that touches real money, and it quotes without spending
unless you pass `--send`.

`t8` and `t11` import `app/modules/pay-requests` — the same module the worklet loads, not a
copy — so they also need that module's own dependencies installed:
`npm install --prefix ../app/modules/pay-requests`. On a machine where `app/` is already
installed this happens to resolve anyway, which is why CI caught it and we didn't.

---

## t1 — Does the address book work at all?

One device, strictly offline. Opens a book, writes contacts and addresses, checks the
`update` event and `search()`.

**Proves:** `fromSeed()` → `create()` gives a writable book in under 100ms with no network.

**Found:** two things the docs don't tell you.

1. `fromSeed()` alone returns a **read-only** book. The README says it works out whether
   you're a new device, a restoring device, or a reopen. It doesn't — you must call
   `create()` (new book) or `addMirror()` (join an existing one) yourself. `create()` is in
   the type definitions and in a source comment, and nowhere in the README. This broke our
   very first run.
2. `address.type` is a **closed, runtime-enforced enum** of seven payment types. A
   HyperDHT peer key can't be stored as an address — so Moor's mooring key rides in
   `Contact.username` instead. t1 asserts both the rejection and the workaround.

## t2 — Is the book really a function of the seed?

Opens the same seed and namespace under three separate corestores and compares keys.

**Proves:** identical autobase key every time (`80b73c63…`), so restoring on a new device is
possible at all. Changing the namespace or the seed produces a different book, so two apps
sharing one seed stay isolated.

## t3 — Two devices, one seed, nobody in the middle

The one that matters. Device A creates a book and adds a contact. Device B — a separate
corestore that has never met A — opens from the same twelve words and must see it.

Runs against a **local** `hyperdht` bootstrapper and a **local** `blind-peer`, so it's
hermetic: no public DHT, no Tether infrastructure, nothing to flake.

**Proves:** B restores the whole book from the seed alone; the mooring key travels with the
contact (so Moor's peer identity syncs for free); and writes on B propagate back to A, which
makes this genuine multiwriter rather than one-way backup.

**Note the timing.** Joining takes **14–17 seconds** against the library's 20-second default
timeout — on a local network with zero latency. On a phone over mobile data that margin is
thin, and the failure mode is a hard throw rather than a retry.

**Note the trust model.** A and B never connect to each other. The blind peer stores and
serves sealed blocks it has no key to. (A blind *peer* stores; a blind *relay* forwards and
keeps nothing. Different things.)

## t4 — Can the address book even reach a phone?

Everything above ran in Node. Moor needs the same code inside a **Bare worklet** on a
device, loaded through the bundler's undocumented `modules:` key. t4 runs
`wdk-worklet-bundler generate` for both transports and checks what comes out.

**Proves:** `modules:` genuinely works on `hrpc` (React Native). The generated entry emits
`moduleManagers['addressBook'].createModule = (ctx) => WdkP2pAddressBook.createWorkletModule(ctx)`
and the bundle builds — 6.5 MB in about half a second.

**Disproves the same thing for `jsonrpc`** (the Swift/Kotlin transport a Flutter plugin
would need): the generated worklet has *no* module wiring at all. Not an error, not a
warning — the config is accepted and silently dropped. This is what rules Flutter out, and
it's why Moor is React Native.

**Also found:** `generate --install` does not install `@tetherto/pear-wrk-wdk`, and when the
build stops it tells you to run `npm install @tetherto/pear-wrk-wdk/worklet` — not a valid
package name. Install `@tetherto/pear-wrk-wdk` instead. t4 prints this caveat before running,
because you will hit it.

Needs network on first run; the bundler installs the packages it's asked to bundle.

## t5 — Is the delegation contract what it claims to be?

Gasless sends work by an EOA delegating execution to a contract (EIP-7702). WDK requires
that contract's address, ships no per-chain value, and its docs tell you to *"verify this
address independently for your target chain"* — with no registry to check against. Tether's
own starter hardcodes one and concedes in a comment that it **assumes** the same address
across chains from CREATE2 convention, unconfirmed.

t5 is that confirmation: `eth_getCode` on Arbitrum, Ethereum and Polygon, comparing both
presence and a hash of the runtime bytecode.

**Result:** identical 3639-byte bytecode on all three (`sha256` begins `bf461b86d228d65e`).
The assumption holds.

**What it does not prove:** that the contract is honest. Nothing here substitutes for
reading its source or trusting whoever deployed it. t5 only rules out the cheap failures —
an empty address, or three different contracts wearing one address. A dead RPC is reported
as *inconclusive*, never as "no code", because those are very different claims.

Run it before pointing this app at real money.

## t6 — The same thing, on the real internet

t3 is hermetic: a one-node local DHT and a local mirror. That isolates everything, which
also means it measures nothing about NAT, hole-punching, or whether a mirror is reachable by
strangers. t6 runs the identical two-device restore over the **public DHT** against a real
blind peer — the topology actual users get.

**Result:** a second device restores an address book from twelve words in **2.1–3.8s**.

**This test corrected us.** t3 measured 14–17s and we filed that as a reliability concern
against the library's 20s timeout. It was our test rig, not the library — the public network
is roughly six times faster than our private one-node imitation of it, and it isn't a warmup
effect either (removing the mirror's head start changes nothing).
[Retracted on the issue](https://github.com/tetherto/wdk-p2p-address-book/issues/8).

Defaults to the mirror we run; pass `MOOR_BLIND_PEER` to test your own.

## t7 — Does an *open* book notice a remote write?

Restoring on launch is one thing; a book that is already open and on screen is another. t7
writes a contact from one client and waits on an open book elsewhere.

**Result:** it arrives in about four seconds, with no restart, no polling and no sync button.

**This test corrected us too.** We had written down that a running app only syncs on open.
It was a startup race — the phone had registered its mirror moments before the write and
hadn't connected yet. One observation of something not happening is very weak evidence.

## t8 — Alice asks Bob for money

Phase 4's claim, and the one thing in Moor no wallet ships. Everything up to t7 is one
person with several devices held together by a shared recovery phrase. Here Alice and Bob
share nothing: different seeds, different books, no account, no server. Also tests the
property that makes it worth having — that a stranger cannot get through.

**Proves:** a payment request crosses between two strangers on an authenticated stream; the
sender identity comes from the Noise session rather than the payload, so nobody can claim to
be someone else; and the contact list *is* the firewall — Mallory knows Bob's key, which is
public and printed in QR codes, and is still refused until Bob adds her.

**Found: a hermetic DHT with one node in it cannot connect anything.** This test spent a
while failing with `DHTError: HOLEPUNCH_ABORTED`, which we recorded as a bug in the module.
It wasn't. A lone bootstrapper can't observe a peer from two vantage points, so every node
stays `firewalled=true`, hyperdht falls back to hole-punching, hole-punching needs relay
nodes to carry its probe rounds, and there are none — `probeRound` throws and the dial
aborts. Add three non-ephemeral, non-firewalled nodes and the same request lands in **7ms**.

Worth stating plainly because it is the third time this rig has misled us, after t6 and t7:
**a test that isolates everything also measures nothing.**

## t9 — The same request, on the real internet

t8's claim over the **public DHT**, through real NAT and real hole-punching. Needs no
infrastructure at all — no bootstrap, no mirror, no keys, just a connection.

**Result:** three peers announce in ~11s, and a payment request crosses the public internet
in **2.4s** with no server in the path. The stranger is still refused.

Each run generates fresh recovery phrases. t8 uses the well-known BIP-39 test vectors, which
is fine on a private DHT; on the public one they would announce the same public key for
everyone running the file, so two people testing at once would dial each other's Bob.

`MOOR_SKIP_PUBLIC=1` skips it on a machine with no internet.

## t10 — Moving money with no gas

The one that spends. An account holding **zero ETH** transfers USD₮0 on Arbitrum One and the
fee comes out of the USD₮ instead, through an ERC-4337 bundler and a paymaster in token mode.

There is no meaningful testnet version of this: the paymaster, the exchange rate and the
EIP-7702 delegation are all production services. So it runs against mainnet with a throwaway
seed generated on first use into `lab/.send-seed` (gitignored) and stops to ask you to fund
it. Default is quote-only; `--send` spends.

**Proves:** the fee is quoted in USD₮ and charged in USD₮; the recipient receives the full
amount, so the fee is charged on top rather than skimmed off; the sender's ETH balance does
not move; and after the first send the EOA is delegated to the contract
[t5](#t5-is-the-delegation-contract-what-it-claims-to-be) verified.

**Result:** 0.1 USD₮ delivered for a 0.0105 USD₮ fee from an account holding zero wei
([`0xad810dc2…`](https://arbiscan.io/tx/0xad810dc20ff55d2d5cbe3b6dff9475ba2af56cab2e1dada7e52d2e473e4221a8)).
A second send cost 0.0074 and took 1.3s.

**Found: the gasless wallet cannot make an account's first transaction.** `transfer()` prices
the operation before signing the EIP-7702 authorization, so the bundler simulates an EOA
with no code and returns `AA20 account not deployed`. `quoteTransfer()` has the same hole,
which breaks quote-then-confirm for every new account. t10 gets through with
`signTransaction()` then `sendTransaction()`, and then proves the diagnosis by re-quoting:
once delegated, the same quote works. Finding 16.

**Also found:** the bundler and the paymaster have to be two different providers. Candide
prices USD₮ correctly but cannot submit EntryPoint v0.8 operations — it returns the
EntryPoint's own bytecode as an error string — so t10 submits through Pimlico and keeps
Candide as the paymaster. `MOOR_BUNDLER_URL` and `MOOR_PAYMASTER_URL` override each.

## Not tests: `seed-contact.js`, `check-book.js`, `ask-phone.js`

Demo drivers. They talk to a **running app** rather than asserting anything, and they exist
because verifying two-device behaviour needs a third party that isn't a phone.

`ask-phone.js` is the interesting one. It derives the phone's peer key from the same
recovery phrase — nothing is exchanged to learn it — checks the phone is announced on the
public DHT and refusing strangers, introduces a laptop peer by writing a contact into the
shared address book, and then asks for 25 USD₮. The phone shows it in about a second and a
half. `--probe` stops after the refusal check.

**Found here: writing is not delivering.** `request()` used to resolve when `socket.write()`
returned. On device the phone accepted the connection and received *zero bytes*, because the
sender closed the socket immediately afterwards; draining the encrypted stream didn't help
either, since that isn't the layer that holds the bytes. Two layers reported success and
nothing arrived. The receiver now acknowledges and `request()` waits for it.

## t11 — The QR exchange

t8 called `setPeers()` with the right keys already in hand, under a comment reading *"they
meet once, by QR"*. t11 is that line made real: Bob reads Alice's card, writes it into a real
address book, and rebuilds his allowlist from the book exactly as the phone does.

**Proves:** one scan is enough. Before it, Alice is refused. After it, her request lands —
and the address travelled in the same scan, so Bob can pay her back without anyone reading
out 42 characters. A re-scan finds the existing contact by peer key rather than filing a
second Alice.

**Also proves the codec rejects what it should.** Eleven malformed inputs come back `null`,
including a plain `0x…` address QR — the single most likely wrong code to point a camera at,
and the one an over-eager parser would half-import.

It imports `app/src/wdk/contactCard.mjs` rather than reimplementing it. A wire format only
round-trips if there is one of it; two copies that drift is how a QR quietly stops scanning.
That file is the one `.mjs` in a folder of `.ts` for exactly this reason — Bare and Hermes
both run plain ESM, TypeScript does not.

**Result:** the card is 126 characters, comfortable QR density, and the request arrives in
13ms on a local DHT.

---

## Re-running these later

The WDK packages were shipping weekly when this was written. Versions used on 2026-08-10:

| Package | Version |
|---|---|
| `@tetherto/wdk-p2p-address-book` | 1.0.0-beta.3 |
| `@tetherto/wdk-react-native-core` | 1.0.0-beta.15 |
| `@tetherto/wdk-worklet-bundler` | 1.0.0-beta.9 |
| `@tetherto/wdk-wallet-evm-7702-gasless` | 1.0.0-beta.3 |
| `blind-peer` | 3.13.0 |
| `hyperdht` | 6.33.0 |

If a test starts failing, that's information rather than breakage — check whether the
finding it encodes has been fixed upstream, and update `SPEC.md §2` accordingly.
