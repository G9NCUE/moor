# Upstream reports

Twenty findings from building [Moor](../README.md) against WDK. Ten were filed — seven on
2026-08-10 from `lab/`, two on 2026-08-11 while building the app, one on 2026-08-21 — and one
of those we have since closed ourselves. **One is now fixed upstream and one has our PR open.**
Each is reproducible from [`lab/`](../lab/) and cites the source line it came from.

**This page is the index and the routing. [`SPEC.md §2`](../SPEC.md) is the canonical list**
and carries the full detail for every finding; numbers here are its numbers, and GitHub issue
numbers are unrelated.

Every one is an observation with a receipt, not a complaint. The packages are young and
moving weekly, and most of these exist *because* someone shipped something genuinely
interesting. Where we are inferring rather than knowing, the issues say so.

## Filed

| Finding | Issue | Type |
|---|---|---|
| 1 · read-only `fromSeed()` | [address-book#5](https://github.com/tetherto/wdk-p2p-address-book/issues/5) | docs |
| 2 · closed address-type enum | [address-book#6](https://github.com/tetherto/wdk-p2p-address-book/issues/6) | enhancement |
| 3 · 14–17s restore vs 20s timeout | [address-book#8](https://github.com/tetherto/wdk-p2p-address-book/issues/8) | **retracted, and closed by us 2026-08-20** |
| 4 · no published blind-peer keys | [address-book#7](https://github.com/tetherto/wdk-p2p-address-book/issues/7) | question |
| 5 · `useModule` undocumented | [rn-core#81](https://github.com/tetherto/wdk-react-native-core/issues/81) | docs |
| 6 · `--install` misdirects | [bundler#47](https://github.com/tetherto/wdk-worklet-bundler/issues/47) | bug |
| 9 · `expo-crypto@^56` breaks Expo SDK 55 | [rn-core#82](https://github.com/tetherto/wdk-react-native-core/issues/82) | bug — **fixed, merged and closed 2026-08-21** |
| 14 · `modules:` dropped on jsonrpc | [bundler#46](https://github.com/tetherto/wdk-worklet-bundler/issues/46) | bug |
| 15 · lazy `moduleEvent` handler crashes on any bundled module | [rn-core#83](https://github.com/tetherto/wdk-react-native-core/issues/83) | bug |
| 16 · gasless wallet cannot make an account's first transaction | [gasless#32](https://github.com/tetherto/wdk-wallet-evm-7702-gasless/issues/32) | bug |

Verified before filing: all three packages still at the versions the findings were captured
against (`address-book` beta.3, `bundler` beta.9, `rn-core` beta.15), so nothing had been
fixed underneath us. No duplicates existed.

**#83 is the most consequential of the nine.** It blocks the entire `modules:` feature — the
extension point the P2P address book exists for — and the error surfaces deep inside
generated RPC code with no path back to the cause. The fix is one line in `moduleService.ts`;
finding it took most of a day.

**#8 is the one we got wrong.** We reported a 14–17s restore against a 20s default timeout
as a reliability risk. That measurement came from our own single-node local DHT; on the
public network the same restore takes 2.1–3.8s. Retracted on the issue rather than left
standing. What survives is smaller and still worth fixing: the timeout failure is terminal
rather than retryable, and there is no progress event to build a restore screen on.

## Not filed yet

Ranked by what we'd send first. **16 has now been filed** as
[gasless#32](https://github.com/tetherto/wdk-wallet-evm-7702-gasless/issues/32); **19** leads
what is left.

| Finding | Where it belongs | The short version |
|---|---|---|
| **19 · the balance never loads on a fresh install** | `wdk-react-native-core` | `useBalance` seeds `{ success: true, balance: null }` and TanStack treats it as fresh, so the first fetch never fires. "You have nothing" is the worst wrong answer a wallet can give |
| **10 · `delegationAddress` ships with no value and no registry** | `wdk-wallet-evm-7702-gasless` | The docs say verify it independently and give nothing to verify against, for the one constant that can drain an account. [`lab/t5`](../lab/t5-delegation.js) is the receipt |
| **12 · a `modules:` entry cannot be a path in your own repo** | `wdk-worklet-bundler` | Validated against the project root, `require()`d one directory deeper. No relative path satisfies both, and `modules:` is the only extension point WDK offers |
| **8 · the rn-core README's examples don't compile** | comment on [rn-core#81](https://github.com/tetherto/wdk-react-native-core/issues/81) | `useWdkApp()` returns `{ state }`, not `{ isReady, error }`. Belongs on the existing docs issue, not a new one |
| **7 · the canonical starter doesn't build from published packages** | `wdk-starter-react-native` | A 0.0.0 npm placeholder, and two dependencies pinned to personal forks |

## Finding 16, in detail

Filed 2026-08-21 as [gasless#32](https://github.com/tetherto/wdk-wallet-evm-7702-gasless/issues/32).
It blocked Moor's first spend, so it is worth stating precisely.

In token-paymaster mode every method that prices an operation does so before the EIP-7702
authorization is signed. `_buildSponsoredUserOperation` already accepts a pre-signed
authorization and applies it, but the estimator never passes one:

```js
// wallet-account-evm-7702-gasless.js — transfer(), line 339
const result = await this._getUserOperationGasCost([tx], mergedConfig, { nonce })
//                                                                    ^ no eip7702Auth

// …only later, inside _sendUserOperation → _buildSignedUserOperation, line 411
const eip7702Auth = await this._getAuthorization(config)
```

**The cause is structural rather than a missing argument.** `_getUserOperationGasCost` is
defined on `WalletAccountReadOnlyEvm7702Gasless`, which has no `_ownerAccount` and no
`_getAuthorization` — a read-only account holds no key and cannot sign an authorization. The
signing class inherits its estimator from a class incapable of producing the input the
estimator needs. `quoteTransfer` shows it clearest: defined *only* on the read-only class and
never overridden, so calling it on a fully-keyed account still runs the keyless version.

The way through is to skip the pricing step entirely:

```js
const signed = await account.signTransaction(tx)   // signs the 7702 authorization
await account.sendTransaction(signed)              // broadcasts, no re-estimation
```

**The repro needs no money.** On a freshly generated key holding nothing, `quoteTransfer()` and
`transfer()` both return `AA20 account not deployed`, while `signTransaction()` on the same
account in the same run reaches `ERC20: transfer amount exceeds balance`. Simulation only gets
as far as the token when the authorization is present, so the authorization is the only
variable — no funding, allowance or paymaster question involved. That control is what makes
this confirmable by a maintainer in under a minute, where the earlier version of the repro
needed a funded account.

## Deliberately not filed

**20 · the address book's type validation is asymmetric.** `_validateAddressRecord` runs only on
the local write path; the autobase apply router does no type checking, and `schema.js` stores
`type` as a plain string. So an unrecognised type replicates in, is stored, and is served back.
This is not a defect — validating inside `apply` would risk breaking replication — and not a
security issue, because no per-type format checking hangs off the type either, so there is
nothing to bypass. What it establishes is that `ADDRESS_TYPES` is advisory rather than an
enforced invariant, which is precisely the argument for finding 2: adding a type is
backward-compatible by construction and adds no exposure replication does not already carry.

Filed nowhere on its own, because on its own it has no action attached and "your validation can
be bypassed" reads as an accusation rather than the supporting point it is. It is deployed
instead inside the [address-book#6 escalation](https://github.com/tetherto/wdk-p2p-address-book/issues/6#issuecomment-5364998758),
and held in reserve as the answer if anyone defends the closed set on the grounds that it keeps
books well-formed.

## Not WDK's

| Finding | Whose | The short version |
|---|---|---|
| **11 · a one-node `hyperdht` network cannot connect anything, and the error blames NAT** | Holepunch | The standard test recipe every integrator copies is a lone bootstrapper, and it cannot work — see [`lab/t8`](../lab/t8-pay-requests.js) |
| **13 · a worklet's `console.log` reaches no log at all** | Holepunch | Not Metro, not Xcode, not `simctl log stream`. Absence of output looks exactly like code that never ran |
| **17 · Candide's public bundler estimates EntryPoint v0.8 operations and then cannot submit them** | Candide | Estimation succeeds, submission returns the EntryPoint's own bytecode as an error string. v0.8 is the version EIP-7702 requires, so Moor submits through Pimlico and keeps Candide as the paymaster |
| **18 · Candide published a USD₮ exchange rate scaled for the wrong decimals** | Candide | **Observed once, and it cleared on its own** — twenty minutes of pricing USD₮ as if it had 18 decimals, demanding 22 billion USD₮ for a 2.2 cent fee. Recorded as something seen rather than something filed |

## Where they stand, 2026-08-23

**One has landed.** [rn-core#89](https://github.com/tetherto/wdk-react-native-core/pull/89) moved
`expo-crypto` to `peerDependencies` and was merged by @jonathunne on 2026-08-21, closing
rn-core#82 — finding 9, and the first of these to change the SDK.

Three others have maintainer replies, all positive:

- **bundler#46** — @claudiovb confirmed it, said it was already on their backlog, **chose the
  option we argued for** (wire modules into JSON-RPC rather than reject the config), and
  opened `pear-wrk-wdk#82` for the worklet half. They also asked to see a `wdk-core-flutter`
  POC if we ever build one.
- **rn-core#81** — @nulllpc: "Agree! We'll add docs for it."
- **rn-core#82** — @nulllpc agreed on the peerDependency fix and offered the PR. Now merged.

**Someone else is fixing these.** A third party, [@localhost41](https://github.com/localhost41),
has opened PRs against most of what we filed:

| Our issue | Their PR | State |
|---|---|---|
| rn-core#82 · `expo-crypto` | [rn-core#89](https://github.com/tetherto/wdk-react-native-core/pull/89) | **merged 2026-08-21** |
| rn-core#83 · lazy `moduleEvent` | [rn-core#85](https://github.com/tetherto/wdk-react-native-core/pull/85) | open, unreviewed |
| bundler#46 · `modules:` on jsonrpc | [bundler#54](https://github.com/tetherto/wdk-worklet-bundler/pull/54) + [pear-wrk-wdk#83](https://github.com/tetherto/pear-wrk-wdk/pull/83) | open, unreviewed |
| bundler#47 · `--install` | bundler#50 closed unmerged; @claudiovb's own [bundler#52](https://github.com/tetherto/wdk-worklet-bundler/pull/52) | open, unreviewed |
| address-book#5 · read-only `fromSeed()` | [address-book#9](https://github.com/tetherto/wdk-p2p-address-book/pull/9) | open, unreviewed |

**And one is ours.** [address-book#10](https://github.com/tetherto/wdk-p2p-address-book/pull/10)
adds `hyperdht` to `ADDRESS_TYPES` — four lines of source plus a test — against finding 2. Filed
alongside a direct escalation to @jonathunne on the issue, because that repo has answered nothing
put into it.

**The bottleneck has moved from writing to review.** Everything above except the merged one is
sitting on nobody's queue. `pear-wrk-wdk#83` and `bundler#54` matter most: together they are what
reopens Flutter as a platform, they have been open since 2026-08-19 and 2026-08-21, and
@localhost41's request for a joint review has had no reply.

**Why some threads get read and others don't.** Measured 2026-08-22 across the 50 `wdk-*` repos:
the three that answer external threads have one watcher each; the two that have never answered
anything, `wdk-p2p-address-book` and `pear-wrk-wdk`, have zero. GitHub routes issue notifications
by watch state and none of these repos carries a `CODEOWNERS` file, so an issue filed into a
zero-watcher repo reaches nobody. In `pear-wrk-wdk` even a maintainer's own issue (#76, open since
2026-08-03) has no reply. This is not about report quality, and it is the one upstream problem
that is not about the code.

So the work is claimed and we should not duplicate it. What that leaves us is getting it reviewed,
and verifying the fixes against Moor once they land, since this repo is the only public thing that
exercises `modules:` end to end.

## Watch for

- **address-book#6** changes Moor's design if accepted — we'd drop the `Contact.username`
  workaround for the mooring key and store it properly. This is the highest-value ask in the
  set: a small change, an obvious use case, and this repo is the use case. Our PR is
  [address-book#10](https://github.com/tetherto/wdk-p2p-address-book/pull/10); finding 20 is
  the argument for why it costs nothing to take.
- **bundler#46** is the one that would reopen Flutter as a platform option.
- **address-book#7** offers to publish our blind-peer setup as a reference. If they take us
  up on it, that's a deliverable we've committed to in public.
