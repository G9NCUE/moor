import type { WdkConfigs } from '@tetherto/wdk-react-native-core'
import { Paths } from 'expo-file-system'

// Runtime configuration for the worklet. wdk.config.js decides what is compiled in.

/** USD₮0 on Arbitrum One. */
export const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'

// Onboarding writes this id and Root unlocks it. On the iOS simulator the Keychain survives
// an app delete; `xcrun simctl erase` is the real reset.
export const WALLET_ID = 'moor-default'

// Each env var is read by its literal name: babel-preset-expo only inlines constant keys.

// A pool: WDK builds a FailoverProvider from an array, and the public RPC resets
// connections often enough that one endpoint reads as an intermittent balance.
const ARBITRUM_PROVIDER: string[] = (
  process.env.EXPO_PUBLIC_ARBITRUM_PROVIDER ||
  'https://arb1.arbitrum.io/rpc,https://arbitrum-one-rpc.publicnode.com,https://arbitrum.drpc.org'
)
  .split(',')
  .map((url: string) => url.trim())
  .filter(Boolean)

/** Must match the wallet package wdk.config.js compiled in. Regenerate the bundle after changing. */
export const SELF_GAS = process.env.EXPO_PUBLIC_MOOR_SELF_GAS === '1'

// The EIP-7702 delegate: whatever sits here gets to act as the account. WDK ships no
// per-chain value and no registry. lab/t5 verified identical bytecode on Arbitrum,
// Ethereum and Polygon (finding 10). Re-run it before trusting real money.
export const DELEGATION_ADDRESS =
  process.env.EXPO_PUBLIC_ARBITRUM_DELEGATION_ADDRESS ||
  '0xe6Cae83BdE06E4c305530e199D7217f42808555B'

// Pimlico, not Candide: Candide's public bundler cannot submit EntryPoint v0.8
// operations, which EIP-7702 needs (finding 17). 42161 = Arbitrum One.
export const BUNDLER_URL =
  process.env.EXPO_PUBLIC_ARBITRUM_BUNDLER_URL ||
  'https://public.pimlico.io/v2/42161/rpc'

// Candide prices USD₮ correctly; Pimlico's token paymaster wants an API key.
export const PAYMASTER_URL =
  process.env.EXPO_PUBLIC_ARBITRUM_PAYMASTER_URL ||
  'https://api.candide.dev/public/v3/42161'

// The mirror we run: best effort, no SLA, see infra/blind-peer. Losing it costs sync
// while offline and nothing else. Set the env var to a single space to disable mirroring.
export const MOOR_BLIND_PEER = 'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o'

export const BLIND_PEERS: string[] = (
  process.env.EXPO_PUBLIC_BLIND_PEERS || MOOR_BLIND_PEER
)
  .split(',')
  .map((k: string) => k.trim())
  .filter(Boolean)

/** Scopes the seed-derived address book to this app. */
export const ADDRESS_BOOK_NAMESPACE = 'moor-wallet'

// Must be absolute: no layer hands a module a storage root, and a relative path fails in
// the worklet with a bare ENOENT. The module adds a per-seed subdirectory.
export const ADDRESS_BOOK_STORAGE = Paths.document.uri.replace(/^file:\/\//, '').replace(/\/$/, '') +
  '/moor-addressbook'

export const wdkConfigs: WdkConfigs = {
  networks: {
    arbitrum: {
      blockchain: 'arbitrum',
      config: SELF_GAS
        ? { provider: ARBITRUM_PROVIDER }
        : {
            provider: ARBITRUM_PROVIDER,
            delegationAddress: DELEGATION_ADDRESS,
            bundlerUrl: BUNDLER_URL,
            paymasterUrl: PAYMASTER_URL,
            // Token mode: the paymaster takes its fee in USD₮ from the user and pays the
            // ETH itself. No sponsorship, no billing relationship.
            paymasterToken: { address: USDT0_ARBITRUM }
          }
    }
  },

  modules: {
    addressBook: {
      namespace: ADDRESS_BOOK_NAMESPACE,
      mirrors: BLIND_PEERS,
      storagePath: ADDRESS_BOOK_STORAGE
    },
    // Nothing persisted; a request is a live stream to a phone that is on (Phase 5 is the
    // durable version). `peers` starts empty and the app fills it from the address book, so
    // until then every inbound connection is refused.
    payRequests: {
      peers: []
    }
  }
}

export default wdkConfigs
