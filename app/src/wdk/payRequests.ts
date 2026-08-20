/**
 * Host-side view of the `payRequests` worklet module (`app/modules/pay-requests/index.js`).
 *
 * Every call crosses the worklet bridge, so everything is async and everything is JSON —
 * which is why the amount is a string on both sides.
 */

/** A request that arrived from a contact. `from` is the sender's peer key. */
export interface PayRequest {
  from: string
  amount: string
  note: string
  at: number
}

export interface PayRequestsApi {
  /** Opens the DHT on first call. Returns this wallet's peer key, for the QR. */
  getIdentity: () => Promise<{ publicKey: string }>
  /** Replace the allowlist. Anyone not in it cannot connect at all. */
  setPeers: (peers: string[]) => Promise<{ count: number }>
  /** Ask one contact for money. Resolves once it's on their wire, not once they agree. */
  request: (args: { to: string, amount: string, note?: string }) => Promise<{ ok: true, to: string }>
}

/**
 * The peer key stored on a contact, as `moor:<hex>` in `Contact.username`.
 *
 * Re-exported rather than defined here: it lives next to the QR card codec in
 * `contactCard.mjs`, because a scan and an address-book row are the same identity written
 * down twice, and `lab/t11` imports the pair to check they agree.
 */
export { encodePeerKey, decodePeerKey } from './contactCard.mjs'
