# Flutter POC — plan

*Drafted 2026-08-23. **Phases 0 and 1 ran the same day and passed; results in §6,
[`flutter/phase0/`](../flutter/phase0/) and [`flutter/wdk_core_flutter/`](../flutter/wdk_core_flutter/).** Every claim about upstream code was checked against the
named source on that date; the PR branches can move, so re-check before building.*

## 1. The one sentence

**A Flutter app loads a custom module through WDK's JSON-RPC transport, calls into it, and
receives an unsolicited event back from it.**

That is the exact contract two open PRs claim and nothing in existence exercises. The POC is the
evidence those PRs need; it is not a port of Moor.

## 2. Why this, and why now

Moor is React Native because of finding 14: `modules:` is silently dropped on the `jsonrpc`
transport, which is the transport every native host (Swift, Kotlin, and therefore Flutter) uses.
That wall is now being dismantled in two PRs by an independent contributor:

| PR | Half | Open since | Reviews |
|---|---|---|---|
| [pear-wrk-wdk#83](https://github.com/tetherto/pear-wrk-wdk/pull/83) | the worklet: `callModule` dispatch and `moduleEvent` notifications over JSON-RPC | 2026-08-19 | 0 |
| [wdk-worklet-bundler#54](https://github.com/tetherto/wdk-worklet-bundler/pull/54) | the generator: emits `moduleManagers` and `allowedModuleMethods` into the JSON-RPC entry | 2026-08-21 | 0 |

Both repos have zero watchers, so the PRs reach nobody's queue by default (see `SPEC.md §8`).
The maintainer who triaged finding 14 asked for exactly this:

> *if you do end up wiring the bundler into a `wdk-core-flutter` POC, let us know, we'd be
> really interested in seeing that.* — @claudiovb, [bundler#46](https://github.com/tetherto/wdk-worklet-bundler/issues/46)

A working POC converts two unreviewed PRs into demonstrated platform parity. That is the
highest-leverage thing this project can do for WDK right now, and the one thing nobody else
is positioned to do: Moor is the only public code that exercises `modules:` end to end.

## 3. What already exists, and what doesn't

### The reference architecture: `wdk-core-kotlin`

[`tetherto/wdk-core-kotlin`](https://github.com/tetherto/wdk-core-kotlin) (Apache-2.0) is the
template. One file, `WdkCore.kt`, 433 lines:

```
Kotlin app  ──BareKit IPC──►  Bare worklet
                │
                JSON-RPC 2.0 over a byte stream
                frame = 4-byte big-endian length + UTF-8 JSON
                requests multiplexed by integer id
```

BareKit ([`holepunchto/bare-kit`](https://github.com/holepunchto/bare-kit), v2.4.3) supplies the
runtime: a `Worklet` to start from a bundle, an `IPC` to talk to it. The Kotlin core's Gradle
task fetches the Android `classes.jar` and per-ABI `.so` files from the BareKit release.

A Flutter plugin is that same Kotlin, behind a platform channel:

```
Dart  ──MethodChannel / EventChannel──►  Kotlin shim  ──BareKit IPC──►  worklet
```

### Two things the reference does not have

**No JSON-RPC consumer has ever loaded a module.** `wdk-core-kotlin/js/wdk.config.js` declares
`transport: 'jsonrpc'` with `networks`, `protocols: {}`, and no `modules:` key at all. Finding 14
seen from the consumer side. The POC would be the first, not a port of something existing.

**The Kotlin core cannot receive an event, and will not be able to after pear#83 merges.** Its
entire read side is:

```kotlin
val id = response.optInt("id", -1)
if (id > 0) pendingRequests.remove(id)?.complete(response)
```

One branch. A frame without an `id` is parsed and discarded. There is no listener, callback,
or stream anywhere in the file. And pear#83 defines `moduleEvent` as a notification that
*deliberately* carries no `id`.

So JSON-RPC module parity is **three-sided**, not the two sides scoped in bundler#46: the worklet
(pear#83), the generator (bundler#54), and **the native host cores, which have no path for
worklet → host traffic at all**. Not a defect today, since nothing emits yet; a scope gap that
becomes a defect the day #83 merges. Same shape as finding 15, where rn-core registers its
`moduleEvent` handler lazily and dies on the first event: the host side of worklet → host
events is the weak point in both stacks. **Recorded as finding 21** and worth raising on pear#83
before any code is written, because it changes the definition of done on work already in flight.

### Nothing Dart-side exists

No Dart binding to BareKit anywhere: not under `holepunchto`, not on GitHub broadly. We write it.

## 4. The wire, exactly

From the pear#83 diff, `src/jsonrpc-handlers.js`.

**Host → worklet.** Standard request, id-multiplexed:

```json
{ "jsonrpc": "2.0", "id": 7, "method": "callModule",
  "params": { "module": "payRequests", "method": "getIdentity", "args": "[]" } }
```

`args` is a **JSON string of an array**, not an array. The response unwraps the module runtime's
string result back into a value: `{ "jsonrpc": "2.0", "id": 7, "result": { "result": <value> } }`.
Calling a method not listed in `allowedModuleMethods` returns an error; calling when no modules
are bundled returns `BAD_REQUEST`.

**Worklet → host.** A notification, no `id`:

```json
{ "jsonrpc": "2.0", "method": "moduleEvent",
  "params": { "module": "payRequests", "event": "request",
              "payload": { "from": "…", "amount": "25", "note": "", "at": 1755… } } }
```

`payload` is parsed JSON, not a double-encoded string. This is the frame the Kotlin core drops.

**The sequence that brings a module alive** (shared `initializeWdkHandler`, reached from the
JSON-RPC switch; modules are constructed in `lifecycle.js:101` from `workletConfig.modules` with
the decrypted seed, *before* WDK takes the buffer):

```
workletStart
generateEntropyAndEncrypt { wordCount }          → { encryptedEntropy, encryptionKey, … }
   — or —  getSeedAndEntropyFromMnemonic { mnemonic }
initializeWDK { encryptionKey, encryptedSeed, config }   ← modules constructed here
callModule …
```

`initializeWDK` throws `At least one network configuration must be provided`, so the bundle
must carry a wallet package even though the POC never calls it. `@tetherto/wdk-wallet-evm` for
`arbitrum`, as the Kotlin template does.

## 5. The module under test

[`app/modules/pay-requests`](../app/modules/pay-requests) (`@moor/pay-requests`), already proven
inside the hrpc worklet on iOS. It is the right subject because it has both halves of the
contract:

- **A callable surface.** `getIdentity`, `setPeers`, `request`, allow-listed in the existing
  `app/wdk.config.js`.
- **An unsolicited event.** On an inbound HyperDHT connection it calls the `emit` it was handed
  at construction with `('request', { from, amount, note, at })`. That is the one `moduleEvent`
  the POC has to catch.

And the trigger already exists: [`lab/ask-phone.js`](../lab/ask-phone.js) derives a phone's peer
key from its mnemonic, confirms it is announced on the public DHT and refusing strangers, writes
a contact into the shared address book to introduce itself, and asks for 25 USD₮. It drove the
iPhone; it can drive an emulator. **No module changes are needed.**

## 6. Phases

Each phase has one exit criterion and a result worth reporting on its own, including a failure.

### Phase 0 — Bundle ✅ done 2026-08-23

*Does bundler#54 do what it says?* **Yes**, and pear#83 does too. Full write-up and the
re-runnable harness in [`flutter/phase0/`](../flutter/phase0/README.md). The short version:

- Both branches are exactly one commit ahead of `tetherto/main`; both suites pass here (128, 85).
- The JSON-RPC entry contains `moduleManagers['payRequests']` and `allowedModuleMethods`; the
  packed bundle (3.2 MB, Android, 2s) contains the module and pear#83's `callModule` switch case
  and `moduleEvent` emitter. The **control** on published `beta.10` contains none of it and
  prints no warning.
- **Extended beyond the plan:** a Node harness drives pear#83's handler over a fake IPC with the
  *real* module and a local DHT. `initializeWDK` constructs the module; `getIdentity` returns the
  same key `lab/ask-phone.js` derives; the allow-list refuses `close`; a stranger is refused; a
  contact's request arrives as an **id-less JSON-RPC notification in ~18ms** with `payload.from`
  set from the Noise session. Fifteen assertions, four runs, all pass.
- Findings 6 and 12 reproduced on the way (`pear-wrk-wdk` not auto-installed; the module needs
  its own `npm install`). Also: the bundler deletes the generated entry after a successful
  pack; `--source-only` keeps it.

Consequence for what follows: everything between host and module is known to work. Phase 1 and
2 are now **only** about BareKit on Android and the Dart host's notification branch.

The original plan for this phase, kept for the record:

1. Install the bundler from `localhost41/wdk-worklet-bundler#feat/jsonrpc-modules`. **It ships
   no `dist/`**, so clone and `npm run build` (tsdown), then `npm link` or `file:` it.
2. Install pear#83 via an npm `overrides` entry pointing
   `@tetherto/pear-wrk-wdk` at `localhost41/pear-wrk-wdk#feat/jsonrpc-modules`, so the bundler
   picks up the patched worklet.
3. `wdk.config.js`: `transport: 'jsonrpc'`, `networks: { arbitrum: '@tetherto/wdk-wallet-evm' }`,
   `modules: { payRequests: { package: '@moor/pay-requests', factory: 'createModule' } }`,
   `allowedModuleMethods` as in the app, `platforms: ['android']`.
4. `wdk-worklet-bundler generate`.

**Exit:** `.wdk/wdk-worklet.generated.js` contains `moduleManagers['payRequests'] = {` and
`allowedModuleMethods: {"payRequests":…}`, and the bundle builds. On beta.9 today, the same
config produces neither. Expect finding 12 (a `modules:` path must be a package name, which
`@moor/pay-requests` already is) and finding 6 (`--install` misdirects; install
`@tetherto/pear-wrk-wdk` by hand).

**Report** the outcome on bundler#54 either way. This is the cheapest validation that PR can get
and it has had none.

### Phase 1 — Android host ✅ done 2026-08-23

*Can Dart call into the worklet?* **Yes.** Plugin and results in
[`flutter/wdk_core_flutter/`](../flutter/wdk_core_flutter/README.md). On a Pixel 9 Pro emulator
(API 35, arm64): IPC open at 594ms, `workletStart` 742ms, module constructed at 826ms,
`getIdentity` back in Dart at 8.2s (it awaits the public-DHT announce) returning the same key
`phase0/p0-wire.mjs` and `lab/ask-phone.js` derive; `close()` refused by the allow-list.

Two things found on the device, neither visible from Node:

- **The bundler does not link `udx-native`** (finding 22). `BARE_LINK_MODULES` is a hardcoded
  list with `sodium-native` and without the UDP transport under `hyperdht`, so any JSON-RPC
  bundle carrying a Holepunch module boots without its network and dies on first use with
  `ADDON_NOT_FOUND`. React Native never sees it because `react-native-bare-kit` ships the
  library itself; the Kotlin core never saw it because finding 14 kept modules out of JSON-RPC
  bundles entirely. Worked around with `phase0/link-udx.mjs`.
- **Finding 13 is iOS-only.** On Android the worklet's unhandled rejections and `logger.error`
  output reach logcat under the app's process tag, which is how finding 22 was diagnosed in one
  read.

The original plan for this phase, kept for the record:

*Can Dart call into the worklet?*

1. `flutter create --template=plugin --platforms=android -a kotlin wdk_core_flutter`.
2. Port `WdkCore.kt`: BareKit `Worklet` + `IPC`, the handler thread, the framing, the id
   multiplexing. Bundle shipped as an Android asset, started as `/wdk.bundle`.
3. BareKit Android artefacts: the Kotlin core's `fetchBareKit` Gradle task, adapted into the
   plugin's `build.gradle`.
4. **Add the branch the Kotlin core lacks:** a frame with no `id` and a `method` is a
   notification. Route it to an `EventChannel` sink instead of dropping it.
5. Dart API: `Future<dynamic> callModule(module, method, List args)` and
   `Stream<ModuleEvent> get events`.
6. A one-screen Flutter app: start, restore the throwaway mnemonic, `initializeWDK`, then
   `callModule('payRequests', 'getIdentity', [])`.

**Exit:** `getIdentity` returns the phone's peer key to Dart, and it equals the key
`ask-phone.js` derives from the same mnemonic. Allow-list denial and the
no-modules `BAD_REQUEST` both surface as Dart exceptions rather than hangs.

### Phase 2 — The event

*Does an unsolicited event cross three boundaries?*

1. Emulator on the public DHT; `ask-phone.js --probe` confirms it is announced and refusing
   strangers.
2. `ask-phone.js` introduces itself and sends the request.
3. Dart's `events` stream yields
   `ModuleEvent(module: 'payRequests', event: 'request', payload: {from, amount: '25', …})`.

**Exit:** the event arrives in Dart with `from` equal to the laptop's key. Measure the latency
as `ask-phone.js` already does (~1.5s on the iPhone).

**This is the phase that matters.** Everything before it is plumbing. It is also the phase
most likely to fail for reasons outside the POC: the emulator's NAT is not a phone's, and `t8`
taught us that a topology which isolates everything measures nothing. If it fails, the first
question is whether `t9` passes from the same machine, not whether the plugin is wrong.

### Phase 3 — Report

1. Results on pear#83 and bundler#54: the config, the generated entry, the wire captures, the
   latency, and whatever broke.
2. Finding 21 on pear#83 if not already raised: the host cores need an event path, and here is
   the Dart/Kotlin one that works.
3. Reply to @claudiovb on bundler#46 with the link.
4. Update `SPEC.md §3` (platform choice): Flutter was ruled out by finding 14; record what it
   would take to rule it back in.

## 7. Scope fence

In: Android, JSON-RPC, one module, one call, one event, a throwaway seed.

Out, deliberately: iOS (doubles the native work, proves nothing extra, and @claudiovb's own
framing was "Kotlin and potentially Flutter aren't there yet"); any wallet UI; the address book
module; key management beyond restoring a known test phrase; porting Moor. Each of these is a
reason to drift, and drifting is how a half-day proof becomes a month.

## 8. Risks, honestly

| Risk | Why it is real | What we do about it |
|---|---|---|
| **Building on two unreviewed PRs.** If review changes the wire shape, Phase 1 needs rework | nobody has reviewed them | this is also the argument *for* doing it: nothing else has made them move. Pin both branch SHAs in the POC and say so |
| **BareKit packaging is where the time goes**, not the JSON-RPC | C runtime, per-ABI `.so`, Gradle fetch, Flutter plugin packaging on top | copy the Kotlin core's Gradle task wholesale before improving anything |
| **Emulator networking** breaks Phase 2 for reasons unrelated to the plugin | NAT, hole-punching, no real-device radio | `t9` as the control; a physical Android device as the fallback |
| **The bundler branch does not build** or drifts from `main` | no `dist/` committed; 13 commits behind possible | Phase 0 is half a day precisely so this is found first |
| **Estimates below are guesses** | no Dart BareKit binding exists to calibrate against | phase exits are binary, so slippage is visible immediately |

## 9. Effort

| Phase | Estimate |
|---|---|
| 0 — Bundle | half a day |
| 1 — Android host | 2 to 3 days |
| 2 — The event | 1 day |
| 3 — Report | half a day |

Run Phase 0 alone and report before starting Phase 1. It independently validates bundler#54,
costs almost nothing, and its result is useful whether or not the rest ever happens.

## 10. Open decision: where it lives

Two options, and the second is the one the maintainer named.

- **`moor/flutter/`** in this repo. Fastest: `lab/ask-phone.js` and `app/modules/pay-requests`
  are right there, one CI, one README.
- **A separate `wdk-core-flutter` repo**, mirroring `wdk-core-kotlin`. What @claudiovb asked to
  see by name, what Tether could adopt, and what a Flutter developer would search for.

Recommendation: build in `moor/flutter/` through Phase 2, because speed to the first event is
what matters and the test harness is here. Extract to `wdk-core-flutter` in Phase 3 once there
is something worth a repo of its own. An empty repo with the right name helps nobody.

## 11. What success buys

For WDK: two PRs reviewed and merged with evidence attached, a third platform demonstrated on
the transport Tether said it would keep at parity, and finding 21 fixed before it ships as a
bug.

For Moor: §3 of the spec gets to stop saying "this is what rules out Flutter."

For the person filing all this: the one deliverable on the board that no one else can
produce, delivered to the maintainer who asked for it.
