// T5: the EIP-7702 delegation contract has byte-identical code on Arbitrum, Ethereum and
// Polygon. Rules out an empty address or three contracts behind one; does not prove it is
// honest.

import { createHash } from 'node:crypto'

const DELEGATION = process.env.DELEGATION_ADDRESS ||
  '0xe6Cae83BdE06E4c305530e199D7217f42808555B'

const CHAINS = [
  { name: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc' },
  { name: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
  { name: 'polygon', rpc: 'https://polygon-bor-rpc.publicnode.com' }
]

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }

async function getCode (rpc, address) {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
    signal: AbortSignal.timeout(25_000)
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

console.log(`T5 — EIP-7702 delegation contract\n\n  address: ${DELEGATION}\n`)

const seen = []
for (const { name, rpc } of CHAINS) {
  try {
    const code = await getCode(rpc, DELEGATION)
    if (!code || code === '0x') {
      fail(`${name}: NO CODE at this address — do not use it here`)
      continue
    }
    const bytes = (code.length - 2) / 2
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 16)
    console.log(`  ${name.padEnd(9)} ${String(bytes).padStart(5)} bytes  sha256=${hash}`)
    seen.push({ name, hash, bytes })
  } catch (err) {
    // A dead RPC is not evidence of an empty address. Say which one it was.
    console.log(`  ${name.padEnd(9)} unreachable (${err.message}) — inconclusive, retry`)
  }
}

console.log()

if (seen.length === 0) {
  fail('no chain could be reached — this proves nothing either way')
} else {
  seen.length === CHAINS.length
    ? pass(`code present on all ${CHAINS.length} chains`)
    : console.log(`  ..    code present on ${seen.length}/${CHAINS.length} reachable chains`)

  const hashes = new Set(seen.map((s) => s.hash))
  hashes.size === 1
    ? pass(`bytecode identical everywhere it was reachable (${[...hashes][0]})`)
    : fail(`bytecode DIFFERS between chains: ${seen.map((s) => `${s.name}=${s.hash}`).join(', ')}`)
}

console.log('\nT5 done.')
