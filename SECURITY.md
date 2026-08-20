# Security

## What Moor is

A learning project and a reference implementation. It holds real money on Arbitrum One and
it has not been audited by anyone. Treat it as something to read and run, not as a wallet
to keep savings in.

The code is small on purpose, so that "read it yourself" is a realistic answer rather than a
deflection. [`ARCHITECTURE.md`](ARCHITECTURE.md) explains the design;
[`SPEC.md §2`](SPEC.md) lists every claim we tested and the nineteen places the upstream
documentation turned out to be wrong.

## Reporting something

Open an issue, or email the address on the repository owner's GitHub profile if you would
rather not do it in public. There is no bounty and no SLA. This is one person's project.

If it affects a dependency rather than Moor — WDK, Holepunch, the bundler, the paymaster —
say so, and we will help route it. [`upstream/`](upstream/) records what we have already
filed and where it stands.

## What is actually at risk

**Your recovery phrase is the whole thing.** Money, contacts and reachability are all
derived from it. There is no account to recover, nobody to appeal to, and no reset. Anyone
who reads those twelve words owns everything.

**The delegation contract can act as your account.** Gasless sends work by EIP-7702: the
account delegates execution to a contract at a fixed address. Whatever sits there gets to
act as you. WDK ships no value for it and tells integrators to verify it independently
against no registry, so we verified it ourselves — identical runtime bytecode on Arbitrum,
Ethereum and Polygon. Re-run [`lab/t5`](lab/t5-delegation.js) before trusting it. Verifying
the address is not the same as auditing the contract, and we have not done the latter.

**The paymaster and bundler see your transactions.** They cannot touch your keys or your
contacts, and they cannot move money you did not authorise. They can decline to serve you.
That is why `MOOR_SELF_GAS=1` exists: refuse Moor a paymaster and it still spends, in ETH.

**The blind peer sees encrypted blocks.** It stores sealed data it has no key to, and holds
nothing you do not already have on your own device. It can go away; you lose sync to a
powered-off device and nothing else. It is a config value, so you can point at your own.

## Where the twelve words come from

Traced after the Coldcard disclosure of August 2026, in which a build misconfiguration made
firmware fall back from a hardware RNG to a weak software one, cutting an intended 128 bits
of seed entropy to around 40 and costing $116M. That is a *build* bug, not an algorithm bug,
which makes it worth checking rather than assuming.

The chain, on this machine, in this build:

| Step | What runs |
|---|---|
| `useWalletManager().generateMnemonic(12)` | crosses the bridge into the worklet — no entropy is produced in React Native |
| `generateEntropy(12)` | `crypto.randomBytes(16)` — **16 bytes, the full 128 bits** |
| `bare-crypto` `randomBytes` → `randomFill` | `binding.randomFill`, a native addon |
| native | BoringSSL `RAND_bytes`, i.e. `bssl::BCM_rand_bytes` |
| then | `@scure/bip39` `entropyToMnemonic` over the 16 bytes |

Four things were checked rather than assumed, because each is how the Coldcard bug happened:

1. **No fallback exists.** `bare-crypto` has no JavaScript path to fall back *to*: `randomFill`
   goes straight to the addon, and if the addon were missing `require.addon()` throws. The
   native side is `assert(RAND_bytes(...) == 1)` — it aborts rather than degrades. There is no
   branch that could pick the weaker option.
2. **The right module is linked.** `bare-crypto.1.15.3.framework` ships inside the built
   `.app`, and `RAND_bytes` is *defined* there (statically linked BoringSSL), not imported
   from somewhere that could be stubbed. The `web.js` variant is present in the bundle but has
   zero call sites, and delegates to the same binding anyway.
3. **The RNG cannot be replaced at runtime.** BoringSSL keeps `RAND_set_rand_method`,
   `RAND_seed` and `RAND_add` only as OpenSSL-compatibility no-ops — in the shipped binary they
   are 24- to 64-byte stubs. Substituting a deterministic generator, which is the shape of the
   Coldcard failure, is not reachable.
4. **No weak RNG on any key path.** The 7.2 MB worklet bundle contains 42 `Math.random()`
   calls. Every one is retry-backoff jitter, DHT peer shuffling, block selection, port choice
   or a request ID. None touches entropy, a seed, a key or a nonce. The one `Math.random()`
   string generator in there is dead code with no callers.

**What this does not cover.** We have not audited BoringSSL, and we have not observed the RNG
at runtime on a physical iPhone — this traced the code path and the linked binary of a
simulator build. Nothing here is a substitute for an audit.

**The closest thing to this bug class in Moor is not an RNG at all.** It is
`EXPO_PUBLIC_DEV_SEED` below: a fixed phrase, chosen by configuration, exactly the "wrong
source selected at build time" shape. What stops it is that it is `__DEV__`-only, verified
absent from a production export, and announced in a banner on every screen when it is live.

## The dev seed

`EXPO_PUBLIC_DEV_SEED` unlocks a fixed recovery phrase so two simulators can be driven onto
one seed without a human tapping through both. **Throwaway phrases only.**

We checked what happens to it rather than assuming: it does **not** reach a release build.
`__DEV__` is false in production and the branch is eliminated before the value is inlined —
a real production export contains neither the phrase nor the variable's name. What remains
true is that it lives in plaintext on disk, in your shell history if you set it inline, in
`ps`, and inside the dev bundle. Any one of those is enough to lose whatever it holds.

A build running on a dev seed says so, in a banner, on every screen. That is deliberate: the
realistic way to lose money here is not a subtle exploit, it is demoing or screen sharing a
wallet you had forgotten was unlocked from a file.

`lab/t10-send.js` generates its own throwaway phrase into `lab/.send-seed` (gitignored) and
stops to ask you to fund it. Fund it with a couple of dollars, not more.

## What we do not claim

Moor removes the middlemen it can remove. It does not remove the issuer: USD₮ is issued by a
company that operates a blocklist and has frozen balances before. Holding your own keys
means no company can move your money or close your account. It does not mean a centrally
issued stablecoin has stopped being centrally issued.
