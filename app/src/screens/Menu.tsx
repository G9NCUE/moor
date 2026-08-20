import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, QrCode, Users } from 'lucide-react-native'

import { BackLink } from '../BackLink'
import { BLIND_PEERS, SELF_GAS, WALLET_ID } from '../wdk/config'
import type { usePayRequests } from '../usePayRequests'
import { THEME_MODES, useThemeMode } from '../useTheme'
import { theme, sheet, FONT, PRESSED } from '../theme'

/**
 * Everything that isn't your money.
 *
 * The wallet screen had grown a Contacts card and a payment-requests card below the balance,
 * which meant the first thing you saw on opening a wallet was navigation. This is where that
 * went. It doubles as settings, because with this much configuration a second level of
 * nesting would be more structure than there is content.
 */
export function Menu ({ pay, onBack, onOpenContacts, onOpenExchange }: {
  pay: ReturnType<typeof usePayRequests>
  onBack: () => void
  onOpenContacts: () => void
  onOpenExchange: () => void
}) {
  const { mode, dark, setMode } = useThemeMode()
  const t = theme(dark)
  const s = styles(dark)

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.header}>
          <BackLink label="Wallet" onPress={onBack} dark={dark} />
          <Text style={s.title}>Menu</Text>
        </View>

        <View style={s.group}>
          <Destination
            icon={<Users size={20} color={t.fg} strokeWidth={2} />}
            label="Contacts"
            detail={pay.peerCount === 0 ? 'Nobody can reach you yet' : `${pay.peerCount} can reach you`}
            onPress={onOpenContacts}
            dark={dark}
          />
          <View style={s.divider} />
          <Destination
            icon={<QrCode size={20} color={t.fg} strokeWidth={2} />}
            label="Exchange codes"
            detail="Add someone by scanning"
            onPress={onOpenExchange}
            dark={dark}
          />
        </View>

        <Text style={s.groupLabel}>Appearance</Text>
        <View style={s.card}>
          <View style={s.segment}>
            {THEME_MODES.map((option) => (
              <Pressable
                key={option}
                onPress={() => setMode(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: option === mode }}
                style={({ pressed }) => [
                  s.segmentItem, option === mode && s.segmentItemOn, pressed && PRESSED
                ]}
              >
                <Text style={[s.segmentText, option === mode && s.segmentTextOn]}>
                  {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.fieldLabel}>
            {mode === 'system'
              ? 'Following your phone. Change it here to override.'
              : 'Overriding your phone’s setting.'}
          </Text>
        </View>

        {/* ── This wallet ──────────────────────────────────────────
            Read-only on purpose. Every one of these is an environment variable at build
            time, and a screen that looked editable would be lying about that. */}
        <Text style={s.groupLabel}>This wallet</Text>
        <View style={s.card}>
          <Field label="Your peer key" mono dark={dark}
            value={pay.identity ?? 'announcing on the network…'} />
          <Field label="Network" dark={dark} value="Arbitrum One · USD₮0" />
          <Field label="Fees" dark={dark}
            value={SELF_GAS ? 'Paid in ETH (self-gas build)' : 'Paid in USD₮'} />
          <Field label="Mirror" mono dark={dark}
            value={BLIND_PEERS.length === 0 ? 'none — this device does not sync' : BLIND_PEERS.join('\n')} />
          <Field label="Wallet id" mono dark={dark} value={WALLET_ID} />
        </View>

        <Text style={s.footer}>
          Your contacts, your peer key and your money all come from the same twelve words.
          There is no account, and nothing here is stored on a server.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function Destination ({ icon, label, detail, onPress, dark }: {
  icon: React.ReactNode
  label: string
  detail: string
  onPress: () => void
  dark: boolean
}) {
  const t = theme(dark)
  const s = styles(dark)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.destination, pressed && PRESSED]}
    >
      {icon}
      <View style={s.destinationText}>
        <Text style={s.destinationLabel}>{label}</Text>
        <Text style={s.destinationDetail}>{detail}</Text>
      </View>
      <ChevronRight size={20} color={t.dim} strokeWidth={2} />
    </Pressable>
  )
}

function Field ({ label, value, mono, dark }: {
  label: string
  value: string
  mono?: boolean
  dark: boolean
}) {
  const s = styles(dark)
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={[s.fieldValue, mono && s.mono]} selectable>{value}</Text>
    </View>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    safe: { flex: 1, backgroundColor: t.bg },
    body: { padding: 20, gap: 12 },
    header: { gap: 6, marginBottom: 4 },
    title: { fontSize: 30, fontWeight: '700', color: t.fg, letterSpacing: -0.5 },

    group: {
      borderRadius: 14, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, overflow: 'hidden'
    },
    groupLabel: {
      fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.dim,
      marginTop: 12, marginLeft: 2
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 52 },

    destination: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, paddingHorizontal: 16, minHeight: 60
    },
    destinationText: { flex: 1, gap: 2 },
    destinationLabel: { fontSize: 16, fontWeight: '600', color: t.fg },
    destinationDetail: { fontSize: 12, color: t.dim },

    card: {
      padding: 16, borderRadius: 14, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 14
    },
    segment: {
      flexDirection: 'row', gap: 4, padding: 4, borderRadius: 10, backgroundColor: t.bg,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line
    },
    segmentItem: {
      flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', minHeight: 40,
      justifyContent: 'center'
    },
    segmentItemOn: { backgroundColor: t.accent },
    segmentText: { fontSize: 14, fontWeight: '600', color: t.fg },
    segmentTextOn: { color: t.onAccent },

    field: { gap: 3 },
    fieldLabel: { fontSize: 11, color: t.dim },
    fieldValue: { fontSize: 14, color: t.fg, lineHeight: 20 },
    mono: { fontFamily: FONT.mono, fontSize: 12 },

    footer: { fontSize: 12, color: t.dim, textAlign: 'center', lineHeight: 18, marginTop: 10 }
  }))
}
