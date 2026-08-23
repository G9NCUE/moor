# Phase 0 — does WDK's JSON-RPC transport carry a custom module?

The first phase of [`docs/flutter-poc.md`](../../docs/flutter-poc.md). No Flutter, no Android,
no BareKit. Two questions, answered in Node on 2026-08-23:

1. Does [bundler#54](https://github.com/tetherto/wdk-worklet-bundler/pull/54) wire a `modules:`
   entry into a JSON-RPC bundle? **Yes.** Published `beta.10` drops it silently.
2. Does [pear-wrk-wdk#83](https://github.com/tetherto/pear-wrk-wdk/pull/83) carry a real module,
   call and event, over the byte stream a native host would speak? **Yes**, end to end, with
   `@moor/pay-requests` and a local DHT.

Verified against `localhost41/wdk-worklet-bundler@0843bca` and `localhost41/pear-wrk-wdk@1e63c66`,
each exactly one commit ahead of `tetherto/main`. Both branches' own suites pass here (128 and 85).

## Run it

The two PR branches are not published, so they live as sibling checkouts, gitignored:

```bash
cd flutter
git clone --branch feat/jsonrpc-modules https://github.com/localhost41/wdk-worklet-bundler.git bundler
git clone --branch feat/jsonrpc-modules https://github.com/localhost41/pear-wrk-wdk.git pear
(cd bundler && npm install && npm run build)      # ships no dist/
(cd pear && npm install)                           # the wire harness loads its src/ directly
npm install --prefix ../app/modules/pay-requests   # the module's own deps (finding 12, lab/README)

cd phase0
npm install
npm run generate                                   # the bundle
npm run generate -- --source-only                  # keep .wdk/wdk-worklet.generated.js to read
npm run wire                                       # the byte stream
```

## What `generate` proves

`wdk.config.js` is `transport: 'jsonrpc'` plus the same `modules:` and `allowedModuleMethods`
as the app. With the PR branch, `.wdk/wdk-worklet.generated.js` contains:

```js
// Transport: jsonrpc
moduleManagers['payRequests'] = {
  events: [],
  createModule: (ctx) => PayRequests.createModule(ctx)
};
…
  allowedModuleMethods: {"payRequests":{"methods":["getIdentity","setPeers","request"]}},
```

and the packed bundle (3.2 MB, `android-arm64` + `android-x64`, ~2s) contains the module's
source, pear#83's `case"callModule"` and its `moduleEvent` emitter.

**Control:** the identical config through published `wdk-worklet-bundler@1.0.0-beta.10` and
`pear-wrk-wdk@1.0.0-beta.11` produces an entry with no module wiring, a bundle with **no trace
of the module's source**, and **no warning**. Finding 14 still holds on the current release.

The entry is deleted after a successful pack; `--source-only` keeps it.

## What `wire` proves

`p0-wire.mjs` registers pear#83's `registerJsonRpcHandlers` on a fake IPC and speaks the exact
frames a Flutter host would: 4-byte big-endian length, UTF-8 JSON-RPC 2.0. It stands up a local
DHT (a bootstrapper and three relays; a bootstrapper alone connects nothing, finding 11) and uses
the real `@moor/pay-requests`. Fifteen assertions, four consecutive runs, all pass:

| | Result |
|---|---|
| `workletStart` → `getSeedAndEntropyFromMnemonic` → `initializeWDK` | module constructed from `config.modules.payRequests`, which reaches the constructor as `config` |
| `callModule payRequests.getIdentity` | `{"publicKey":"a5e11c90…"}` in 16ms, **equal to the key `lab/ask-phone.js` derives from the same mnemonic** |
| `callModule payRequests.close` | refused: `Method "close" is not allowed for module "payRequests"` |
| `callModule nope.x` | refused: `Module not initialized: nope` |
| a stranger dials the phone | `PEER_CONNECTION_FAILED`; no notification leaks |
| a contact sends a request | arrives in **~18ms** as a JSON-RPC 2.0 **notification with no `id`**, `params.module`/`event` set, `payload.from` is the sender's key from the Noise session, `payload` a parsed object rather than a double-encoded string |
| `dispose` | ok |

The notification line is the one that matters for what comes next: it is the frame
`wdk-core-kotlin` parses and discards today, because its read loop has one branch keyed on `id`.

## What this does not prove

That any of it runs inside a Bare worklet on a device, or that BareKit's IPC behaves like the
fake one. Those are Phase 1 and Phase 2, and after this they are the **only** open questions.
Everything between the host and the module is now known to work.
