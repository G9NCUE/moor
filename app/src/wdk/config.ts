import type { WdkConfigs } from '@tetherto/wdk-react-native-core'
import { Paths } from 'expo-file-system'

/**
 * Runtime configuration for the worklet. `wdk.config.js` decides which packages get
 * *compiled* into the bundle; this decides how they're *configured* at run time.
 */

/** USD₮0 on Arbitrum One. */
export const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'

/**
 * The one wallet this build manages. Onboarding writes it and Root unlocks it — if those
 * disagree, the app decides there's no wallet and offers to create one on top of the one
 * holding the money.
 *
 * Simulator note: iOS doesn't clear the Keychain on app delete, so a "clean" reinstall
 * comes back holding the old wallet and `restoreWallet` fails with "already exists".
 * `xcrun simctl erase` is the real reset.
 */
export const WALLET_ID = 'moor-default'

/**
 * Read each env var by its literal name. `babel-preset-expo` only inlines
 * `process.env.X` when X is a compile-time constant — an interpolated key resolves
 * to undefined in release builds while working fine in dev, which is a very
 * expensive way to find out. (Learned from the WDK starter's own scar tissue.)
 */
/**
 * A pool, not one endpoint. WDK builds a `FailoverProvider` when given an array, and the
 * public Arbitrum RPC resets connections often enough from inside the worklet that a single
 * endpoint means a balance that intermittently reads as unavailable.
 *
 * Set the env var to override with one of your own; a comma separates several.
 */
const ARBITRUM_PROVIDER: string[] = (
  process.env.EXPO_PUBLIC_ARBITRUM_PROVIDER ||
  'https://arb1.arbitrum.io/rpc,https://arbitrum-one-rpc.publicnode.com,https://arbitrum.drpc.org'
)
  .split(',')
  .map((url: string) => url.trim())
  .filter(Boolean)

/**
 * Fee mode. Must match what `wdk.config.js` compiled into the worklet — the wallet
 * package differs between the two, so a mismatch surfaces as a missing-config error.
 * Regenerate the bundle after changing this.
 */
export const SELF_GAS = process.env.EXPO_PUBLIC_MOOR_SELF_GAS === '1'

/**
 * The contract an EOA delegates execution to under EIP-7702.
 *
 * This is the single most security-sensitive constant in the app: whatever sits here
 * gets to act as your account. WDK requires it, ships no per-chain value, and its docs
 * say "users must verify this address independently for their target chain" — which is
 * an unusual thing to hand a developer with no registry to check against.
 *
 * So we checked. `eth_getCode` on 2026-08-11 returns the SAME 3639-byte runtime
 * bytecode at this address on Arbitrum One, Ethereum and Polygon
 * (sha256 of the hex string begins bf461b86d228d65e). Re-run `lab/t5-delegation.js`
 * before trusting it with real money — verify, don't inherit.
 */
export const DELEGATION_ADDRESS =
  process.env.EXPO_PUBLIC_ARBITRUM_DELEGATION_ADDRESS ||
  '0xe6Cae83BdE06E4c305530e199D7217f42808555B'

/**
 * ERC-4337 bundler — where the signed operation is submitted. Pimlico's public endpoint
 * needs no API key, which is what keeps this repo clonable.
 *
 * Not Candide, even though Candide serves both roles from one URL and is still our
 * paymaster below. Its public endpoint estimates EntryPoint v0.8 operations happily and
 * then fails to submit them, returning the EntryPoint's own bytecode as an error string.
 * v0.7 operations get clean errors from the same endpoint, so it is specific to v0.8 —
 * which is the version EIP-7702 requires. Measured, and recorded as SPEC finding 17.
 *
 * 42161 = Arbitrum One.
 */
export const BUNDLER_URL =
  process.env.EXPO_PUBLIC_ARBITRUM_BUNDLER_URL ||
  'https://public.pimlico.io/v2/42161/rpc'

/**
 * ERC-7677 paymaster — who pays the ETH and takes USD₮ for it. A separate service from the
 * bundler, and here it has to be: Candide prices USD₮ correctly and Pimlico's token
 * paymaster wants an API key.
 */
export const PAYMASTER_URL =
  process.env.EXPO_PUBLIC_ARBITRUM_PAYMASTER_URL ||
  'https://api.candide.dev/public/v3/42161'

/**
 * Blind peer(s) this build mirrors the address book to. A pool, not a constant —
 * `AddressBook.selectMirrors()` ranks it by HRW, so mirrors can be added or rotated
 * without an app update and a user can point at their own.
 *
 * Defaults to the mirror we operate, so cloning this repo and running it gives you
 * working two-device sync with nothing to provision. Override to point at your own, or
 * set it to a single space to disable mirroring entirely — contacts then work on this
 * device and simply never leave it.
 *
 * Demo infrastructure: best-effort, no SLA, may be wiped. See infra/blind-peer/README.
 * Losing it costs you sync-while-offline and nothing else; your data is on your devices.
 */
export const MOOR_BLIND_PEER = 'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o'

export const BLIND_PEERS: string[] = (
  process.env.EXPO_PUBLIC_BLIND_PEERS || MOOR_BLIND_PEER
)
  .split(',')
  .map((k: string) => k.trim())
  .filter(Boolean)

/** Scopes the seed-derived address book to this app. Change it and you get a different book. */
export const ADDRESS_BOOK_NAMESPACE = 'moor-wallet'

/**
 * Where the address book's corestore lives on disk.
 *
 * Must be ABSOLUTE. Neither `wdk-react-native-core` nor `pear-wrk-wdk` gives a module
 * any storage root — `capabilities` is passed through as `{}` — so the app is the only
 * thing that knows the sandbox path, and a relative value fails inside the worklet with
 * a bare `ENOENT: no such file or directory, stat "…"`.
 *
 * The module derives a per-seed subdirectory beneath this, so two seeds never share a
 * corestore on one device.
 */
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

            /**
             * Paymaster TOKEN mode, not sponsorship mode. The distinction matters:
             * sponsorship means we pay the user's gas and need a funded account with
             * the provider; token mode means the paymaster takes its fee in USD₮ from
             * the user's own balance and pays the ETH itself.
             *
             * Token mode is the honest fit here. Nobody is subsidising anyone, there's
             * no billing relationship to maintain, and the user experience is the one
             * that matters: they hold USD₮, they spend USD₮, they never learn what a
             * gas token is. The audit measured this exact behaviour in tether.wallet —
             * 0.036 USD₮ deducted from the amount, no ETH ever.
             *
             * `paymasterAddress` is deliberately omitted: it's optional, used only to
             * assert against what the RPC returns, and the actual paymaster is
             * discovered over ERC-7677.
             */
            paymasterToken: { address: USDT0_ARBITRUM }
          }
    }
  },

  /**
   * Runtime config for the module compiled in by `wdk.config.js`. The module
   * derives a per-seed subdirectory under `storagePath`, so two seeds can never
   * share one corestore on a device.
   */
  modules: {
    addressBook: {
      namespace: ADDRESS_BOOK_NAMESPACE,
      mirrors: BLIND_PEERS,
      storagePath: ADDRESS_BOOK_STORAGE
    },

    /**
     * Payment requests. No storage and no mirrors — a request is a live stream to a phone
     * that is on, and nothing is persisted. Making it survive a powered-off phone is
     * Phase 5.
     *
     * `peers` starts empty and the app replaces it with the keys from the address book via
     * setPeers(). Until it does, every inbound connection is refused, which is the right
     * default: an allowlist that fails open is not an allowlist.
     */
    payRequests: {
      peers: []
    }
  }
}

export default wdkConfigs
