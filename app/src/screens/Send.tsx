import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAccount, useBalance, useModule } from '@tetherto/wdk-react-native-core'
import type { AddressBookApi } from '@tetherto/wdk-p2p-address-book'

import { USDT0, formatUnits, parseUnits } from '../wdk/assets'
import { SELF_GAS } from '../wdk/config'
import { CheckCircle2 } from 'lucide-react-native'

import { BackLink } from '../BackLink'
import { useDark } from '../useTheme'
import { theme, sheet, FONT, TABULAR, PRESSED } from '../theme'

export type SendPrefill = { address?: string, name?: string, amount?: string }

type Recipient = { name: string, address: string }
type Stage = 'form' | 'review' | 'sending' | 'sent'

/**
 * The spending screen.
 *
 * Two things here are not decoration. The amount never becomes a float — a JS number
 * cannot hold six decimals of a large balance without rounding, and rounding somebody's
 * transfer is not a display bug. And the fee is quoted before the confirm button appears,
 * because in token-paymaster mode the fee comes out of the same USD₮ being sent, so
 * "send everything" is a different number from the balance.
 */
export function Send ({ onBack, onSent, prefill }: {
  onBack: () => void
  onSent: () => void
  prefill?: SendPrefill
}) {
  const account = useAccount<Record<string, unknown>>({ accountIndex: 0, network: 'arbitrum' })
  const addressBook = useModule<AddressBookApi>('addressBook')

  // Same query key as the wallet screen, so refetching after a send updates both.
  const usdt = useBalance(0, USDT0)
  const balance = usdt.data?.balance ? BigInt(usdt.data.balance) : null

  const [contacts, setContacts] = useState<Recipient[]>([])
  const [to, setTo] = useState(prefill?.address ?? '')
  const [name, setName] = useState<string | null>(prefill?.name ?? null)
  const [amount, setAmount] = useState(prefill?.amount ?? '')

  const [stage, setStage] = useState<Stage>('form')
  const [fee, setFee] = useState<bigint | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = await addressBook.listContacts()
    const rows = await Promise.all(list.map(async (c) => {
      const addresses = await addressBook.listAddresses(c.id)
      const arb = addresses.find((a) => a.network === 'arbitrum')
      return arb ? { name: c.name, address: arb.address } : null
    }))
    setContacts(rows.filter((r): r is Recipient => r !== null))
  }, [])

  useEffect(() => { void load().catch(() => {}) }, [load])

  const units = parseUnits(amount, 6)
  const validAddress = /^0x[0-9a-fA-F]{40}$/.test(to.trim())
  const canReview = validAddress && units !== null && units > 0n

  const pick = (r: Recipient) => {
    setTo(r.address); setName(r.name); setError(null)
  }

  const review = async () => {
    if (!canReview) return
    setError(null); setFee(null); setStage('review')
    try {
      const quote = await account.estimateFee({ to: to.trim(), asset: USDT0, amount: String(units) })
      if (quote.success === false) throw new Error(quote.error ?? 'could not price this transfer')
      setFee(BigInt(quote.fee))
    } catch (e) {
      // A failed quote is not a reason to refuse the send. Stay on the review step with the
      // fee unknown and let the confirm button report what actually happens.
      setError(explain(e as Error))
    }
  }

  const confirm = async () => {
    if (units === null) return
    setStage('sending'); setError(null)
    try {
      const result = await account.send({ to: to.trim(), asset: USDT0, amount: String(units) })
      if (!result.success) throw new Error(result.error ?? 'the transfer was rejected')
      setHash(result.hash)
      setStage('sent')
      onSent()
      void usdt.refetch()
    } catch (e) {
      setError(explain(e as Error))
      setStage('review')
    }
  }

  // Token mode charges the fee in USD₮ on top of the amount, so both have to fit in the
  // one balance. Self-gas mode charges it in ETH, which is a different balance entirely —
  // summing the two would be adding wei to micro-dollars.
  const total = !SELF_GAS && units !== null && fee !== null ? units + fee : units
  const short = total !== null && balance !== null && total > balance

  const dark = useDark()
  const t = theme(dark)
  const s = styles(dark)

  if (stage === 'sent') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.done}>
          <CheckCircle2 size={48} color={t.gold} strokeWidth={1.75} />
          <Text style={s.doneAmount}>{amount} USD₮</Text>
          <Text style={s.doneTo}>sent to {name ?? shorten(to)}</Text>
          <Text style={s.hash} selectable>{hash}</Text>
          <Pressable style={({ pressed }) => [s.btn, pressed && PRESSED]} onPress={onBack}>
            <Text style={s.btnText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <BackLink label="Wallet" onPress={onBack} dark={dark} />
          <Text style={s.title}>Send</Text>
        </View>

        {stage === 'form'
          ? (
            <>
              <View style={s.card}>
                <Text style={s.cardLabel}>To</Text>
                {contacts.length > 0
                  ? (
                    <View style={s.chips}>
                      {contacts.map((c) => (
                        <Pressable
                          key={c.address}
                          style={({ pressed }) => [s.chip, c.address === to.trim() && s.chipOn, pressed && PRESSED]}
                          onPress={() => pick(c)}
                        >
                          <Text style={[s.chipText, c.address === to.trim() && s.chipTextOn]}>
                            {c.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    )
                  : null}
                <TextInput
                  style={[s.input, s.mono]}
                  value={to}
                  onChangeText={(text) => { setTo(text); setName(null); setError(null) }}
                  placeholder="0x… or tap a contact"
                  placeholderTextColor={t.dim}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={s.card}>
                <Text style={s.cardLabel}>Amount</Text>
                <View style={s.amountRow}>
                  <TextInput
                    style={s.amount}
                    value={amount}
                    onChangeText={(text) => { setAmount(text); setError(null) }}
                    placeholder="0.00"
                    placeholderTextColor={t.dim}
                    keyboardType="decimal-pad"
                  />
                  <Text style={s.ticker}>USD₮</Text>
                </View>
                <Text style={s.note}>
                  {balance === null ? ' ' : `${formatUnits(String(balance), 6)} available`}
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [s.btn, !canReview && s.btnDisabled, pressed && PRESSED]}
                onPress={review}
                disabled={!canReview}
              >
                <Text style={s.btnText}>Review</Text>
              </Pressable>
            </>
            )
          : (
            <View style={s.card}>
              <Text style={s.reviewAmount}>{amount} USD₮</Text>
              <Text style={s.reviewTo}>to {name ?? shorten(to)}</Text>
              <Text style={[s.addr, s.mono]} numberOfLines={1} ellipsizeMode="middle">{to.trim()}</Text>

              <View style={s.line} />

              <Row label="Amount" value={`${formatUnits(String(units), 6, 6)} USD₮`} dark={dark} />
              <Row
                label="Network fee"
                value={fee === null
                  ? (error ? 'unknown' : 'pricing…')
                  : SELF_GAS
                    ? `${formatUnits(String(fee), 18, 8)} ETH`
                    : `${formatUnits(String(fee), 6, 6)} USD₮`}
                dark={dark}
              />
              <Row
                label={SELF_GAS ? 'Leaves your balance' : 'Total'}
                value={total === null ? '—' : `${formatUnits(String(total), 6, 6)} USD₮`}
                dark={dark}
                strong
              />

              {SELF_GAS
                ? null
                : <Text style={s.note}>The fee is paid in USD₮. This account never needs ETH.</Text>}

              {short
                ? <Text style={s.err}>Not enough USD₮ to cover the amount and the fee.</Text>
                : null}
              {error ? <Text style={s.err}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [s.btn, (short || stage === 'sending') && s.btnDisabled, pressed && PRESSED]}
                onPress={confirm}
                disabled={short || stage === 'sending'}
              >
                {stage === 'sending'
                  ? <ActivityIndicator color={t.onAccent} />
                  : <Text style={s.btnText}>Send {amount} USD₮</Text>}
              </Pressable>
              {stage === 'sending'
                ? null
                : (
                  <Pressable
                    style={({ pressed }) => pressed ? PRESSED : undefined}
                    onPress={() => { setStage('form'); setError(null) }}
                  >
                    <Text style={s.cancel}>Back</Text>
                  </Pressable>
                  )}
            </View>
            )}

        {stage === 'form' && error ? <Text style={s.err}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function Row ({ label, value, dark, strong }: {
  label: string, value: string, dark: boolean, strong?: boolean
}) {
  const s = styles(dark)
  return (
    <View style={s.rowLine}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, strong && s.rowValueStrong]}>{value}</Text>
    </View>
  )
}

const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

/**
 * `AA20 account not deployed` is what a first send looks like from here.
 *
 * WDK prices a transfer before it signs the EIP-7702 authorization, so on an account that
 * has never spent, the bundler simulates an EOA with no code and rejects. The fix belongs
 * upstream — SPEC finding 16 — and the workaround (signTransaction then sendTransaction)
 * has to run inside the worklet, because a signed user operation cannot cross the bridge
 * intact: it is full of BigInts and the bridge turns those into strings.
 *
 * So the honest thing here is to say what happened rather than show a bundler stack trace.
 */
function explain (error: Error): string {
  const text = error.message ?? String(error)

  if (/AA20|not deployed/.test(text)) {
    return 'This account has never sent before, and the wallet library cannot price a first ' +
      'transfer (upstream bug, SPEC finding 16). Receiving works; sending needs the fix.'
  }

  // Sweeping is where people meet this: the paymaster reserves against the gas *ceiling*,
  // which is larger than the fee it ends up charging, so "send everything" leaves too
  // little even when the quoted fee would have fitted.
  if (/paymaster|pm_getPaymasterData|allowance/i.test(text)) {
    return 'Not enough USD₮ left over to pay the fee. The paymaster reserves a little more ' +
      'than the fee it actually charges, so try an amount a few cents lower.'
  }

  return text
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    safe: { flex: 1, backgroundColor: t.bg },
    body: { padding: 20, gap: 12 },
    header: { gap: 6, marginBottom: 4 },
    back: { fontSize: 15, color: t.accent, fontWeight: '600' },
    title: { fontSize: 30, fontWeight: '700', color: t.fg, letterSpacing: -0.5 },

    card: {
      padding: 16, borderRadius: 14, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 10
    },
    cardLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.dim },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: t.bg
    },
    chipOn: { backgroundColor: t.accent, borderColor: t.accent },
    chipText: { fontSize: 14, color: t.fg, fontWeight: '600' },
    chipTextOn: { color: t.onAccent },

    input: {
      padding: 12, borderRadius: 10, backgroundColor: t.bg,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      color: t.fg, fontSize: 15
    },
    mono: { fontFamily: FONT.mono, fontSize: 13 },

    amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    amount: {
      flex: 1, fontSize: 40, fontWeight: '700', color: t.fg, letterSpacing: -1,
      padding: 0, ...TABULAR
    },
    ticker: { fontSize: 18, fontWeight: '600', color: t.dim },

    // Gold, and only here. DESIGN.md allows it on the amount in a send confirmation and
    // nowhere else yet — an accent used everywhere is not an accent.
    reviewAmount: { fontSize: 34, fontWeight: '700', color: t.gold, letterSpacing: -1, ...TABULAR },
    reviewTo: { fontSize: 16, color: t.fg },
    addr: { color: t.dim },
    line: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginVertical: 4 },

    rowLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowLabel: { fontSize: 14, color: t.dim },
    rowValue: { fontSize: 14, color: t.fg, fontFamily: FONT.mono, ...TABULAR },
    rowValueStrong: { fontFamily: FONT.monoMedium, color: t.fg },

    btn: {
      paddingVertical: 14, borderRadius: 10, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center', minHeight: 48
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: t.onAccent, fontWeight: '600', fontSize: 15 },
    cancel: { textAlign: 'center', color: t.dim, fontSize: 14, paddingVertical: 6 },

    done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
    doneAmount: { fontSize: 32, fontWeight: '700', color: t.gold, letterSpacing: -1, ...TABULAR },
    doneTo: { fontSize: 16, color: t.dim },
    hash: { fontSize: 11, fontFamily: FONT.mono, color: t.dim, textAlign: 'center', marginBottom: 16 },

    note: { fontSize: 12, color: t.dim, lineHeight: 17 },
    err: { fontSize: 13, color: t.danger, lineHeight: 19 }
  }))
}
