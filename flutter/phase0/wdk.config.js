/** Phase 0 — the smallest config that exercises modules: on the jsonrpc transport. */
module.exports = {
  transport: 'jsonrpc',
  // initializeWDK refuses to run without a network; the wallet is never called.
  networks: {
    arbitrum: { package: '@tetherto/wdk-wallet-evm' }
  },
  modules: {
    payRequests: {
      package: '@moor/pay-requests',
      factory: 'createModule'
    }
  },
  allowedModuleMethods: {
    payRequests: { methods: ['getIdentity', 'setPeers', 'request'] }
  },
  output: {
    bundle: './.wdk-bundle/wdk-worklet.bundle',
    addons: { android: './android-addons' }
  },
  options: {
    linkAddons: true,
    platforms: ['android'],
    targets: ['android-arm64', 'android-x64'],
    convertEsmToCjs: true
  }
}
