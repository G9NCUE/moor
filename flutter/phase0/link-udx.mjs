// The bundler links a fixed addon list without udx-native (finding 22). Link it here.
import { createRequire } from 'node:module'
const link = createRequire(import.meta.url)('bare-link')
const hosts = ['android-arm64', 'android-arm', 'android-ia32', 'android-x64']
for await (const step of link(new URL('./node_modules/udx-native', import.meta.url).pathname, { hosts, out: 'android-addons' })) void step
console.log('linked udx-native →', 'android-addons')
