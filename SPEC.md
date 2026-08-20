# Moor — specification

**A self-custodial USD₮ wallet where one seed and one worklet serve two stacks: WDK moves the money, Holepunch moves everything else. No server holds your keys, your contacts, or your ability to transact.**

*Precision, since we operate one machine: Moor runs a **blind peer** — an always-on mirror that stores sealed blocks it cannot read, so a second device can catch up while the first is switched off. It is not a backend. It never sees plaintext, holds nothing you don't already have locally, is interchangeable with anyone else's, and can be dropped entirely at the cost of offline sync. Everything else in the app — money, identity, contacts, payment requests — runs with nothing in the middle. See §10.*

*Status: Phases 1, 2, 2.5, 3 and 4 done — the mirror is live, contacts sync across devices, payment requests cross between strangers, and the app sends real USD₮ while holding no ETH. The QR exchange renders a card that decodes correctly off a device screen, and `lab/t11` proves everything after a scan, but the camera capture path has not been run. What remains is that, Android for payment requests, Phase 3.5 (design system) and Phase 5 (durable requests); §4 has the order. Every claim marked ✅ was verified by running code in [`lab/`](lab/) or [`app/`](app/) between 2026-08-10 and 2026-08-20; claims marked 📖 were verified by reading published source. Nothing here is taken from a README on trust — the first thing we tested contradicted one, and so did the fourth.*

---

## 1. Why this exists

WDK's React Native core runs the wallet inside a **Bare worklet**, not the JS thread. Holepunch's stack runs natively in Bare. And `@tetherto/wdk-p2p-address-book` — an Autobase/Hyperswarm/blind-peer address book, first published 2026-07-10 and at `1.0.0-beta.3` since the morning of 2026-08-10 — plugs into *that same worklet* through an undocumented `modules:` key in the bundler config.

So the two stacks are already one runtime. **Nothing public demonstrates it.** There is no example app, the `modules` bridge has no published sample, and `useModule` — the hook the whole thing hangs on — is exported from `wdk-react-native-core` but never mentioned in its README.

### It is already shipping — closed

tether.wallet **1.7.0** (2026-07-16) shipped *"Contacts: save and manage your addresses in a new address book"* — six days after `wdk-p2p-address-book` beta.1 hit npm. The package's own README example namespaces the book `'tether-wallet'`, and its address-type enum is exactly tether.wallet's identifier set, UMA included (the `name@tether.me` handles). High-confidence inference, not proof — we can't read their binary — but it is almost certainly the same package.

That changes Moor's position, for the better:

- **The library is not an untested novelty.** It very likely backs a consumer app with a large user base. Risk down.
- **The architecture is already decided in the open direction.** Contacts went peer-to-peer. Notably their *wallet backup* did not — that's an encrypted blob on Tether's servers with the key in your iCloud/Drive. So the P2P choice here was deliberate, not ideological blanket policy.
- **What's missing is the reference implementation, not the feature.** Tether ships this privately, documents none of the architecture, publishes no blind-peer keys, and leaves third-party adopters a package that cannot sync without infrastructure they must build themselves.

Moor is the open version of what already ships closed — small enough to read in an afternoon, honest enough to name what doesn't work yet. And M2 (§5), payment requests between two people, remains unshipped by anyone.

---

## 2. Ground truth — what we actually verified

Run `cd lab && npm install && npm run t1 && npm run t2 && npm run t3` — and the rest, up to `t10`. Only `t10` touches real money, and it quotes without spending unless you pass `--send`.

| # | Claim | Result |
|---|---|---|
| T1 | `fromSeed` → `create()` opens a writable book **fully offline** | ✅ 88ms |
| T1 | Contacts and addresses round-trip; `update` event fires; `search()` matches partials | ✅ |
| T1 | `address.type` is a **closed, runtime-enforced enum** | ✅ rejected `moor-peer` |
| T1 | Mooring key fits in `Contact.username` (69 chars vs the 256 limit) | ✅ workaround holds |
| T2 | Same seed + namespace → **identical autobase key** across three fresh corestores | ✅ `80b73c63…` ×3 |
| T2 | Different namespace, and different seed, → different books | ✅ isolation holds |
| T3 | **Device B restores the entire book from 12 words alone, no server** | ✅ local DHT, 14.4–17.0s |
| T3 | The mooring key travels with the contact | ✅ M2 identity rides M1 |
| T3 | Writes on B propagate back to A — true multiwriter, not one-way backup | ✅ |
| T4 | `modules:` really does bundle the address book into a Bare worklet | ✅ hrpc, 6.5 MB |
| T4 | `modules:` on the `jsonrpc` transport is **silently dropped** | ✅ no wiring emitted |
| T5 | EIP-7702 delegation contract is identical on Arbitrum, Ethereum, Polygon | ✅ 3639 bytes, one hash |
| T6 | Same restore over the **public DHT + hosted blind peer** | ✅ **2.1–2.6s** |
| T7 | An **already-open** book receives a remote write, no restart or polling | ✅ ~4s |
| T8 | A payment request crosses between two peers with **different seeds**, no server | ✅ 7ms, local DHT |
| T8 | Sender identity comes from the **Noise session**, not the payload | ✅ unspoofable |
| T8 | A stranger who knows the key is refused; adding them as a contact lets them in | ✅ the allowlist is the firewall |
| T9 | The same request over the **public DHT**, real NAT, real hole-punching | ✅ **1.4–2.7s** |
| — | The module loads in the **worklet on an iPhone** and announces on the public DHT | ✅ `ask-phone.js` |
| — | A laptop asks the phone for 25 USD₮; a stranger is refused | ✅ **1.5s**, on device |
| T10 | An account holding **zero wei of ETH** transfers USD₮0 on Arbitrum One | ✅ real money, [`0xad810dc2…`](https://arbiscan.io/tx/0xad810dc20ff55d2d5cbe3b6dff9475ba2af56cab2e1dada7e52d2e473e4221a8) |
| T10 | The fee is quoted **and charged** in USD₮; the recipient gets the full amount | ✅ 0.0105 then 0.0074 USD₮, charged on top |
| T10 | The sender's ETH balance does not move | ✅ 0 wei before and after |
| T10 | The first send is rejected — WDK prices before it signs the 7702 authorization | ✅ `AA20`, finding 16 |
| T10 | Once delegated, the same quote works | ✅ 0.017266 USD₮ — the AA20 was the missing authorization |
| — | **A send from the app's own screen**, tapping a contact, on an iPhone | ✅ 0.1 USD₮ delivered, 0.0088 fee, 0 wei ETH |
| — | `useBalance` never fetches on a fresh install unless `staleTime` is overridden | ✅ finding 19 |
| T11 | A scanned card writes a contact, rebuilds the allowlist, and a refused sender gets through | ✅ 13ms, local DHT |
| T11 | Eleven malformed inputs rejected, including a plain `0x…` address QR | ✅ nothing half-imports |
| — | **The contact card renders on an iPhone and decodes off the screen** | ✅ Vision → `contactCard.mjs`, 126 chars |
| — | Both themes, IBM Plex and the tabular balance render on device | ✅ screenshots in `README.md` |

T3 runs on a **local** `hyperdht` bootstrapper and a **local** `blind-peer`, so it is hermetic: no public DHT, no Tether infrastructure, nothing to flake. Device A and device B never connect to each other — the blind peer stores and serves encrypted blocks it has no key to. (Distinct from a *blind relay*, which forwards traffic and stores nothing; blind peers persist.) That is the entire trust story, demonstrated in one file.

### Findings this produced

1. **`fromSeed()` returns a read-only book.** 📖✅ The README says it "figures out whether this is the first device, a restoring device, or a reopen"; in fact construction never enrolls a writer. You must call `create()` (new book) or `addMirror()` (join existing). `create()` appears in the `.d.ts` and in a source comment — and nowhere in the README. This is the first wall any integrator hits; it cost us our first run.
2. **The address-type enum is closed with no extension point.** ✅ `ADDRESS_TYPE_SET` (index.js:41) is frozen over 7 payment types and enforced at index.js:569. A P2P wallet therefore *cannot* store a peer identity key as an address — the one thing a P2P address book might be expected to hold. Moor works around it via `Contact.username`; the real fix is upstream (§8).
3. ~~**Restore takes 14–17s against a 20s default timeout.**~~ **Retracted 2026-08-11.** ✅ Those numbers came from a single-node local DHT (`lab/t3`), not from the real network. Over the **public DHT against a hosted blind peer** (`lab/t6`) the same restore takes **2.1–2.6s** — an 8× margin, not 15%. Not a warmup effect either: removing the mirror's head start changes nothing. [Corrected on address-book#8](https://github.com/tetherto/wdk-p2p-address-book/issues/8). What survives is smaller: the timeout failure is terminal rather than retryable, and there's no progress event to build an honest restore screen on. *Lesson recorded rather than buried — a hermetic test rig measured its own topology, and we reported it as a property of the library.*
4. **The blind-peer infrastructure the package assumes does not publicly exist.** 📖 WDK's README tells integrators to ship "a fixed set of blind-peer public keys… like DHT bootstrap nodes." Tether publishes none — while shipping the feature itself in tether.wallet 1.7.0 (§1). Whether their app has sync switched on, and therefore whether they operate mirrors today, can't be determined from outside; either way the adopter-facing gap is the same. This is the **Indexer pattern from the Part 1 audit, repeated**: Tether operates what it needs and hands third parties a dependency they must stand up themselves. Nor is there a network-wide default to fall back on — Holepunch's own client library says so outright: *"`blindPeers`: a list of `{ key, group }` blind peers (mirrors) to use. **You should always set this, otherwise there are no mirrors to contact.**"* ([blind-peering](https://github.com/holepunchto/blind-peering)), and [blind-peer](https://github.com/holepunchto/blind-peer) ships no hosted service and no well-known keys. Holepunch runs blind peers for Keet; those keys are Keet's. So the transport layer is public infrastructure and the storage layer is bring-your-own: **every WDK adopter must operate this themselves or multi-device contacts silently don't work.** Moor operates one publicly (§10) rather than pass the problem on.
5. **`useModule` is undocumented.** 📖 Exported from `wdk-react-native-core` beta.15, it is the only bridge to bundled modules, and the shipped README never names it.
6. **`generate --install` doesn't install everything it needs, and misdirects you when it fails.** ✅ The hrpc build stops with `Missing dependency '@tetherto/pear-wrk-wdk/worklet'` and advises `npm install @tetherto/pear-wrk-wdk/worklet` — not a valid package name. The real fix is `npm install @tetherto/pear-wrk-wdk`. After that the bundle builds in 0.56s. Second wall after finding 1, same character: a correct mental model defeated by a wrong instruction.
7. **An official React Native starter exists, and it doesn't use any of this.** 📖 `tetherto/wdk-starter-react-native` is live and actively pushed, with a `docs/WDK_INTEGRATION.md` that is the best WDK documentation we've found anywhere — it names the traps (*"do not use `@tetherto/wdk-react-native-provider`"*), and flags that `useWalletManager().status` can report `UNLOCKED` before the worklet is genuinely ready. None of it is in the packages. Two observations: its npm package `@tetherto/wdk-starter-react-native` is still a **0.0.0 placeholder** while the repo is real (the same npm-vs-repo divergence as `wdk-mcp-toolkit`), and it pins two dependencies to **personal forks** — `github:claudiovb/wdk-worklet-bundler#fix/peerDep` and `github:Boka44/wdk-backup-cloud`. The canonical example doesn't build from published packages alone. Most usefully for us: **its `wdk.config.js` has no `modules:` block**, so it doesn't touch the P2P address book. Moor remains the only public demonstration of the two stacks in one worklet.
8. **The rn-core README's examples don't compile against the version that ships them.** ✅ `useWdkApp()` returns `{ state }`, not `{ isReady, error }`; `useAddresses()` returns `{ data }`, not `{ addresses }`; `createWallet()` takes a `walletId` argument. Every snippet in "Guide to Hooks" fails `tsc`. Worth adding to the `useModule` issue rather than filing separately.
9. **`wdk-react-native-core` is unusable on Expo SDK 55 without an undocumented override.** ✅ It depends on `expo-crypto@^56.0.4` — an SDK **56** native module. On an SDK 55 app the build succeeds silently and the app dies on first render with `Cannot find native module 'ExpoCrypto'`. SDK 55 is what Tether's own starter targets, and that starter carries `"overrides": { "expo-crypto": "~55.0.16" }` — so the workaround is known internally and documented nowhere. A native Expo module arguably belongs in `peerDependencies`, since exactly one copy must match the host SDK. Cost us one build cycle; filed as [rn-core#82](https://github.com/tetherto/wdk-react-native-core/issues/82).
10. **The most security-sensitive constant in a gasless wallet ships with no value and no registry.** 📖✅ `wdk-wallet-evm-7702-gasless` requires `delegationAddress` — the contract an EOA hands execution authority to under EIP-7702. WDK ships no per-chain value, and the [official configuration reference](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-7702-gasless/configuration/) says *"users must verify this address independently for their target chain"* while providing nothing to verify against. Tether's own React Native starter hardcodes one with a comment conceding it **assumes** the same address across Ethereum/Arbitrum/Polygon from CREATE2 convention, "not independently confirmed per chain." WDK ships `@tetherto/wdk-asset-registry` so nobody hardcodes token addresses; there is no equivalent for protocol constants, so the risk sits on the integrator. We verified it ourselves (`lab/t5`): identical 3639-byte runtime bytecode at `0xe6Cae83B…8555B` on all three chains. The assumption holds — but every adopter is being asked to re-derive that alone, for the one address that can drain an account.
11. **A `hyperdht` network with one node in it cannot connect anything, and says so misleadingly.** ✅ Two peers on a lone local bootstrapper fail every dial with `DHTError: HOLEPUNCH_ABORTED`, thrown from `connect.js:240` via `Holepuncher.destroy`. The error names hole-punching, so it reads as a NAT problem between the two peers — in fact it's a property of the *bootstrapper*. A single node can't observe a peer from two vantage points, so every node stays `firewalled: true`; hyperdht then declines the direct path and hole-punches; hole-punching needs relay nodes to carry `probeRound`; there are none; `probeRound` throws and the connection aborts. Adding three ordinary `new DHT({ bootstrap, ephemeral: false, firewalled: false })` nodes makes the same dial succeed in **7ms** (`lab/t8`). Nothing in the hyperdht README says a test network needs more than a bootstrapper, and this is the standard recipe every integrator copies. *Third time a hermetic rig has misled this project — see finding 3 and the t7 retraction. An isolated test measures its own topology.*
12. **A `modules:` entry can't be a path in your own repo — the bundler validates it one directory away from where it uses it.** ✅ `resolveModule` accepts a relative `package` and resolves it against the **project root**; the code generator writes the same string verbatim into a `require()` inside `.wdk/wdk-worklet.generated.js`, one level **deeper**. So `'./modules/x'` passes validation and fails to resolve at bundle time, `'../modules/x'` does the reverse, and no value satisfies both. Since `modules:` is the only extension point WDK offers, every integrator writing their own module hits this. Moor's workaround is to install the directory as a local `file:` dependency so it has a package name (`app/modules/pay-requests` → `@moor/pay-requests`), which is arguably tidier anyway but is nobody's first guess.
13. **A worklet's `console.log` goes nowhere.** ✅ Host-side `console.log` reaches Metro; the same call inside the Bare worklet does not appear in the Metro log, the Xcode log, or `simctl log stream`. This is worth knowing before you debug anything in there, because absence of output looks exactly like code that never ran — it cost us an hour of reasoning from evidence that did not exist. The way to see inside a module is to keep counters on the instance and expose a method that returns them, then call it over `callModule`.
14. **`modules:` is silently ignored on the `jsonrpc` transport.** ✅ Configure it, and the generated worklet simply has no "Load modules" section — no warning, no error, no mention in the output. `hrpc` emits `moduleManagers['addressBook'].createModule`; `jsonrpc` emits nothing and reports success. Since `jsonrpc` is the Swift/Kotlin transport, **this is what rules out Flutter** (§3). A silent no-op is worse than an unsupported feature: the integrator has no signal at all until the module isn't there at runtime.
15. **The host registers its `moduleEvent` handler lazily, so the first event a module emits kills the app.** ✅ `wdk-react-native-core` only attaches a host-side handler for `moduleEvent` — the one command that flows worklet → host — once app code subscribes to something. Until then the worklet emits into a handler that does not exist and the process dies, deep inside generated RPC code with no route back to the cause. Since the address book emits `update` on its own during enrolment, *any* app that bundles a module hits this before its first render. The fix is one line in `moduleService.ts`; finding it took most of a day. Moor's workaround is to subscribe in `Root.tsx` before anything else starts. Filed as [rn-core#83](https://github.com/tetherto/wdk-react-native-core/issues/83) — **the most consequential of the nine we filed**, because it blocks the entire `modules:` feature that the P2P address book exists for.
16. **The gasless wallet cannot perform an account's first transaction.** ✅ In token-paymaster mode `transfer()` (line 338) and `sendTransaction()` (line 301) call `_getUserOperationGasCost` to price the operation *before* signing it, and that call omits the EIP-7702 authorization. The bundler simulates an EOA with no code and returns `AA20 account not deployed`. The code that signs the authorization, `_buildSignedUserOperation` (line 411), is downstream of the code that needs it. `quoteTransfer()`/`quoteSendTransaction()` have the same hole, so quote-then-confirm — the obvious shape for a send screen — is broken for every new account. The way through is `signTransaction(tx)` followed by `sendTransaction(signedOp)`, which builds the authorization and broadcasts without re-estimating; that is what `lab/t10` does and what moved Moor's first money. Confirmed by the account's own behaviour: once the first send delegates the EOA, `quoteTransfer()` works and returns 0.017266 USD₮ — the AA20 was the missing authorization and nothing else. Not yet filed; the fix upstream is to pass the authorization into the estimation call.
17. **Candide's public bundler estimates EntryPoint v0.8 operations and cannot submit them.** ✅ `eth_estimateUserOperationGas` succeeds; `eth_sendUserOperation` returns the EntryPoint's own runtime bytecode as an error string, in Python `bytes` repr form. The same endpoint returns clean `AAxx` errors for v0.7 operations and lists v0.8 in `eth_supportedEntryPoints`, so it is specific to submitting v0.8 — the version EIP-7702 requires. Not WDK's defect. Moor now submits through Pimlico's public bundler and keeps Candide as the paymaster, which WDK supports through the separate `paymasterUrl` config key.
18. **Candide published a USD₮ exchange rate scaled for 18 decimals against a 6-decimal token — once.** For roughly twenty minutes the paymaster demanded 22 billion USD₮ of allowance to cover a fee worth 2.2 cents: the same digit sequence shifted by 10¹². USDC and DAI were priced correctly throughout, on Ethereum, Arbitrum and Optimism alike, so it was specific to the Tether-issued entries. It has read correctly on every sample since. Recorded as observed rather than filed, because it cleared on its own and we cannot reproduce it. *Worth keeping precisely because the first write-up of it generalised a single reading into a standing cross-chain bug.*
19. **`useBalance` never fetches on a fresh install, and shows an em dash instead of a balance.** ✅ It seeds the query with `initialData = { success: true, balance: BalanceService.getBalance(…) }`, and on a wallet that has never fetched, that balance is `null`. TanStack treats seeded data as fresh, so under the default 30s `staleTime` the first fetch never fires and nothing triggers a later one — there is no `refetchInterval`, and React Native has no window-focus event. The screen shows `—`, which `formatUnits` returns for null, and that is indistinguishable from a balance of nothing. It only looks correct from the second run onwards, once MMKV holds a real number, which is why it survives casual testing. Moor passes `staleTime: 0`. Worth reporting: an unrecoverable "you have nothing" on first launch is the worst possible failure for a wallet, and the seeded row would be better omitted than published as `success: true` with a null balance.

---

## 3. Architecture

*Narrative version, for someone meeting this for the first time:
[`ARCHITECTURE.md`](ARCHITECTURE.md). What follows is the specification.*

```
┌─ React Native — UI thread ─────────────────────────────────┐
│  useWalletManager · useBalance · useAccount                │
│  useModule<AddressBookApi>('addressBook')                  │
│  useModule<PayRequestApi>('payRequests')      ← our module │
└───────────────────── hrpc over BareKit ────────────────────┘
┌─ Bare worklet — one thread, one seed ──────────────────────┐
│  WDK        HD accounts · USD₮0 · gasless send (EIP-7702)  │
│  Holepunch  Autobase address book · HyperDHT · Hyperswarm  │
└────────────────────────────────────────────────────────────┘
        ↓ Arbitrum                        ↓ DHT — no server
```

The seed enters the worklet once. WDK derives `m/44'/60'/0'/0/0`. The address book derives its Autobase key via `deriveSeedKey(seed, { salt, info: namespace + ':…' })`. Moor derives its mooring keypair with the **same helper from `@tetherto/wdk-utils`**, a different `info`:

```js
import { deriveSeedKeyPair } from '@tetherto/wdk-utils'
const mooring = deriveSeedKeyPair(seed, { salt: MOOR_SALT, info: 'moor:peer-identity' })
```

One secret, three derived identities, none of which leave the thread.

### Platform: React Native, and why not Flutter

Moor targets **React Native** — one codebase, both iOS and Android. That is a constraint, not a preference, and T4 established it rather than a doc comment.

WDK's bundler has two transports. `hrpc` targets React Native; `jsonrpc` targets Swift and Kotlin, which is the only path a Flutter plugin could take. **`modules:` works on `hrpc` and is silently dropped on `jsonrpc`** (finding 11) — and `modules:` is precisely how the P2P address book gets into the worklet. No modules, no contacts, no M1, no M2.

A Flutter build would therefore need a hand-written worklet entry point, a JSON-RPC module bridge that doesn't exist, a BareKit Flutter plugin, and a Dart reimplementation of `wdk-react-native-core`'s state layer. That is *building WDK's missing mobile infrastructure*, not demonstrating WDK — a different project, and a much larger one.

The underlying requirement — a single app on both platforms — React Native satisfies completely. If the goal ever became "prove WDK can reach Flutter," the honest first step is upstream: get `modules:` wired for `jsonrpc`, then a Dart binding. Worth filing (§8); not worth blocking on.

Bundler config — the whole integration, in one file:

```js
// wdk.config.js
module.exports = {
  networks: { arbitrum: { package: '@tetherto/wdk-wallet-evm-7702-gasless' } },
  modules: {
    addressBook: { package: '@tetherto/wdk-p2p-address-book', factory: 'createWorkletModule', events: ['update'] },
    // A package NAME, not a path — see finding 12. `app/modules/pay-requests` is installed
    // as a local `file:` dependency. No `events`: that key only auto-wires instance.on(),
    // and PayRequests calls the `emit` it was handed instead.
    payRequests: { package: '@moor/pay-requests', factory: 'createModule' }
  },
  allowedModuleMethods: {
    addressBook: { methods: ['listContacts', 'addContact', 'addAddress', 'listAddresses', 'search', 'getInfo'] },
    payRequests: { methods: ['getIdentity', 'setPeers', 'request'] }
  }
}
```

---

## 4. Milestones

These are *what* gets built, and the phase column is the order it happens in. Two of the
phases aren't features: getting anything to launch on a phone (Phase 1) and standing up the
blind peer (Phase 2.5).

| Milestone | Roadmap phase |
|---|---|
| M0 — Money | Phase 2 — **done**; balance, receive and send all work from the app, except an account's first ever send (finding 16) |
| M1 — Your devices agree | Phase 3 — done, live on both platforms; Phase 2.5 done |
| M2a — Two humans, no server | Phase 4 — done on device; the QR exchange's camera half is unrun |
| M2b — Durable requests | Phase 5 |

### M0 — Money (WDK only)
Create/import 12 words → keychain via `wdk-react-native-secure-storage`. USD₮0 balance on Arbitrum. Receive (address + QR). Gasless send. History.

**Done when:** a USD₮0 send settles on Arbitrum from the phone with no ETH in the account, ever.

✅ *The money moves.* An account holding zero wei sent 0.1 USD₮0 on Arbitrum One and paid 0.0105 USD₮ in fees — [`0xad810dc2…`](https://arbiscan.io/tx/0xad810dc20ff55d2d5cbe3b6dff9475ba2af56cab2e1dada7e52d2e473e4221a8), `lab/t10`. A second send cost 0.0074 and took 1.3s. The recipient got the full amount both times, so the fee is charged on top rather than skimmed off the transfer.

**Done from the app's own screen too**, with one hole. Tapping a contact and sending 0.1 USD₮ on the phone delivered exactly 0.1 and cost 0.0088, from an account holding zero wei. What still cannot work is an account's *first* send: finding 16 means WDK prices a transfer before signing the EIP-7702 authorization, and the two-step workaround has to run inside the worklet, because a signed user operation is full of BigInts and the bridge stringifies them. Receiving works; a new account's first spend does not.

**The bundler and the paymaster are two providers**, not one. Candide prices USD₮ correctly but cannot submit EntryPoint v0.8 operations (finding 17), so Pimlico's public bundler submits and Candide's public paymaster pays. Both keyless. WDK supports the split through `paymasterUrl`.

### M1 — Your devices agree (Holepunch)
Contacts backed by the P2P address book. Send picks a *contact*, never a pasted string — which retires clipboard-swap malware and typos in one move.

**Done when:** the iOS simulator and the Android emulator, seeded with the same 12 words, converge on one contact list through the Moor blind peer (§10) or one the reader runs, with no backend. ✅ *Already proven in Node by T3; M1 is the port, not the risk.*

### M2a — Two humans, no server
A Hyperswarm/HyperDHT module of our own, in the same worklet. Alice taps *request 25 USD₮* → Bob's phone emits `request` → tap prefills Send. See §5 for discovery.

**Done when:** two phones on different seeds exchange a payment request with no server in the path, and a stranger's connection is refused. ✅ *Working on an iPhone. The module runs in the worklet, announces on the public DHT, builds its allowlist from the address book, and shows an incoming request from a laptop peer in ~1.5s. A stranger is refused. The tap that prefills Send now exists: an incoming request carries a peer key, the address book turns that into a saved Arbitrum address, and Pay opens Send with both filled in. If the contact has no address saved, Pay is disabled and says so rather than offering a paste field — reintroducing pasted addresses at that exact moment would undo the point of contacts. The introduction is a camera rather than a script: the Exchange screen shows your card as a QR and reads theirs, which is what §5 describes. **The showing half is verified on a phone** — the rendered QR was decoded off a device screenshot by Apple's Vision framework and parsed by `contactCard.mjs`, giving back the right address and peer key. `lab/t11` proves everything after a scan. **The camera capture path is still unrun**, because the Simulator has no camera.*

**Delivery means acknowledged.** `request()` waits for the recipient's app to ack, not for `write()` to return. Measured on device: the phone accepted the connection and received **zero bytes** because the sender closed the socket right after a successful write — and draining the Noise stream did not fix it either. Both layers reported success while nothing arrived.

### M2b — Durable requests (stretch)
Alice appends the request to her own hypercore, payload encrypted to Bob's mooring key; the blind peer mirrors it; Bob replicates when he next opens the app. Bob derives Alice's outbox key from her mooring key, so nothing new is exchanged. Reuses M1's corestore and blind peer exactly.

**Done when:** a request sent to a powered-off phone arrives when it wakes.

---

## 5. How Alice finds Bob

She doesn't — not without one out-of-band exchange. **There is no directory in a serverless system,** and any design claiming otherwise has smuggled a server in. Keet has invite links; Signal has safety numbers; Bluetooth has pairing. Moor has a QR code, once.

What makes it work is that the *once* is cheap and the *never again* is permanent.

1. **First contact.** Alice shows a QR. Bob scans — a gesture both Trust and tether.wallet already trained him to make. *Built. The card renders on a phone and decodes correctly off the screen; T11 proves what follows a scan. The camera capture path is unrun — the Simulator has no camera.* The card is a URI, `moor://contact?a=<0x…>&k=<64 hex>`, 126 characters, which is a QR that reads across a table. It carries no name: Bob types one, the way a phone works. Both directions need a scan, because one scan can only introduce one of them — the alternative, a pairing window that accepts one inbound stranger, would trade away the property in §5's last paragraph. For remote pairing, `blind-pairing` (v2.3.1, the primitive behind Keet's room invites) reduces the same handshake to a short string he can paste into WhatsApp, without the DHT learning the secret. Not built.
2. **Storage.** Bob saves Alice as a contact: her USD₮0 address as an `evm`/`arbitrum` address, her mooring key in `username` as `moor:<hex>` (per finding 2). Because that is the M1 address book, **Alice appears on Bob's other devices, mooring key included, with no code written for it.** ✅ Proven by T3. A re-scan matches on the peer key first and the address second, so the same person is updated rather than filed twice — the book rejects a second contact holding an address it already knows, which would otherwise make a repeat scan fail rather than do the obvious thing.
3. **Ever after.** `dht.connect(aliceMooringKey)` yields a Noise stream, encrypted and mutually authenticated by construction. Alice runs `dht.createServer()` on her key.

### The property worth naming

Alice's server checks the remote public key against her address book and drops anything it doesn't recognise. **Your contacts are your firewall.** An unsolicited payment request isn't blocked — it's unroutable.

That is a product argument, not a technical nicety. Request-spam is *the* abuse channel on Venmo, Zelle and Cash App, and all three fight it with server-side moderation because their architecture lets strangers address you. Moor can't be spammed for the same reason it can't be shut down.

---

## 6. Non-goals

Multi-chain (USD₮0 on Arbitrum only — one asset keeps every screen legible), fiat on-ramp, swaps, and `@tetherto/wdk-uikit-react-native`, which is stale at beta.2 since Oct 2025 while everything around it ships weekly. Moor writes its own thin UI.

---

## 7. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Address book is young (beta.1 Jul 10) and unproven | was **high** | **Retired twice over.** T1–T3 exercise it end to end ✅, and it almost certainly backs tether.wallet 1.7.0 (§1) |
| "P2P contacts in a wallet" is no longer novel — Tether shipped it first | low | Never the point. Moor is the *open* implementation, and M2a remains unshipped by anyone |
| Second device can't join without a blind peer | medium | By design (`_ensureEnrolled({bootstrap:true})` requires a mirror 📖). Moor operates one publicly (§10) and ships the script to replace it |
| We now operate infrastructure, so "no server" needs qualifying | medium | Stated precisely at the top and in §10: sealed blocks, interchangeable, droppable. Never claim more than that |
| ~~14–17s restore vs 20s timeout~~ | ~~medium~~ | **Retired** — our own rig's number, not the library's. 2.1–3.8s on the public network (finding 3). What survives: the timeout throws rather than retries, and there is no progress event |
| The gasless wallet cannot make an account's first send | **high** | Finding 16, unfixed. `lab/t10` works around it outside the worklet; the app cannot. Blocks a genuinely new user's first payment |
| Fees depend on a bundler *and* a paymaster, from two providers | medium | Both keyless and both config values, and self-gas remains a build option. Candide's v0.8 submission failure (finding 17) is why they are split |
| iOS needs xcframework linking (`bare-link`, `addons.yml`) | medium | Expo prebuild + dev client, not Expo Go. Budget a day for first build |
| `wdk-cli` beta.1 pins `@tetherto/wdk` beta.6 vs beta.15 current | low | Don't build on the CLI |
| Single outbox core leaks a request *count* to contacts (M2b) | low | Per-contact cores; noted as known rather than hidden |

---

## 8. To report upstream

Numbers below are the finding numbers in §2. The full picture, including what is not filed and where it belongs, is in [`upstream/README.md`](upstream/README.md).

**Filed** — seven on 2026-08-10 from `lab/`, two on 2026-08-11 while building the app:

| Finding | Issue |
|---|---|
| 1 · read-only `fromSeed()` | [address-book#5](https://github.com/tetherto/wdk-p2p-address-book/issues/5) |
| 2 · closed address-type enum | [address-book#6](https://github.com/tetherto/wdk-p2p-address-book/issues/6) |
| 3 · restore vs timeout — **retracted by us** | [address-book#8](https://github.com/tetherto/wdk-p2p-address-book/issues/8) |
| 4 · blind-peer keys | [address-book#7](https://github.com/tetherto/wdk-p2p-address-book/issues/7) |
| 5 · `useModule` undocumented | [rn-core#81](https://github.com/tetherto/wdk-react-native-core/issues/81) |
| 6 · `--install` misdirects | [bundler#47](https://github.com/tetherto/wdk-worklet-bundler/issues/47) |
| 9 · `expo-crypto@^56` breaks Expo SDK 55 | [rn-core#82](https://github.com/tetherto/wdk-react-native-core/issues/82) |
| 14 · `modules:` dropped on jsonrpc | [bundler#46](https://github.com/tetherto/wdk-worklet-bundler/issues/46) |
| 15 · lazy `moduleEvent` handler crashes any bundled module | [rn-core#83](https://github.com/tetherto/wdk-react-native-core/issues/83) |

The highest-value ask remains **2**: an extensible address-type registry, or a `hyperdht` member, so a P2P wallet can store a peer identity in the P2P address book without abusing a display field. Small change, obvious use case, and this repo is the use case.

**Not yet filed.** Ranked: **16** (the gasless wallet cannot make an account's first transaction — a defect with a one-line fix that every new user hits on their first spend), **10** (`delegationAddress` ships with no value and no registry — the security one, and `lab/t5` is the receipt), **12** (a `modules:` entry cannot be a path in your own repo), **8** (README examples don't compile; belongs as a comment on rn-core#81 rather than a separate issue), **7** (an observation about the starter, not a defect — though the 0.0.0 npm placeholder and the two personal-fork pins are each worth raising if the starter is meant to be the canonical entry point). **11** and **13** are Holepunch's rather than Tether's; **17** and **18** are Candide's.

---

## 9. Open questions

- M2b in scope for v1, or filed as the honest "what about offline" answer with a design and no code?
- Is a screenshotted card a problem worth solving? A card is a bearer token for *reaching* someone, not for spending: the worst it buys is the ability to send them a payment request, which they can revoke by deleting the contact. A `blind-pairing` invite would still be better for pairing at a distance, where the card would travel through WhatsApp and sit in a chat history forever.

- Does the app work around finding 16 or wait for it upstream? Working around it needs the sign-then-broadcast pair to run *inside* the worklet, which means either a WDK change or our own account module — a lot of surface to own for a bug with a one-line fix elsewhere.

**Resolved 2026-08-10:** ~~Do we ship a public blind peer, or require every reader to run one?~~ → **We run one.** See §10.

**Resolved 2026-08-18:** ~~Can the fee really be paid in USD₮ with no ETH anywhere?~~ → **Yes, on chain, twice.** See §2 T10.

**Resolved 2026-08-20:** ~~Does the QR carry a full contact card, or a `blind-pairing` invite that pulls it?~~ → **The card.** It is 126 characters and self-contained: everything Bob needs is in the pixels, with no handshake to complete and nothing to fetch. `blind-pairing` stays the right answer for pairing at a distance, which is a different feature and not built. See §5 and `lab/t11`.

---

## 10. Operating the Moor blind peer

A demo that opens with "first, provision a server" is not a demo. Moor ships a working
mirror key so a reader can clone, run, and watch two devices sync inside ten minutes.

**Live since 2026-08-11:** `a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o`, the
default in `app/src/wdk/config.ts`. A laptop restored a book through it in 3.8s over the
public DHT (`lab/t6`). It runs as a dedicated unprivileged user with `ProtectHome`, an empty
capability set and a 256 MB cap — a process whose job is accepting data from strangers gets
its own uid and nothing else. Setup and verification:
[`infra/blind-peer/README.md`](infra/blind-peer/README.md).

Running one is trivial (`blind-peer-cli`, one process, ~$5/month of VPS). Running one
*honestly* takes a little more, which is the part finding 4 is about.

**What we publish alongside the key**

- **Scope, in writing:** demo infrastructure, best-effort, no SLA, may be wiped without
  notice. Stating it is the point — a key you cannot plan around is only half published.
- **The script that runs it**, so replacing us is a config change, not a fork.
- **The fact that losing it costs you nothing.** Your data lives on your devices. A dead
  mirror costs you sync-while-offline, not contacts.

**Configuration**

An open mirror is free storage for strangers — anyone who learns the key can ask it to
hold arbitrary cores. `BlindPeer`'s constructor exposes the controls: `maxBytes` (defaults
to 100 GB; a demo should cap far lower — address books are kilobytes), `enableGc`,
`ipBanListKeys` / `banTimeout`, and `trustedPubKeys`. Start restrictive.

**Distribution**

The key ships as **config, never a constant**, and the app accepts a *pool* rather than a
single entry — `AddressBook.selectMirrors()` already ranks a pool by HRW so clients spread
across mirrors deterministically and churn little when the pool changes. That leaves room
to add mirrors, rotate ours, or let a user point at their own without an app update.
