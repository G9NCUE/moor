# phase0

Does WDK's JSON-RPC transport carry a custom module? Yes, on the two PR branches. Results in
[`docs/flutter-poc.md`](../../docs/flutter-poc.md).

## Run

The PR branches are unpublished, so they live as sibling checkouts, gitignored:

```bash
cd flutter
git clone --branch feat/jsonrpc-modules https://github.com/localhost41/wdk-worklet-bundler.git bundler
git clone --branch feat/jsonrpc-modules https://github.com/localhost41/pear-wrk-wdk.git pear
(cd bundler && npm install && npm run build)
(cd pear && npm install)
npm install --prefix ../app/modules/pay-requests

cd phase0
npm install
npm run generate                    # the bundle; --source-only keeps the entry for reading
node link-udx.mjs                   # the addon the bundler does not link (finding 22)
npm run wire                        # pear#83's handler over a fake IPC with the real module
```

## Files

| | |
|---|---|
| `wdk.config.js` | `transport: 'jsonrpc'` plus the app's `modules:` and `allowedModuleMethods` |
| `p0-wire.mjs` | fifteen assertions over the exact frames a native host speaks, on a local DHT |
| `link-udx.mjs` | links `udx-native` into `android-addons/` the way the bundler links the others |
| `dht-rig.mjs` | a bootstrapper and three relays on the host's LAN address, for the emulator |
| `ask-flutter.mjs` | `lab/ask-phone.js` for an app with no address book; `--key` prints Alice's key |

## Control

The same config through published `wdk-worklet-bundler@1.0.0-beta.10` and
`pear-wrk-wdk@1.0.0-beta.11` produces no module wiring, no trace of the module in the bundle,
and no warning.
