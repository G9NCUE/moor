// The bundler links a fixed addon list (finding 22). Read what the bundle actually expects
// and link whatever is missing, the way the bundler links the rest.
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const link = require('bare-link')

const bundle = readFileSync('.wdk-bundle/wdk-worklet.bundle', 'latin1')
const expected = [...new Set([...bundle.matchAll(/linked:lib([a-z0-9-]+)\.([\d.]+)\.so/g)].map((m) => `${m[1]}.${m[2]}`))]
const hosts = ['android-arm64', 'android-arm', 'android-ia32', 'android-x64']

for (const spec of expected) {
  if (existsSync(`android-addons/arm64-v8a/lib${spec}.so`)) continue
  const name = spec.replace(/\.[\d.]+$/, '')
  const dir = [`node_modules/${name}`, `../../app/modules/pay-requests/node_modules/${name}`].find(existsSync)
  if (!dir) { console.error('not installed:', name); continue }
  for await (const s of link(dir, { hosts, out: 'android-addons' })) void s
  console.log('linked', spec)
}
