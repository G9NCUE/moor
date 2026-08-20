# Upstream reports

Nineteen findings from building [Moor](../README.md) against WDK. Nine were filed — seven on
2026-08-10 from `lab/`, two on 2026-08-11 while building the app — and one of those we have
since closed ourselves. Each is reproducible from [`lab/`](../lab/) and cites the source line
it came from.

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
| 9 · `expo-crypto@^56` breaks Expo SDK 55 | [rn-core#82](https://github.com/tetherto/wdk-react-native-core/issues/82) | bug |
| 14 · `modules:` dropped on jsonrpc | [bundler#46](https://github.com/tetherto/wdk-worklet-bundler/issues/46) | bug |
| 15 · lazy `moduleEvent` handler crashes on any bundled module | [rn-core#83](https://github.com/tetherto/wdk-react-native-core/issues/83) | bug |

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

Ranked by what we'd send first. **16** is new and would go first: it is a defect with a
one-line fix that every new user of the gasless wallet hits on their first spend.

| Finding | Where it belongs | The short version |
|---|---|---|
| **16 · the gasless wallet cannot make an account's first transaction** | `wdk-wallet-evm-7702-gasless` | Pricing runs before signing and omits the EIP-7702 authorization, so a new account's first spend returns `AA20`. Detail below |
| **19 · the balance never loads on a fresh install** | `wdk-react-native-core` | `useBalance` seeds `{ success: true, balance: null }` and TanStack treats it as fresh, so the first fetch never fires. "You have nothing" is the worst wrong answer a wallet can give |
| **10 · `delegationAddress` ships with no value and no registry** | `wdk-wallet-evm-7702-gasless` | The docs say verify it independently and give nothing to verify against, for the one constant that can drain an account. [`lab/t5`](../lab/t5-delegation.js) is the receipt |
| **12 · a `modules:` entry cannot be a path in your own repo** | `wdk-worklet-bundler` | Validated against the project root, `require()`d one directory deeper. No relative path satisfies both, and `modules:` is the only extension point WDK offers |
| **8 · the rn-core README's examples don't compile** | comment on [rn-core#81](https://github.com/tetherto/wdk-react-native-core/issues/81) | `useWdkApp()` returns `{ state }`, not `{ isReady, error }`. Belongs on the existing docs issue, not a new one |
| **7 · the canonical starter doesn't build from published packages** | `wdk-starter-react-native` | A 0.0.0 npm placeholder, and two dependencies pinned to personal forks |

### Finding 16, in detail

This one blocked the first spend, so it is worth stating precisely.

```js
// wallet-account-evm-7702-gasless.js — transfer(), line 338
const result = await this._getUserOperationGasCost([tx], mergedConfig, { nonce })
//                                                                    ^ no eip7702Auth

// …only later, inside _sendUserOperation → _buildSignedUserOperation, line 411
const eip7702Auth = await this._getAuthorization(config)
```

The code that signs the authorization is downstream of the code that needs it. The way
through is to skip the pricing step entirely:

```js
const signed = await account.signTransaction(tx)   // signs the 7702 authorization
await account.sendTransaction(signed)              // broadcasts, no re-estimation
```

Confirmed by the account's own behaviour afterwards: once that first send delegates the
EOA, `quoteTransfer()` starts working and returns `0.017266 USD₮`. The AA20 was the missing
authorization and nothing else.

A fix upstream is small — pass `await this._getAuthorization(config)` into the estimation
call the same way `_buildSignedUserOperation` does.

## Not WDK's

| Finding | Whose | The short version |
|---|---|---|
| **11 · a one-node `hyperdht` network cannot connect anything, and the error blames NAT** | Holepunch | The standard test recipe every integrator copies is a lone bootstrapper, and it cannot work — see [`lab/t8`](../lab/t8-pay-requests.js) |
| **13 · a worklet's `console.log` reaches no log at all** | Holepunch | Not Metro, not Xcode, not `simctl log stream`. Absence of output looks exactly like code that never ran |
| **17 · Candide's public bundler estimates EntryPoint v0.8 operations and then cannot submit them** | Candide | Estimation succeeds, submission returns the EntryPoint's own bytecode as an error string. v0.8 is the version EIP-7702 requires, so Moor submits through Pimlico and keeps Candide as the paymaster |
| **18 · Candide published a USD₮ exchange rate scaled for the wrong decimals** | Candide | **Observed once, and it cleared on its own** — twenty minutes of pricing USD₮ as if it had 18 decimals, demanding 22 billion USD₮ for a 2.2 cent fee. Recorded as something seen rather than something filed |

## Where they stand, 2026-08-20

Three have maintainer replies, all positive:

- **bundler#46** — @claudiovb confirmed it, said it was already on their backlog, **chose the
  option we argued for** (wire modules into JSON-RPC rather than reject the config), and
  opened `pear-wrk-wdk#82` for the worklet half. They also asked to see a `wdk-core-flutter`
  POC if we ever build one.
- **rn-core#81** — @nulllpc: "Agree! We'll add docs for it."
- **rn-core#82** — @nulllpc agreed on the peerDependency fix and offered us the PR.

**Someone else is fixing these.** A third party, [@localhost41](https://github.com/localhost41),
has opened PRs against most of what we filed:

| Our issue | Their PR |
|---|---|
| rn-core#83 · lazy `moduleEvent` | [rn-core#85](https://github.com/tetherto/wdk-react-native-core/pull/85) *attach module event dispatcher during startup* |
| rn-core#82 · `expo-crypto` | [rn-core#89](https://github.com/tetherto/wdk-react-native-core/pull/89) |
| bundler#46 · `modules:` on jsonrpc | [bundler#54](https://github.com/tetherto/wdk-worklet-bundler/pull/54) + [pear-wrk-wdk#83](https://github.com/tetherto/pear-wrk-wdk/pull/83) |
| bundler#47 · `--install` | bundler#50 — closed unmerged |
| address-book#5 · read-only `fromSeed()` | [address-book#9](https://github.com/tetherto/wdk-p2p-address-book/pull/9) *docs: explain explicit enrollment* |

None merged; all four open ones are awaiting review. Two earlier attempts (bundler#50, #51)
were closed unmerged — #51 was the "hard rejection" approach @claudiovb declined in the #46
thread.

So the work is claimed and we should not duplicate it. What that leaves us is verifying the
fixes against Moor once they land, since this repo is the only public thing that exercises
`modules:` end to end.

## Watch for

- **address-book#6** changes Moor's design if accepted — we'd drop the `Contact.username`
  workaround for the mooring key and store it properly. This is the highest-value ask in the
  set: a small change, an obvious use case, and this repo is the use case.
- **bundler#46** is the one that would reopen Flutter as a platform option.
- **address-book#7** offers to publish our blind-peer setup as a reference. If they take us
  up on it, that's a deliverable we've committed to in public.
