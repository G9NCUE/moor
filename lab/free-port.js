// A free UDP port, asked for rather than assumed. hyperdht's bootstrapper refuses port 0,
// so the local-DHT tests hardcoded 49737/49738 — until the Moor iOS simulator build took
// 49737 as an ephemeral port and t3 started failing with EADDRINUSE for no reason of its own.

import dgram from 'node:dgram'

export function freePort (host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', reject)
    socket.bind(0, host, () => {
      const { port } = socket.address()
      socket.close(() => resolve(port))
    })
  })
}
