# Flutter POC

*2026-08-23: three phases planned, run and passed the same day, then confirmed on a phone over
the public internet. 2026-08-24: extended toward a usable `wdk-core-flutter`, phases A to D
below. Code and reproduction steps in [`flutter/`](../flutter/).*

## The claim

**A Flutter app loads a custom module through WDK's JSON-RPC transport, calls into it, and
receives an unsolicited event back from it.**

That is the contract two open PRs make, and nothing else exercised it:

| PR | Half | Branch tested |
|---|---|---|
| [pear-wrk-wdk#83](https://github.com/tetherto/pear-wrk-wdk/pull/83) | worklet: `callModule` and `moduleEvent` over JSON-RPC | `1e63c66` |
| [wdk-worklet-bundler#54](https://github.com/tetherto/wdk-worklet-bundler/pull/54) | generator: `moduleManagers` and `allowedModuleMethods` in the JSON-RPC entry | `0843bca` |

Both one commit ahead of `main`, both suites passing locally. @claudiovb asked for exactly this on
[bundler#46](https://github.com/tetherto/wdk-worklet-bundler/issues/46). Moor is React Native
because of finding 14; this is what would let Flutter back in.

## Architecture

```
Dart  ──MethodChannel / EventChannel──►  Kotlin  ──BareKit IPC──►  Bare worklet  ──►  module
```

The Kotlin is a port of [`wdk-core-kotlin`](https://github.com/tetherto/wdk-core-kotlin)'s
`WdkCore.kt` with one branch it lacks: a frame with no `id` is a notification, not garbage.
BareKit ([`holepunchto/bare-kit`](https://github.com/holepunchto/bare-kit) 2.4.3) is the
runtime. No Dart binding to it existed.

Wire: 4-byte big-endian length, then UTF-8 JSON-RPC 2.0. Requests carry an integer `id`;
`moduleEvent` is a notification without one. `callModule` takes `args` as a JSON string of an
array and unwraps the result. Modules are constructed inside `initializeWDK`, with the seed,
before WDK takes the buffer; the call needs at least one network even if no wallet is used.

The module under test is [`app/modules/pay-requests`](../app/modules/pay-requests): a callable
surface plus an unsolicited `request` event on an inbound HyperDHT connection.

## Results

### Phase 0 — bundle and wire, in Node

[`flutter/phase0/`](../flutter/phase0/README.md). The generated JSON-RPC entry contains
`moduleManagers['payRequests']` and `allowedModuleMethods`; the bundle contains the module and
pear#83's handler. The control on published `beta.10` contains neither, silently.

A harness drives pear#83's handler over a fake IPC with the real module on a local DHT:
`initializeWDK` constructs it, `getIdentity` returns the same key `lab/ask-phone.js` derives,
the allow-list refuses `close()`, a stranger is refused, and a contact's request arrives as an
id-less notification in ~18ms. Fifteen assertions, four runs.

### Phase 1 — Android host

[`flutter/wdk_core_flutter/`](../flutter/wdk_core_flutter/README.md). Pixel 9 Pro emulator, arm64:
IPC open 594ms, module constructed at 826ms, `getIdentity` back in Dart with the same key,
`close()` refused.

### Phase 2 — the event

A laptop asks the emulator for 25 USD₮. Dart renders
`ModuleEvent(payRequests.request {"from":"24408ecc…","amount":"25"…})`, `from` being the sender's
key from the Noise session. A stranger is refused first and nothing reaches Dart. Three in a
row: 3.2s cold, 91ms and 269ms warm.

On the emulator, over a local DHT: QEMU's NAT cannot be hole-punched, so `phase0/dht-rig.mjs`
stands in. Then on a **Galaxy S23 on 5G** (IPv6-only, carrier NAT64), laptop behind a home
router, public DHT: **5 of 10 requests arrived in Dart**, 10–14s each, `moduleEvents` on the
phone equal to the acks on the laptop. Every failure was hyperdht's hole-punch giving up on the
laptop side, before any byte reached the plugin. That is CGNAT, not Flutter, and it is the
first time `pay-requests` has been measured off Wi-Fi.

## Toward `wdk-core-flutter`

After the claim held, the plugin was grown into what Tether could adopt, one unknown at a time.
Emulator unless stated; a pass on the S23 is owed before any of this is claimed upstream.

| | Result |
|---|---|
| **A · the address book over JSON-RPC** | Never loaded on this transport by anyone. Enrolled in the existing Moor book through the blind peer, five contacts restored in 4.4s; three written from the laptop arrived on the open app as `update` notifications. `t6` and `t7` on Flutter. |
| **B · wallet calls** | `callMethod` as `wdk-core-kotlin` does. Address `0x9858EfFD…`, the canonical account 0 for the test vector, and the USD₮0 balance from chain in 1.6s, through the gasless wallet package. |
| **C · seed and onboarding** | The phrase generated inside the worklet and shown once, or imported. Only the encrypted seed and its key are stored, in the Keystore. Same wallet after a force-stop. |
| **D · send** | Quote and transfer over `callMethod`, a send screen that picks a contact's address. With the lab throwaway the quote reaches the paymaster and is refused for cover: the account holds 0.0246 USD₮ and Candide wants 0.031. **The send itself waits on funds.** |

Three more findings on the way, all upstream: 22 is four addons bigger and has a third shape
(nested versions), 23 (a void module method fails over JSON-RPC), 24 (`error.cause` is dropped
on both transports).

## What it surfaced

| Finding | |
|---|---|
| **21** | Parity is three-sided. The host cores' read loop is keyed on `id`; `moduleEvent` has none and is dropped. One branch fixes it; the Flutter port has it |
| **22** | `linkAddons` iterates a fixed list. Missing for Holepunch modules: `udx-native`, `rocksdb-native`, `quickbit-native`, `simdle-native`, `fs-native-extensions`; and a nested dependency at another version is unreachable by name. RN never sees it (`react-native-bare-kit` ships the `.so`); Kotlin never saw it (14 kept modules out). `phase0/link-missing.mjs` reads the bundle's own `linked:` references instead |
| **23** | pear#83 calls `JSON.parse(undefined)` on a void module method, so the address book cannot be enrolled over JSON-RPC. One line, `flutter/pear@cd166b1` |
| **24** | The worklet serialises `error.message`, never `error.cause`, so the wallet's real reason (`token balance lower than the required allowance`) never reaches a host. Both transports |
| **13**, scoped | The worklet's errors reach logcat on Android. The blindness is iOS-only |

## Scope

In: Android, JSON-RPC, one module, one call, one event, a throwaway seed.
Out: iOS, any wallet UI, the address book, porting Moor. Moor stays React Native.

Built in `flutter/` rather than a `wdk-core-flutter` repo because the harness lives here.
Extracting it is the obvious next step if Tether wants it.
