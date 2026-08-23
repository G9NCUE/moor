# wdk_core_flutter

WDK from Flutter over the JSON-RPC transport. Android only. Results in
[`docs/flutter-poc.md`](../../docs/flutter-poc.md).

```
Dart  ──MethodChannel / EventChannel──►  Kotlin  ──BareKit IPC──►  Bare worklet  ──►  module
```

`WdkCore.kt` ports `wdk-core-kotlin`'s, plus the branch it lacks: a frame with no `id` is a
notification and is streamed to Dart.

| | |
|---|---|
| `wdk_core_flutter.dart` | the transport: `call`, `callModule`, `moduleEvents`, seed generation |
| `wallet.dart` | one account through `callMethod`: address, balance, quote, transfer |
| `address_book.dart` | `@tetherto/wdk-p2p-address-book` as a module: enrol, contacts, `updates` |
| `seed_store.dart` | the encrypted seed in the Keystore |
| `example/` | onboarding, balance, contacts synced through the mirror, payment requests, send |

## Staging the native pieces

None are committed. From `flutter/`, after [`phase0/README.md`](../phase0/README.md):

```bash
gh release download v2.4.3 --repo holepunchto/bare-kit --pattern prebuilds.zip
unzip -q prebuilds.zip 'android/bare-kit/*'
mkdir -p wdk_core_flutter/android/libs/bare-kit
cp -R android/bare-kit/classes.jar android/bare-kit/jni wdk_core_flutter/android/libs/bare-kit/

cp -R phase0/android-addons/* wdk_core_flutter/android/src/main/addons/
cp phase0/.wdk-bundle/wdk-worklet.bundle wdk_core_flutter/android/src/main/assets/wdk.bundle
```

## Run

```bash
cd wdk_core_flutter/example
flutter run                                        # phase 1: the sequence, then listen
```

Phase 2, with a local DHT because the emulator cannot be hole-punched:

```bash
(cd ../../phase0 && node dht-rig.mjs <lan-ip> 49800 &)
flutter run --dart-define=ALLOW_PEER=$(cd ../../phase0 && node ask-flutter.mjs --key) \
            --dart-define=BOOTSTRAP=<lan-ip>:49800
(cd ../../phase0 && node ask-flutter.mjs --bootstrap <lan-ip>:49800)
```

`ALLOW_PEER` stands in for the QR scan. Expect `moduleEvents: 1` on screen with Alice's key as
`from`. On a real phone drop `BOOTSTRAP` and `dht-rig`; wait for `getIdentity` (the public
announce, ~15s on 5G) before asking.
