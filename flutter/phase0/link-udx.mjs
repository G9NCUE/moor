// The bundler links a fixed list of addons (bundler/src/constants.ts, BARE_LINK_MODULES) and
// udx-native is not on it, so a Holepunch module has no UDP transport on device. Link it here.
import { createRequire } from 'node:module'
const link = createRequire(import.meta.url)('bare-link')
const hosts = ['android-arm64', 'android-arm', 'android-ia32', 'android-x64']
for await (const step of link(new URL('./node_modules/udx-native', import.meta.url).pathname, { hosts, out: 'android-addons' })) void step
console.log('linked udx-native →', 'android-addons')
