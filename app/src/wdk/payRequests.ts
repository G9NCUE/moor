// Host-side view of app/modules/pay-requests. Everything crosses the worklet bridge as JSON,
// so the amount is a string on both sides.

/** `from` is the sender's peer key. */
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
  /** Resolves once the contact's device acknowledged, not once they agree. */
  request: (args: { to: string, amount: string, note?: string }) => Promise<{ ok: true, to: string }>
}

// Defined next to the QR codec so lab/t11 can check the two agree.
export { encodePeerKey, decodePeerKey } from './contactCard.mjs'
