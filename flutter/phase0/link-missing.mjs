// The bundler links a fixed addon list from top-level node_modules (finding 22). Read what
// the bundle actually expects, find each package at that exact version, link what is missing.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const link = createRequire(import.meta.url)('bare-link')

const bundle = readFileSync('.wdk-bundle/wdk-worklet.bundle', 'latin1')
const expected = [...new Set([...bundle.matchAll(/linked:lib([a-z0-9-]+)\.([\d.]+)\.so/g)].map((m) => [m[1], m[2]].join('@')))]
const hosts = ['android-arm64', 'android-arm', 'android-ia32', 'android-x64']

function* packages (dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name.startsWith('@')) { yield* packages(p); continue }
    if (existsSync(join(p, 'package.json'))) yield p
    if (existsSync(join(p, 'node_modules'))) yield* packages(join(p, 'node_modules'))
  }
}
const installed = new Map()
for (const root of ['node_modules', '../../app/modules/pay-requests/node_modules']) {
  if (!existsSync(root)) continue
  for (const p of packages(root)) {
    const { name, version } = JSON.parse(readFileSync(join(p, 'package.json')))
    installed.set(`${name}@${version}`, p)
  }
}

for (const spec of expected) {
  const [name, version] = spec.split('@')
  if (existsSync(`android-addons/arm64-v8a/lib${name}.${version}.so`)) continue
  const dir = installed.get(spec)
  if (!dir) { console.error('not installed:', spec); continue }
  for await (const s of link(dir, { hosts, out: 'android-addons' })) void s
  console.log('linked', spec)
}
