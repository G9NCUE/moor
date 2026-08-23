# phase0

Does WDK's JSON-RPC transport carry a custom module? Yes, on the two PR branches. Results in
[`docs/flutter-poc.md`](../../docs/flutter-poc.md).

## Run

The PR branches are unpublished, so they live as sibling checkouts, gitignored. `pear` carries
one commit of ours on top of #83, the fix for finding 23:

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
node link-missing.mjs               # the addons the bundler does not link (finding 22)
npm run wire                        # pay-requests over pear#83's handler on a fake IPC
node a-wire.mjs                     # the address book, same wire
```

## Files

| | |
|---|---|
| `wdk.config.js` | `transport: 'jsonrpc'` plus the app's `modules:` and `allowedModuleMethods` |
| `p0-wire.mjs` | fifteen assertions over the exact frames a native host speaks, on a local DHT |
| `link-missing.mjs` | reads the bundle's `linked:` references and links what the bundler did not (finding 22) |
| `wire.mjs` | the fake IPC and the init sequence, shared by the harnesses |
| `a-wire.mjs` | the address book over the wire: enrol, `update`, contact and address round trip |
| `dht-rig.mjs` | a bootstrapper and three relays on the host's LAN address, for the emulator |
| `ask-flutter.mjs` | `lab/ask-phone.js` for an app with no address book; `--key` prints Alice's key |

## Control

The same config through published `wdk-worklet-bundler@1.0.0-beta.10` and
`pear-wrk-wdk@1.0.0-beta.11` produces no module wiring, no trace of the module in the bundle,
and no warning.
