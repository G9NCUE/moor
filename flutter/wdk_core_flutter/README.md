# wdk_core_flutter

WDK from Flutter over the JSON-RPC transport. Phase 1 of [`docs/flutter-poc.md`](../../docs/flutter-poc.md).
Android only, on purpose.

```
Dart  ──MethodChannel / EventChannel──►  Kotlin  ──BareKit IPC──►  Bare worklet  ──►  module
```

`WdkCore.kt` is a port of `wdk-core-kotlin`'s with one branch it lacks: a frame with no `id` is
a notification and is streamed to Dart instead of dropped.

## Staging the native pieces

None of these are committed. From `flutter/`, after [`phase0/README.md`](../phase0/README.md):

```bash
# 1. BareKit runtime: classes.jar + libbare-kit.so per ABI
gh release download v2.4.3 --repo holepunchto/bare-kit --pattern prebuilds.zip
unzip -q prebuilds.zip 'android/bare-kit/*'
mkdir -p wdk_core_flutter/android/libs/bare-kit
cp -R android/bare-kit/classes.jar android/bare-kit/jni wdk_core_flutter/android/libs/bare-kit/

# 2. Addons the bundle links, plus udx-native (see below)
(cd phase0 && npm run generate && node link-udx.mjs)
cp -R phase0/android-addons/* wdk_core_flutter/android/src/main/addons/

# 3. The bundle itself
cp phase0/.wdk-bundle/wdk-worklet.bundle wdk_core_flutter/android/src/main/assets/wdk.bundle

cd wdk_core_flutter/example && flutter run
```

For Phase 2, two defines stand in for the QR scan and for a reachable network:

```bash
(cd ../../phase0 && node dht-rig.mjs <lan-ip> 49800 &)            # the emulator cannot be hole-punched, see below
flutter run --dart-define=ALLOW_PEER=$(cd ../../phase0 && node ask-flutter.mjs --key) \
            --dart-define=BOOTSTRAP=<lan-ip>:49800
(cd ../../phase0 && node ask-flutter.mjs --bootstrap <lan-ip>:49800)
```

## Result, 2026-08-23, Pixel 9 Pro emulator (API 35, arm64)

| Step | Time from launch |
|---|---|
| IPC open | 594ms |
| `workletStart` | 742ms |
| seed derived and encrypted in the worklet | 804ms |
| `initializeWDK`, module constructed | 826ms |
| `callModule payRequests.getIdentity` | 8.2s (awaits the public-DHT announce) |
| `callModule payRequests.close` | refused, `METHOD_NOT_ALLOWED` |

The key returned, `a5e11c90…cba60d`, equals the one `phase0/p0-wire.mjs` and `lab/ask-phone.js`
derive from the same mnemonic.

## Phase 2, the same day: the event arrives

`ask-flutter.mjs` on the laptop dials the emulator twice. As a stranger: refused,
`PEER_CONNECTION_FAILED`, nothing reaches Dart. As Alice, whom the app allowed with `setPeers`:
the phone acknowledges, and the screen shows

```
ModuleEvent(payRequests.request {"from":"24408ecc…","amount":"25","note":"phase 2","at":…})
```

`from` is Alice's key from the Noise session. Three requests in a row, 3.2s cold then 91ms and
269ms warm, the app stable throughout. That is the POC's one sentence: a Flutter app loaded a
custom module through the JSON-RPC transport, called into it, and received an unsolicited event
back from it.

**Over a local DHT, not the public one.** On the public DHT the stranger is still refused, but
Alice's dial dies with `HOLEPUNCH_ABORTED`: a refusal travels through DHT signalling, an accepted
connection needs a real hole-punch into the guest, and QEMU's user-mode NAT does not take one.
`lab/t9` passes from the same laptop at the same time, so it is the emulator, not the stack.
`phase0/dht-rig.mjs` runs a bootstrapper and three relays on the host's LAN address; the
emulator reaches it, and so does the driver. The public-DHT result on a physical Android device
is the one thing left unrun here; the iPhone already has it at ~1.5s.

## Two things learned on the way

**The bundler does not link `udx-native`.** `linkAddons` works from a hardcoded list,
`BARE_LINK_MODULES` in `src/constants.ts`, which has `sodium-native` and not `udx-native`, the
UDP transport under `hyperdht`. The first network call from any Holepunch module then fails with
`ADDON_NOT_FOUND … Candidates: linked:libudx-native.1.21.1.so`. React Native never sees this
because `react-native-bare-kit` ships the library itself. `phase0/link-udx.mjs` links it with
`bare-link`, which is what the bundler should do.

**The worklet's output reaches logcat on Android.** Unhandled rejections and `logger.error`
calls inside the worklet show up under the app's process tag. Finding 13, that a worklet's
`console.log` goes nowhere, is an iOS observation only.
