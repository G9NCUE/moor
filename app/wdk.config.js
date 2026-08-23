/** @type {import('@tetherto/wdk-worklet-bundler').WdkBundleConfig} */

// Fee mode is a bundle-time choice: it picks the wallet package compiled in.
//   default           gasless, fee paid in USD₮
//   MOOR_SELF_GAS=1   plain EOA, gas paid in ETH; the path that survives every paymaster refusing you
// Regenerate after changing: MOOR_SELF_GAS=1 npx wdk-worklet-bundler generate
const SELF_GAS = process.env.MOOR_SELF_GAS === '1'

module.exports = {
  // One asset, one chain.
  networks: {
    arbitrum: {
      package: SELF_GAS
        ? '@tetherto/wdk-wallet-evm'
        : '@tetherto/wdk-wallet-evm-7702-gasless'
    }
  },

  // `modules:` is undocumented and is what puts the address book in the same worklet as the
  // wallet. Works on hrpc, silently dropped on jsonrpc (finding 14; see docs/flutter-poc.md).
  // `events` become moduleEvent, the one worklet -> host command; the host must subscribe
  // before the first one fires (rn-core#83).
  modules: {
    addressBook: {
      package: '@tetherto/wdk-p2p-address-book',
      factory: 'createWorkletModule',
      events: ['update']
    },

    // modules/pay-requests, installed as a `file:` dependency so it has a package name: a
    // relative path is validated one directory away from where it is required (finding 12).
    // No `events`: PayRequests calls the `emit` it is handed rather than being an EventEmitter.
    payRequests: {
      package: '@moor/pay-requests',
      factory: 'createModule'
    }
  },

  // Without this, callModule can invoke any method on the instance.
  allowedModuleMethods: {
    addressBook: {
      methods: [
        'getInfo',
        'create',
        'addContact',
        'editContact',
        'deleteContact',
        'getContact',
        'listContacts',
        'addAddress',
        'editAddress',
        'deleteAddress',
        'listAddresses',
        'search',
        'addMirror',
        'listMirrors'
      ]
    },
    payRequests: {
      methods: ['getIdentity', 'setPeers', 'request']
    }
  },

  output: {
    bundle: './.wdk-bundle/wdk-worklet.bundle.js'
  }
}
