/** @type {import('@tetherto/wdk-worklet-bundler').WdkBundleConfig} */

/**
 * Fee mode is chosen at BUNDLE time, not runtime, because it decides which wallet
 * package is compiled into the worklet. One network key either way, so the rest of the
 * app — assets, screens, address derivation — never has to know which mode it's in.
 *
 *   default            gasless. The user pays the network fee in USD₮ itself.
 *   MOOR_SELF_GAS=1    plain account. The user pays gas in ETH, like any EOA.
 *
 * Regenerate after changing:  MOOR_SELF_GAS=1 npx wdk-worklet-bundler generate
 *
 * Self-gas exists so the repo stays clonable and, more importantly, so the sovereignty
 * claim survives: if every paymaster on earth refuses you, you can still move your money
 * by paying for it yourself. A wallet whose only path to spending runs through one
 * company's API is not self-custodial in the way that matters.
 */
const SELF_GAS = process.env.MOOR_SELF_GAS === '1'

module.exports = {
  // One asset, one chain. Moor is a reference app — every extra network is a screen a
  // reader has to hold in their head.
  networks: {
    arbitrum: {
      package: SELF_GAS
        ? '@tetherto/wdk-wallet-evm'
        : '@tetherto/wdk-wallet-evm-7702-gasless'
    }
  },

  // The half no published example covers. `modules:` is undocumented, and this is what
  // puts Holepunch's address book inside the same Bare worklet as the wallet — one
  // thread, one seed, two stacks.
  //
  // Verified by lab/t4: on this ('hrpc') transport the generated worklet emits
  //   moduleManagers['addressBook'].createModule = ctx =>
  //     WdkP2pAddressBook.createWorkletModule(ctx)
  // On 'jsonrpc' the same block is silently dropped — tetherto/wdk-worklet-bundler#46.
  // That is why Moor is React Native.
  //
  // `events` are wired in the worklet as instance.on(ev, …) -> rpc.moduleEvent(), the ONE
  // command that flows worklet -> host. The host only registers a handler for it once app
  // code subscribes — see the subscription in Wallet.tsx, and rn-core#83.
  modules: {
    addressBook: {
      package: '@tetherto/wdk-p2p-address-book',
      factory: 'createWorkletModule',
      events: ['update']
    },

    // Our own code, in this repo at modules/pay-requests, installed as a local `file:`
    // dependency so it has a package name.
    //
    // It has to be a name rather than a path: the bundler validates a relative `package`
    // against the project root but emits it verbatim into a require() in
    // .wdk/wdk-worklet.generated.js — one directory deeper — so no relative path can
    // satisfy both. `file:` sidesteps the disagreement entirely.
    //
    // No `events` key: that list exists only so the runtime can auto-wire
    // instance.on(ev, …) -> emit(ev, …), and PayRequests isn't an EventEmitter — it calls
    // the `emit` it was handed at construction. Same moduleEvent on the wire either way.
    payRequests: {
      package: '@moor/pay-requests',
      factory: 'createModule'
    }
  },

  // Least privilege at the worklet boundary. Without this, callModule can invoke ANY
  // method on the module instance. Note this is a second, separate policy surface from
  // wdk-core's runtime policy engine — they don't know about each other.
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
