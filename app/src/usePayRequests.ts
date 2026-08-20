import { useEffect, useRef, useState } from 'react'
import { useModule } from '@tetherto/wdk-react-native-core'
import type { AddressBookApi } from '@tetherto/wdk-p2p-address-book'

import { decodePeerKey, type PayRequest, type PayRequestsApi } from './wdk/payRequests'

/**
 * Wires the `payRequests` worklet module to the address book.
 *
 * The module holds an allowlist and refuses every connection outside it, before the Noise
 * handshake completes. This hook is what fills that list: the peer keys of people you have
 * saved. Nobody else can reach you — not blocked, unroutable.
 */
export function usePayRequests (ready: boolean) {
  const payRequests = useModule<PayRequestsApi>('payRequests')
  const addressBook = useModule<AddressBookApi>('addressBook')

  const [identity, setIdentity] = useState<string | null>(null)
  const [inbox, setInbox] = useState<PayRequest[]>([])
  /**
   * peer key -> the contact behind it, so a request says "Alice" rather than 64 hex
   * characters, and so paying one needs no typing: the address is already saved.
   */
  const [peers, setPeers] = useState<Record<string, { name: string, address: string | null }>>({})
  const started = useRef(false)

  // Subscribe FIRST, before anything can emit. rn-core registers no host-side handler for
  // moduleEvent until app code asks for one, and an event arriving before that takes the
  // whole app down (rn-core#83). `error` is the one the runtime emits by itself.
  useEffect(() => payRequests.on('request', (payload) => {
    setInbox((prev) => [payload as PayRequest, ...prev].slice(0, 50))
  }), [])
  useEffect(() => payRequests.on('error', () => {}), [])

  // Rebuild the allowlist from the address book. Runs on every book update, so adding a
  // contact on this phone — or on another one, through the mirror — opens the door here.
  const syncPeers = async () => {
    const contacts = await addressBook.listContacts()
    const byKey: Record<string, { name: string, address: string | null }> = {}
    for (const c of contacts) {
      const key = decodePeerKey(c.username)
      if (key === null) continue
      const addresses = await addressBook.listAddresses(c.id)
      byKey[key] = {
        name: c.name,
        address: addresses.find((a) => a.network === 'arbitrum')?.address ?? null
      }
    }
    await payRequests.setPeers(Object.keys(byKey))
    setPeers(byKey)
  }

  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    ;(async () => {
      try {
        // The first call is what opens the DHT — construction deliberately doesn't, so app
        // startup isn't held up by a network round trip. Several seconds is normal.
        const { publicKey } = await payRequests.getIdentity()
        setIdentity(publicKey)
        await syncPeers()
      } catch {
        started.current = false // no network yet; the next book update retries
      }
    })()
  }, [ready])

  useEffect(() => {
    if (!ready) return
    return addressBook.on('update', () => { void syncPeers().catch(() => {}) })
  }, [ready])

  return {
    identity,
    inbox,
    peerCount: Object.keys(peers).length,
    nameFor: (key: string) => peers[key]?.name ?? null,
    /** The Arbitrum address saved for whoever sent a request — what "Pay" needs. */
    addressFor: (key: string) => peers[key]?.address ?? null,
    dismiss: (request: PayRequest) => setInbox((prev) => prev.filter((r) => r !== request)),
    send: payRequests.request
  }
}
