import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useModule } from '@tetherto/wdk-react-native-core'
import type { AddressBookApi, Contact, Address } from '@tetherto/wdk-p2p-address-book'

import { decodePeerKey } from '../wdk/contactCard.mjs'
import { BackLink } from '../BackLink'
import { useDark } from '../useTheme'
import { theme, sheet, FONT, PRESSED } from '../theme'

type Row = Contact & { addresses: Address[] }

/**
 * The contact list, stored in an Autobase inside the worklet and mirrored through a blind
 * peer that cannot read it. Every write here lands on your other devices without a server
 * ever seeing a name.
 *
 * Why it matters beyond convenience: pasted addresses are how people lose money — typos,
 * and clipboard-swapping malware. Choosing a name you saved earlier removes the category.
 */
export function Contacts ({ onBack, onExchange }: {
  onBack: () => void
  onExchange: () => void
}) {
  const addressBook = useModule<AddressBookApi>('addressBook')

  const [rows, setRows] = useState<Row[] | null>(null)
  const [name, setName] = useState('')
  const [addr, setAddr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const contacts = await addressBook.listContacts()
      const withAddrs = await Promise.all(
        contacts.map(async (c) => ({ ...c, addresses: await addressBook.listAddresses(c.id) }))
      )
      setRows(withAddrs.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // The book emits `update` on every applied write — including writes that arrived from
  // another device. This is what makes the list live rather than a snapshot.
  useEffect(() => addressBook.on('update', () => { void load() }), [load])

  const add = async () => {
    const trimmedName = name.trim()
    const trimmedAddr = addr.trim()
    if (!trimmedName) { setError('A contact needs a name.'); return }
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmedAddr)) {
      setError('That doesn\'t look like an Arbitrum address (0x + 40 hex characters).')
      return
    }
    setBusy(true); setError(null)
    try {
      const contact = await addressBook.addContact({ name: trimmedName })
      await addressBook.addAddress(contact.id, {
        address: trimmedAddr,
        type: 'evm',
        network: 'arbitrum',
        label: 'USD₮0'
      })
      setName(''); setAddr('')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = (row: Row) => {
    Alert.alert(`Delete ${row.name}?`, 'This removes them from every device you own.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try { await addressBook.deleteContact(row.id); await load() } catch (e) { setError((e as Error).message) }
          })()
        }
      }
    ])
  }

  const dark = useDark()
  const t = theme(dark)
  const s = styles(dark)

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <BackLink label="Wallet" onPress={onBack} dark={dark} />
          <Text style={s.title}>Contacts</Text>
        </View>

        {/* Scanning first, and not only because it is faster to tap. A typed address gets
            you somewhere to send money; a scanned code also carries their peer key, which
            is the half that lets them ask you. */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Add someone</Text>
          <Pressable style={({ pressed }) => [s.btn, pressed && PRESSED]} onPress={onExchange}>
            <Text style={s.btnText}>Scan their code</Text>
          </Pressable>
          <Text style={s.muted}>
            Both of you scan, and you can pay each other and ask each other for money.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>Or type an address</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={(text) => { setName(text); setError(null) }}
            placeholder="Name"
            placeholderTextColor={t.dim}
            autoCapitalize="words"
          />
          <TextInput
            style={[s.input, s.mono]}
            value={addr}
            onChangeText={(text) => { setAddr(text); setError(null) }}
            placeholder="0x… their Arbitrum address"
            placeholderTextColor={t.dim}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={({ pressed }) => [s.btn, busy && s.btnDisabled, pressed && PRESSED]}
            onPress={add}
            disabled={busy}
          >
            <Text style={s.btnText}>{busy ? 'Saving…' : 'Save contact'}</Text>
          </Pressable>
          <Text style={s.muted}>
            You can pay someone added this way, but they cannot reach you — that needs their
            code.
          </Text>
          {error && <Text style={s.err}>{error}</Text>}
        </View>

        {rows === null
          ? <Text style={s.muted}>Loading…</Text>
          : rows.length === 0
            ? (
              <View style={s.card}>
                <Text style={s.muted}>
                  No contacts yet. Anyone you add here appears on your other devices
                  automatically — no account, no server, no sync button.
                </Text>
              </View>
              )
            : rows.map((row) => (
              <View key={row.id} style={s.card}>
                <View style={s.rowTop}>
                  <Text style={s.name}>{row.name}</Text>
                  <Pressable
                    onPress={() => remove(row)}
                    hitSlop={10}
                    style={({ pressed }) => pressed ? PRESSED : undefined}
                  >
                    <Text style={s.delete}>Delete</Text>
                  </Pressable>
                </View>
                {row.addresses.map((a) => (
                  <Text key={a.id} style={s.addr} numberOfLines={1} ellipsizeMode="middle">
                    {a.address}
                  </Text>
                ))}
                {/* The allowlist is built from exactly this, so saying it here is the only
                    way to see why somebody's request never arrived. */}
                <Text style={s.reach}>
                  {decodePeerKey(row.username)
                    ? 'Can ask you for money'
                    : 'No code scanned — they cannot reach you'}
                </Text>
              </View>
            ))}

        <Text style={s.footer}>
          Stored peer-to-peer and encrypted with your recovery phrase. The mirror that carries
          them between your devices cannot read a single name.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
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

    input: {
      padding: 12, borderRadius: 10, backgroundColor: t.bg,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      color: t.fg, fontSize: 15
    },
    mono: { fontFamily: FONT.mono, fontSize: 13 },

    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { fontSize: 17, fontWeight: '600', color: t.fg },
    delete: { fontSize: 13, color: t.danger, fontWeight: '600' },
    addr: { fontSize: 12, fontFamily: FONT.mono, color: t.dim },
    reach: { fontSize: 11, color: t.dim },

    btn: { paddingVertical: 13, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: t.onAccent, fontWeight: '600', fontSize: 14 },

    muted: { fontSize: 14, color: t.dim, lineHeight: 20 },
    err: { fontSize: 13, color: t.danger, lineHeight: 19 },
    footer: { fontSize: 12, color: t.dim, textAlign: 'center', lineHeight: 18, marginTop: 6 }
  }))
}
