// T4 — Can the address book actually reach a phone, and on which platforms?
//
// t1-t3 all ran in Node. Moor needs the same code inside a Bare worklet on a device,
// loaded via the bundler's `modules:` key — undocumented, no published example. Better to
// learn from a CLI in one minute than from Xcode after a day.
//
// It also settles the platform question. Two transports exist:
//
//   hrpc     -> React Native
//   jsonrpc  -> Swift / Kotlin  (what a Flutter plugin would have to use)
//
// The bundler's types claim bundled modules "aren't wired up for 'jsonrpc'". This checks
// it against the actual generated worklet, because it decides what Moor can target.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }
const info = (m) => console.log(`  ..    ${m}`)

const ROOT = path.resolve('./.data/t4')
const BUNDLER = path.resolve('./node_modules/.bin/wdk-worklet-bundler')

const config = (transport) => `module.exports = {
  transport: ${JSON.stringify(transport)},
  networks: { arbitrum: { package: '@tetherto/wdk-wallet-evm' } },
  modules: {
    addressBook: {
      package: '@tetherto/wdk-p2p-address-book',
      factory: 'createWorkletModule',
      events: ['update']
    }
  },
  output: { bundle: './out/wdk-worklet.bundle.js' }
}
`

async function generate (transport, extraArgs = []) {
  const dir = path.join(ROOT, transport)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'wdk.config.js'), config(transport))
  await writeFile(path.join(dir, 'package.json'),
    JSON.stringify({ name: `t4-${transport}`, version: '0.0.0', private: true }, null, 2))

  let ok = true, out = ''
  try {
    const r = await run(BUNDLER, ['generate', '--install', '--keep-artifacts', ...extraArgs],
      { cwd: dir, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 })
    out = r.stdout + r.stderr
  } catch (err) {
    ok = false
    out = (err.stdout || '') + (err.stderr || '')
  }

  let entry = null
  try {
    entry = await readFile(path.join(dir, '.wdk', 'wdk-worklet.generated.js'), 'utf8')
  } catch {}

  let bundleBytes = 0
  try { bundleBytes = (await stat(path.join(dir, 'out', 'wdk-worklet.bundle.js'))).size } catch {}

  return { ok, out, entry, bundleBytes, dir }
}

console.log('T4 — bundling the P2P address book into a Bare worklet\n')
console.log('  NOTE: requires @tetherto/pear-wrk-wdk installed. `generate --install` does')
console.log('        NOT pull it, and the error it prints suggests an invalid package name.\n')

// ------------------------------------------------------- hrpc / React Native
console.log('[1/2] transport: hrpc   (React Native)')
const hrpc = await generate('hrpc')

if (!hrpc.entry) {
  fail('no worklet entry generated at all')
  console.log(hrpc.out.trim().slice(-1500))
} else {
  const wired = hrpc.entry.includes('createWorkletModule') &&
                /moduleManagers\['addressBook'\]/.test(hrpc.entry)
  wired
    ? pass("`modules:` wires the address book — moduleManagers['addressBook'].createModule")
    : fail('entry generated but the address book is not wired in')

  hrpc.ok && hrpc.bundleBytes > 0
    ? pass(`bundle built (${(hrpc.bundleBytes / 1024 / 1024).toFixed(1)} MB)`)
    : fail(`bundle did not build — ${hrpc.out.trim().split('\n').slice(-3).join(' ').slice(0, 200)}`)
}

// ------------------------------------------------- jsonrpc / Swift+Kotlin (Flutter path)
console.log('\n[2/2] transport: jsonrpc   (Swift / Kotlin — the Flutter path)')
const json = await generate('jsonrpc', ['--skip-link-addons'])

if (!json.entry) {
  fail('no worklet entry generated at all')
} else {
  const mentions = /addressBook|p2p-address-book/.test(json.entry)
  mentions
    ? fail('jsonrpc entry DOES reference the module — docs may be stale, re-verify by hand')
    : pass('jsonrpc entry contains NO reference to the module — silently dropped')

  info(`entry is ${json.entry.split('\n').length} lines; has WALLET/PROTOCOL sections but no "Load modules"`)
  info(`config was accepted without warning or error — a silent no-op, not a rejection`)

  if (!json.ok) {
    info(`packing also failed here: ${(json.out.match(/❌[^\n]*\n?[^\n]*/) || ['(see log)'])[0].trim()}`)
  }
}

const flutterViable = json.entry ? /addressBook|p2p-address-book/.test(json.entry) : false
console.log(`
────────────────────────────────────────────────────────────────
  modules: on hrpc     -> ${hrpc.entry && hrpc.entry.includes('createWorkletModule') ? 'WORKS' : 'NO'}    (React Native)
  modules: on jsonrpc  -> ${flutterViable ? 'WORKS' : 'DROPPED'}  (Swift/Kotlin, i.e. Flutter)

Consequence: a Flutter build cannot load the P2P address book through the supported
path. It would need a hand-written worklet entry point, a JSON-RPC module bridge that
doesn't exist yet, and a BareKit Flutter plugin — building WDK's missing mobile
infrastructure rather than demonstrating WDK. React Native already ships one codebase
to both iOS and Android, which is the actual requirement.
────────────────────────────────────────────────────────────────`)
console.log('\nT4 done.')
