// A local DHT on the host's LAN address, which the emulator can reach too. One bootstrapper is not a network (finding
// 11); three non-firewalled relays give hole-punching its vantage points. Stays up until killed.
import DHT from '@moor/pay-requests/node_modules/hyperdht/index.js'

const [host, port = 49737] = [process.argv[2], Number(process.argv[3])]
if (!host) { console.error('usage: node dht-rig.mjs <lan-ip> [port]'); process.exit(1) }
const bootstrapper = DHT.bootstrapper(port, host)
await bootstrapper.ready()
const bootstrap = [{ host, port }]
const relays = await Promise.all([1, 2, 3].map(async () => {
  const n = new DHT({ bootstrap, ephemeral: false, firewalled: false }); await n.ready(); return n
}))
console.log(`dht up: bootstrap ${host}:${port}, ${relays.length} relays`)
process.on('SIGINT', async () => { for (const n of relays) await n.destroy(); await bootstrapper.destroy(); process.exit(0) })
