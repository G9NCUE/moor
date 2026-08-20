import { useEffect, useRef, useState } from 'react'
import {
  Pressable, ScrollView, StyleSheet, Text, View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import { Menu as MenuIcon } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useWdkApp, useAddresses, useBalance } from '@tetherto/wdk-react-native-core'

import { USDT0, ETH, formatUnits } from '../wdk/assets'
import { SELF_GAS } from '../wdk/config'
import type { usePayRequests } from '../usePayRequests'
import type { SendPrefill } from './Send'
import { useDark } from '../useTheme'
import { theme, sheet, FONT, TABULAR, PRESSED, QR_LIGHT, QR_DARK } from '../theme'

export function Wallet ({ onOpenMenu, onSend, pay }: {
  onOpenMenu: () => void
  onSend: (prefill?: SendPrefill) => void
  pay: ReturnType<typeof usePayRequests>
}) {
  const { state } = useWdkApp()
  const { data: addresses, loadAddresses } = useAddresses()

  const [copied, setCopied] = useState(false)
  // A receive screen's job is the QR. Showing it by default is one less tap on the
  // path people actually take.
  const [showQr, setShowQr] = useState(true)

  const didInit = useRef(false)
  const ready = state.status === 'READY'

  useEffect(() => {
    if (!ready || didInit.current) return
    didInit.current = true
    ;(async () => {
      await loadAddresses([0], ['arbitrum']).catch(() => [])
    })()
  }, [ready])

  const address = addresses?.find((a) => a.network === 'arbitrum' && a.accountIndex === 0)?.address

  /**
   * `staleTime: 0` is load-bearing on a fresh install.
   *
   * useBalance seeds the query with `{ success: true, balance: null }` from the persisted
   * store, and a wallet that has never fetched has nothing persisted. TanStack treats
   * seeded data as fresh, so under the default 30s staleTime the first fetch never fires
   * and the screen shows an em dash forever — indistinguishable from a balance of nothing.
   * It only looks correct on later runs, once MMKV holds a real number.
   *
   * No polling interval. Polling a public RPC every 30s from inside the worklet turned out
   * to fail often enough — ECONNRESET, connection reset by peer — that the screen filled
   * with console errors, which in a wallet reads as something being wrong with your money.
   * The balance is fetched on mount and refetched after a send, and that is enough.
   */
  const balanceOptions = { enabled: ready && Boolean(address), staleTime: 0 }
  const usdt = useBalance(0, USDT0, balanceOptions)
  const eth = useBalance(0, ETH, balanceOptions)

  const hasEth = Boolean(eth.data?.balance && eth.data.balance !== '0')
  const hasUsdt = Boolean(usdt.data?.balance && usdt.data.balance !== '0')

  const dark = useDark()
  const t = theme(dark)
  const s = styles(dark)

  const copy = async () => {
    if (!address) return
    await Clipboard.setStringAsync(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.header}>
          <Pressable
            onPress={onOpenMenu}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Menu"
            style={({ pressed }) => [s.menuHit, pressed && PRESSED]}
          >
            <MenuIcon size={24} color={t.fg} strokeWidth={2} />
          </Pressable>
        </View>

        {/* ── Incoming requests ───────────────────────────────────────
            Above the balance on purpose. A request is someone asking you for money right
            now; it is the only thing on this screen that arrived without you doing
            anything, and burying it under a scroll would make the feature pointless. */}
        {pay.inbox.map((req, i) => {
          const who = pay.nameFor(req.from) ?? `${req.from.slice(0, 8)}…`
          const address = pay.addressFor(req.from)
          return (
            <View key={`${req.from}-${req.at}-${i}`} style={s.request}>
              <Text style={s.requestWho}>{who} asks for</Text>
              <Text style={s.requestAmount}>{req.amount} USD₮</Text>
              {req.note ? <Text style={s.requestNote}>“{req.note}”</Text> : null}
              <View style={s.row}>
                <Pressable
                  style={({ pressed }) => [s.btn, !address && s.btnDisabled, pressed && PRESSED]}
                  disabled={!address}
                  onPress={() => {
                    onSend({ address: address ?? undefined, name: who, amount: req.amount })
                    pay.dismiss(req)
                  }}
                >
                  <Text style={s.btnText}>Pay</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.btnGhost, pressed && PRESSED]}
                  onPress={() => pay.dismiss(req)}
                >
                  <Text style={s.btnGhostText}>Dismiss</Text>
                </Pressable>
              </View>
              {/* A request carries a peer key, not an address. Without one saved there is
                  nowhere to send the money, and asking the user to paste one here would
                  reintroduce exactly the mistake contacts exist to prevent. */}
              {address
                ? null
                : <Text style={s.note}>No Arbitrum address saved for {who} — add one in Contacts to pay them.</Text>}
            </View>
          )
        })}

        {/* ── Balance ─────────────────────────────────────────────── */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>USD₮0 · Arbitrum</Text>
          <Text style={s.heroValue}>
            {usdt.isLoading && !usdt.data ? '…' : formatUnits(usdt.data?.balance, 6)}
          </Text>
          {/*
            Arbitrum One pays gas in ETH — cheap, but mandatory. A plain account with
            no ETH cannot move USD₮0 at all, so this warning is real for THIS build.
            It is not a property of Arbitrum: WDK's gasless path (EIP-7702 / EIP-3009)
            deducts the fee from the token itself via a paymaster, and a send then
            needs no ETH ever. Adopt that in Phase 2 and this line must be deleted —
            leaving it would be a lie in the other direction.

            Only warn when it bites: holding USD₮ you can't move. On an empty wallet
            it's noise.
          */}
          {SELF_GAS
            ? (hasEth
                ? <Text style={s.heroSub}>{formatUnits(eth.data?.balance, 18, 5)} ETH for gas</Text>
                : hasUsdt
                  ? <Text style={s.warn}>No ETH — you can't send until this account has some</Text>
                  : null)
            : null}

          {/* Never silently show a dash. A balance that can't be read is a different
              state from a balance of zero, and conflating them is how wallets end up
              lying to people about their money. */}
          {usdt.error || usdt.data?.success === false
            ? (
              <Text style={s.err}>
                balance unavailable — {usdt.error?.message ?? 'fetch failed'}
              </Text>
              )
            : null}
        </View>

        <Pressable
          style={({ pressed }) => [s.send, !hasUsdt && s.btnDisabled, pressed && PRESSED]}
          onPress={() => onSend()}
          disabled={!hasUsdt}
        >
          <Text style={s.sendText}>Send</Text>
        </Pressable>

        {/* ── Receive ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Receive</Text>

          {showQr && address
            ? (
              <View style={s.qrWrap}>
                <View style={s.qrPad}>
                  <QRCode value={address} size={196} backgroundColor={QR_LIGHT} color={QR_DARK} />
                </View>
              </View>
              )
            : null}

          <Text style={s.address} selectable>{address ?? 'deriving…'}</Text>

          <View style={s.row}>
            <Pressable
              style={({ pressed }) => [s.btn, pressed && PRESSED]}
              onPress={copy}
              disabled={!address}
            >
              <Text style={s.btnText}>{copied ? 'Copied' : 'Copy address'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.btnGhost, pressed && PRESSED]}
              onPress={() => setShowQr((v) => !v)}
              disabled={!address}
            >
              <Text style={s.btnGhostText}>{showQr ? 'Hide QR' : 'Show QR'}</Text>
            </Pressable>
          </View>

          <Text style={s.note}>
            Only send USD₮0 on Arbitrum to this address.
          </Text>
        </View>

        {/* Contacts and your peer key moved to the Menu. This screen opens on your money,
            and navigation below the balance was the reason it didn't. */}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    safe: { flex: 1, backgroundColor: t.bg },
    body: { padding: 20, gap: 14 },
    header: { flexDirection: 'row', justifyContent: 'flex-end' },
    menuHit: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },

    hero: {
      paddingVertical: 28, paddingHorizontal: 20, borderRadius: 18,
      backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      alignItems: 'center', gap: 4
    },
    heroLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.dim },
    // Tabular: the balance is the number most likely to change while somebody is
    // looking straight at it.
    heroValue: { fontSize: 46, fontWeight: '700', color: t.fg, letterSpacing: -1, ...TABULAR },
    heroSub: { fontSize: 13, color: t.dim },
    err: { fontSize: 12, color: t.danger, textAlign: 'center', marginTop: 6 },
    warn: { fontSize: 13, color: t.warning, textAlign: 'center' },

    card: {
      padding: 18, borderRadius: 14, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 10
    },
    cardLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.dim },

    request: {
      padding: 18, borderRadius: 14, backgroundColor: t.card,
      borderWidth: 1, borderColor: t.accent, gap: 2
    },
    requestWho: { fontSize: 13, color: t.dim },
    requestAmount: { fontSize: 28, fontWeight: '700', color: t.fg, letterSpacing: -0.5, ...TABULAR },
    requestNote: { fontSize: 14, color: t.fg },

    qrWrap: { alignItems: 'center', paddingVertical: 6 },
    qrPad: { padding: 14, backgroundColor: QR_LIGHT, borderRadius: 14 },

    address: { fontSize: 13, fontFamily: FONT.mono, color: t.fg, lineHeight: 20 },

    row: { flexDirection: 'row', gap: 10 },
    btn: {
      flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: t.accent,
      alignItems: 'center'
    },
    btnText: { color: t.onAccent, fontWeight: '600', fontSize: 14 },
    btnDisabled: { opacity: 0.5 },
    send: { paddingVertical: 15, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center' },
    sendText: { color: t.onAccent, fontWeight: '700', fontSize: 16 },
    btnGhost: {
      flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line
    },
    btnGhostText: { color: t.fg, fontWeight: '600', fontSize: 14 },

    note: { fontSize: 12, color: t.dim, lineHeight: 17 },
  }))
}
