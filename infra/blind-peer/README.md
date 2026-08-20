# The Moor blind peer

**What to expect from it: nothing.** This is demo infrastructure. Best-effort, no SLA, and it
may be wiped without notice. Better to say that plainly than to let anyone plan around it.

## What a blind peer is

An always-on machine that holds encrypted blocks for other people, so a second device can
catch up while the first one is switched off.

It has **no key to anything it stores**. It sees ciphertext, sizes and timing — never a
contact, never an address. Like a left-luggage office: it takes sealed boxes, keeps them
available, and hands them back, and it cannot open any of them.

**If it dies, nobody loses data.** Your address book lives on your devices. What you lose is
the ability to sync to a device that is currently powered off.

## Why we run one

A mirror only works if clients know its key, and `blind-peering`'s docs are direct about it:
*"You should always set this, otherwise there are no mirrors to contact."* Holepunch runs
peers for Keet, using Keet's keys.

So an app that wants multi-device sync runs its own. It costs a few dollars a month. Without
one you could clone this repo and the interesting half would not work, so here is ours.

## The one we run

```
a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o
```

Live since 2026-08-11. Already the default in `app/.env.example`, and usable by any app on
`blind-peering` or `wdk-p2p-address-book` — not just Moor.

It runs as a dedicated `moor` system user: no sudo, no login shell, zero capabilities,
`ProtectHome=yes`. A process that accepts data from strangers gets its own uid and nothing
else.

## Run your own

```bash
cd infra/blind-peer
npm install
npm start
```

It prints a public key. That key is stable across restarts, the same for every user, and the
only thing a client needs:

```bash
# app/.env.local
EXPO_PUBLIC_BLIND_PEERS=<key>
```

The keypair lives in the storage directory. **Back that directory up** — losing it means a
new identity and every client reconfigured.

### Configuration

| Env var | Default | Notes |
|---|---|---|
| `MOOR_BLIND_PEER_STORAGE` | `./storage` | Holds the keypair. Back it up |
| `MOOR_BLIND_PEER_MAX_BYTES` | `1000000000` (1 GB) | Two orders of magnitude below the library's 100 GB default |
| `MOOR_BLIND_PEER_PORT` | `0` (ephemeral) | Pin it if your firewall needs a fixed port |

An open mirror is free storage for strangers: anyone who learns the key can ask it to hold
arbitrary cores. Address books are kilobytes, so the cap is deliberately brutal and garbage
collection is on. `blind-peer` also supports `trustedPubKeys` for a closed deployment, and IP
ban lists if you are being abused.

## Deploying

Any always-on box with outbound internet. It needs no inbound port forwarding — it announces
itself on the DHT and hole-punches — though a stable host beats a laptop.

```
[Unit]
Description=Moor blind peer
After=network-online.target

[Service]
WorkingDirectory=/opt/moor/infra/blind-peer
ExecStart=/usr/bin/node run.js
Environment=MOOR_BLIND_PEER_STORAGE=/var/lib/moor-blind-peer
Restart=always
RestartSec=5
User=moor

[Install]
WantedBy=multi-user.target
```

## Replacing us

The client takes a **pool**, not a single key. `AddressBook.selectMirrors()` ranks it by
rendezvous hashing, so clients spread out deterministically and churn little when the pool
changes. Add your key to `EXPO_PUBLIC_BLIND_PEERS`, or replace ours entirely. Nothing in Moor
assumes our machine exists.

## Checking it works

`lab/t6` runs a full two-device restore over the **public DHT** against a running peer:

```bash
cd infra/blind-peer && npm start                      # terminal 1, note the key
MOOR_BLIND_PEER=<key> npm run t6 --prefix ../../lab   # terminal 2
```

Measured on 2026-08-11: **2.1–2.6s** for a second device to restore an address book from
twelve words alone. An earlier figure of 14–17s came from a local single-node rig and was
[retracted](https://github.com/tetherto/wdk-p2p-address-book/issues/8).
