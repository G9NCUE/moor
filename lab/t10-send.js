// T10: an account holding zero ETH transfers USD₮0 on Arbitrum One, fee paid in USD₮.
// Mainnet, because the paymaster, exchange rate and delegation have no testnet. Throwaway
// seed in lab/.send-seed, generated on first run; fund it with a couple of dollars.
//     node t10-send.js           quote only
//     node t10-send.js --send    spends

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { Interface, JsonRpcProvider } from 'ethers'
import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import WalletManagerEvm7702Gasless from '@tetherto/wdk-wallet-evm-7702-gasless'

const SEED_FILE = new URL('./.send-seed', import.meta.url)

// Same values the app compiles in — see app/src/wdk/config.ts. Keeping them literal here
// means this test fails if the app's config drifts, rather than following it silently.
const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
// Two providers: Candide cannot submit EntryPoint v0.8 (finding 17), Pimlico's paymaster wants a key.
const CONFIG = {
  provider: process.env.MOOR_ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: process.env.MOOR_BUNDLER_URL || 'https://public.pimlico.io/v2/42161/rpc',
  paymasterUrl: process.env.MOOR_PAYMASTER_URL || 'https://api.candide.dev/public/v3/42161',
  paymasterToken: { address: USDT0 }
}

const AMOUNT = 100_000n // 0.1 USD₮0, in base units (6 decimals)

const rpc = new JsonRpcProvider(CONFIG.provider)

const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1 }
const usdt = (v) => `${(Number(v) / 1e6).toFixed(6)} USD₮`

/** Bundler errors wrap the useful part two or three causes deep. Unwrap the whole chain. */
function reason (err) {
  const chain = []
  for (let e = err; e; e = e.cause) chain.push(e.message)
  return chain.join(' <- ')
}

// Seen once (finding 18): the paymaster priced USD₮ at 18 decimals against a 6-decimal token
// and demanded 10^12 times the fee. Name it if it returns.
function explainPaymaster (err) {
  const message = err.cause?.message ?? err.message ?? ''
  const required = message.match(/0x[0-9a-f]+/i)?.[0]
  if (!/allowance/.test(message) || !required) return err

  const asked = BigInt(required)
  return new Error(
    `the paymaster wants ${usdt(asked)} to cover a fee worth ${usdt(asked / 10n ** 12n)}. ` +
    'Its published USD₮ exchange rate is scaled for 18 decimals against a 6 decimal token — ' +
    'see finding 18. Point MOOR_PAYMASTER_URL at one that prices USD₮ correctly.'
  )
}

// Read from chain, not through the library. A delegated EOA is 23 bytes: 0xef0100 + address.
async function delegateOf (address) {
  const code = await rpc.getCode(address)
  return code?.startsWith('0xef0100') ? '0x' + code.slice(8) : null
}

function loadSeed () {
  if (process.env.MOOR_SEND_SEED) return { seed: process.env.MOOR_SEND_SEED.trim(), fresh: false }
  if (existsSync(SEED_FILE)) return { seed: readFileSync(SEED_FILE, 'utf8').trim(), fresh: false }

  const seed = generateMnemonic(wordlist)
  writeFileSync(SEED_FILE, seed + '\n', { mode: 0o600 })
  return { seed, fresh: true }
}

const send = process.argv.includes('--send')
const { seed, fresh } = loadSeed()

const wallet = new WalletManagerEvm7702Gasless(seed, CONFIG)
const alice = await wallet.getAccount(0)
const bob = await wallet.getAccount(1)

const aliceAddr = await (await alice.toReadOnlyAccount()).getAddress()
const bobAddr = await (await bob.toReadOnlyAccount()).getAddress()

console.log('T10 — send USD₮0 with no ETH\n')
console.log(`  from    ${aliceAddr}  (account 0)`)
console.log(`  to      ${bobAddr}  (account 1, same seed — the money stays yours)\n`)

if (fresh) {
  console.log('  A new throwaway seed was written to lab/.send-seed.')
  console.log(`  Fund ${aliceAddr} with a couple of USD₮0 on Arbitrum One, then re-run.`)
  console.log('  Do NOT send ETH. Having none is the point of the test.\n')
  process.exit(0)
}

const [aliceEth, aliceUsdt, bobUsdtBefore] = await Promise.all([
  rpc.getBalance(aliceAddr),
  alice.toReadOnlyAccount().then((a) => a.getTokenBalance(USDT0)),
  bob.toReadOnlyAccount().then((a) => a.getTokenBalance(USDT0))
])

console.log(`  balance ${usdt(aliceUsdt)}   ${aliceEth} wei ETH\n`)

if (aliceEth === 0n) pass('the sending account holds no ETH at all')
else console.log(`  ..    account holds ${aliceEth} wei of ETH — the no-gas claim is untested while that is true`)

if (aliceUsdt < AMOUNT * 2n) {
  fail(`not enough USD₮0 to test — fund ${aliceAddr} with a couple of dollars`)
  process.exit(1)
}

const delegatedBefore = await delegateOf(aliceAddr)
console.log(`  7702    ${delegatedBefore ? `delegated to ${delegatedBefore}` : 'not yet delegated'}\n`)

// An undelegated account cannot be quoted (finding 16), so the assertion is conditional.
const quote = await alice.quoteTransfer({ token: USDT0, recipient: bobAddr, amount: AMOUNT })
  .then((q) => ({ fee: BigInt(q.fee) }), (err) => ({ err }))

if (quote.err) {
  const aa20 = /AA20|not deployed/.test(quote.err.message + (quote.err.cause?.message ?? ''))
  if (aa20 && !delegatedBefore) {
    pass('quoting an undelegated account fails with AA20 — the upstream bug, reproduced')
    console.log('        (transfer() signs the 7702 authorization; quoteTransfer() does not)')
  } else {
    fail(`quote failed for an unexpected reason: ${quote.err.message}`)
    process.exit(1)
  }
} else {
  console.log(`  quote   ${usdt(AMOUNT)} to Bob, fee ${usdt(quote.fee)}\n`)

  quote.fee > 0n
    ? pass('the fee is quoted in USD₮, not in ETH')
    : fail('fee came back as zero — that is the sponsorship path, not token mode')

  quote.fee < 1_000_000n
    ? pass('the fee is under a dollar')
    : fail(`fee is ${usdt(quote.fee)} — something is wrong with the exchange rate`)
}

if (!send) {
  console.log('\n  Nothing was sent. Re-run with --send to spend.\n\nT10 done.')
  process.exit()
}

console.log('  sending…')
const started = Date.now()

// transfer() prices before it signs the authorization, so a first send throws AA20
// (finding 16). signTransaction() then sendTransaction() is the way through.
const result = await alice.transfer({ token: USDT0, recipient: bobAddr, amount: AMOUNT })
  .catch(async (err) => {
    const aa20 = /AA20|not deployed/.test(err.message + (err.cause?.message ?? ''))
    if (!aa20 || delegatedBefore) throw err

    pass('transfer() also fails with AA20 on a first send — it prices before it signs')

    const erc20 = new Interface(['function transfer(address to, uint256 amount) returns (bool)'])
    const signed = await alice.signTransaction({
      to: USDT0,
      value: 0,
      data: erc20.encodeFunctionData('transfer', [bobAddr, AMOUNT])
    })
      .catch((signErr) => { throw explainPaymaster(signErr) })
    return await alice.sendTransaction(signed)
  })
  .catch((err) => { fail(reason(err)); return null })

if (result === null) {
  console.log('\n  Nothing moved. The money is untouched.\n\nT10 done.')
  process.exit(1)
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1)

console.log(`  userOp  ${result.hash}  (${elapsed}s)\n`)

// The bundler returns as soon as it accepts the operation; inclusion follows.
let receipt = null
for (let i = 0; i < 30 && receipt === null; i++) {
  receipt = await alice.getUserOperationReceipt(result.hash)
  if (receipt === null) await new Promise((resolve) => setTimeout(resolve, 2000))
}

receipt?.success
  ? pass(`included on chain in tx ${receipt.receipt.transactionHash}`)
  : fail(`no successful receipt for ${result.hash} after 60s`)

const [aliceAfter, bobAfter, ethAfter] = await Promise.all([
  alice.toReadOnlyAccount().then((a) => a.getTokenBalance(USDT0)),
  bob.toReadOnlyAccount().then((a) => a.getTokenBalance(USDT0)),
  rpc.getBalance(aliceAddr)
])

bobAfter - bobUsdtBefore === AMOUNT
  ? pass(`Bob received exactly ${usdt(AMOUNT)} — the fee did not come out of the amount sent`)
  : fail(`Bob received ${usdt(bobAfter - bobUsdtBefore)}, expected ${usdt(AMOUNT)}`)

const spent = aliceUsdt - aliceAfter
console.log(`\n  Alice paid ${usdt(spent)} in total — ${usdt(AMOUNT)} to Bob, ${usdt(spent - AMOUNT)} in fees\n`)

ethAfter === aliceEth
  ? pass('her ETH balance did not move')
  : fail(`ETH balance changed by ${ethAfter - aliceEth} wei`)

const delegatedAfter = await delegateOf(aliceAddr)
delegatedAfter?.toLowerCase() === CONFIG.delegationAddress.toLowerCase()
  ? pass('the EOA is now delegated to the contract t5 verified')
  : fail(`delegated to ${delegatedAfter ?? 'nothing'}, expected ${CONFIG.delegationAddress}`)

// If the AA20 was about delegation, the same quote works now. If not, the diagnosis was wrong.
const requote = await alice.quoteTransfer({ token: USDT0, recipient: bobAddr, amount: AMOUNT })
  .then((q) => ({ fee: BigInt(q.fee) }), (err) => ({ err }))

requote.err
  ? fail(`quoting still fails once delegated: ${requote.err.message}`)
  : pass(`quoting works once delegated — ${usdt(requote.fee)}, so AA20 was the missing authorization`)

console.log('\nT10 done.')
