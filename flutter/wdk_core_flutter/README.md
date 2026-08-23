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
