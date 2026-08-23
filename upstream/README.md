# Upstream reports

Twenty-two findings from building Moor against WDK. Ten filed, one fixed upstream, one with
our PR open. [`SPEC.md §2`](../SPEC.md) is the canonical list and carries the detail; numbers
here are its numbers. Every one is reproducible from [`lab/`](../lab/).

## Filed

| Finding | Issue | State |
|---|---|---|
| 1 · read-only `fromSeed()` | [address-book#5](https://github.com/tetherto/wdk-p2p-address-book/issues/5) | open; fix PR [#9](https://github.com/tetherto/wdk-p2p-address-book/pull/9) unreviewed |
| 2 · closed address-type enum | [address-book#6](https://github.com/tetherto/wdk-p2p-address-book/issues/6) | open; **our PR [#10](https://github.com/tetherto/wdk-p2p-address-book/pull/10)**, escalated to @jonathunne |
| 3 · 14–17s restore vs 20s timeout | [address-book#8](https://github.com/tetherto/wdk-p2p-address-book/issues/8) | **retracted by us**: our rig, not the library |
| 4 · no published blind-peer keys | [address-book#7](https://github.com/tetherto/wdk-p2p-address-book/issues/7) | open, no reply |
| 5 · `useModule` undocumented | [rn-core#81](https://github.com/tetherto/wdk-react-native-core/issues/81) | acknowledged |
| 6 · `--install` misdirects | [bundler#47](https://github.com/tetherto/wdk-worklet-bundler/issues/47) | maintainer's fix [#52](https://github.com/tetherto/wdk-worklet-bundler/pull/52) open |
| 9 · `expo-crypto@^56` breaks Expo SDK 55 | [rn-core#82](https://github.com/tetherto/wdk-react-native-core/issues/82) | **fixed, merged 2026-08-21** |
| 14 · `modules:` dropped on jsonrpc | [bundler#46](https://github.com/tetherto/wdk-worklet-bundler/issues/46) | roadmapped; PRs [bundler#54](https://github.com/tetherto/wdk-worklet-bundler/pull/54) + [pear-wrk-wdk#83](https://github.com/tetherto/pear-wrk-wdk/pull/83) unreviewed, verified by [our Flutter POC](../docs/flutter-poc.md) |
| 15 · lazy `moduleEvent` handler crashes any bundled module | [rn-core#83](https://github.com/tetherto/wdk-react-native-core/issues/83) | fix PR [#85](https://github.com/tetherto/wdk-react-native-core/pull/85) unreviewed |
| 16 · gasless wallet cannot make a first transaction | [gasless#32](https://github.com/tetherto/wdk-wallet-evm-7702-gasless/issues/32) | filed 2026-08-21 |

Most of the fix PRs are by an independent contributor, [@localhost41](https://github.com/localhost41).

## Not filed yet

| Finding | Where | Short version |
|---|---|---|
| **19** · the balance never loads on a fresh install | `wdk-react-native-core` | `useBalance` seeds `{ success: true, balance: null }` and TanStack treats it as fresh |
| **10** · `delegationAddress` ships with no value and no registry | `wdk-wallet-evm-7702-gasless` | the one constant that can drain an account; [`lab/t5`](../lab/t5-delegation.js) is the receipt |
| **12** · a `modules:` entry cannot be a path in your own repo | `wdk-worklet-bundler` | validated against the project root, required one directory deeper |
| **21** · host cores drop id-less frames, so cannot receive `moduleEvent` | `wdk-core-kotlin` | parity is three-sided; drafted, see `docs/flutter-poc.md` |
| **22** · `linkAddons` links a fixed list without `udx-native` | `wdk-worklet-bundler` | Holepunch modules boot without their network; drafted |
| **8** · rn-core README examples don't compile | comment on rn-core#81 | |
| **7** · the starter doesn't build from published packages | `wdk-starter-react-native` | |

**20**, the address book's advisory type validation, is deliberately not filed: it has no
action on its own and is the argument inside the #6 escalation.

**Not WDK's:** 11 (a one-node `hyperdht` network cannot connect anything) and 13 (a worklet's
output reaches no log, iOS only) are Holepunch's; 17 and 18 are Candide's.

## Why some threads get read

Measured 2026-08-22 across the 50 `wdk-*` repos: the three that answer external threads have
one watcher each; `wdk-p2p-address-book` and `pear-wrk-wdk`, which have never answered
anything, have none. No repo carries `CODEOWNERS`. An issue filed into a zero-watcher repo
reaches nobody; reaching a named person does.
