# Flutter POC

*2026-08-23. Three phases planned, run and passed the same day. Code and reproduction steps in
[`flutter/`](../flutter/). One run still owed: a physical Android device on the public DHT.*

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

Over a local DHT. On the public one a stranger is still refused (that travels by DHT
signalling) but an accepted dial dies in `HOLEPUNCH_ABORTED`, because QEMU's NAT cannot be
punched. `lab/t9` passes from the same laptop at the same moment. `phase0/dht-rig.mjs` is the
stand-in; a physical device is the remaining run.

## What it surfaced

| Finding | |
|---|---|
| **21** | Parity is three-sided. The host cores' read loop is keyed on `id`; `moduleEvent` has none and is dropped. One branch fixes it; the Flutter port has it |
| **22** | `linkAddons` iterates a fixed list without `udx-native`, so a Holepunch module boots without its network. RN never sees it (`react-native-bare-kit` ships the `.so`); Kotlin never saw it (14 kept modules out). Worked around with `bare-link` |
| **13**, scoped | The worklet's errors reach logcat on Android. The blindness is iOS-only |

## Scope

In: Android, JSON-RPC, one module, one call, one event, a throwaway seed.
Out: iOS, any wallet UI, the address book, porting Moor. Moor stays React Native.

Built in `flutter/` rather than a `wdk-core-flutter` repo because the harness lives here.
Extracting it is the obvious next step if Tether wants it.
