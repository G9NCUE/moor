import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useAddresses, useModule } from '@tetherto/wdk-react-native-core'
import type { AddressBookApi, Address } from '@tetherto/wdk-p2p-address-book'

import {
  encodeCard, decodeCard, encodePeerKey, decodePeerKey
} from '../wdk/contactCard.mjs'
import type { usePayRequests } from '../usePayRequests'
import { BackLink } from '../BackLink'
import { useDark } from '../useTheme'
import {
  theme, sheet, FONT, PRESSED, QR_LIGHT, QR_DARK, CAMERA_BG, CAMERA_FG
} from '../theme'

type Scanned = { name: string | null, address: string | null, peerKey: string | null }

/**
 * Two people, standing together, becoming able to pay each other.
 *
 * The QR on the Wallet screen is a plain Arbitrum address, because any wallet should be able
 * to scan it. This one is a Moor card, and it carries the piece no other wallet's QR does:
 * the HyperDHT peer key. Saving it is what puts someone on the allowlist — before the scan
 * they cannot open a connection to you at all, and after it they can ask you for money.
 *
 * The exchange is deliberately two scans, one each way. A single scan could only ever
 * introduce one direction, and the alternative — a pairing window where you accept one
 * inbound stranger for thirty seconds — trades away the property the firewall exists for.
 * So the screen just makes the second scan obvious: save theirs, and it hands you straight
 * back to your own code with "now let them scan yours".
 */
export function Exchange ({ pay, onBack }: {
  pay: ReturnType<typeof usePayRequests>
  onBack: () => void
}) {
  const addressBook = useModule<AddressBookApi>('addressBook')
  const { data: addresses, loadAddresses } = useAddresses()
  const [permission, requestPermission] = useCameraPermissions()

  const [mode, setMode] = useState<'card' | 'scanning' | 'confirm'>('card')
  const [scanned, setScanned] = useState<Scanned | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // onBarcodeScanned fires on every frame that holds a readable code — dozens a second.
  // Without this the confirm sheet is rebuilt under the user's fingers while they type.
  const locked = useRef(false)

  const address = addresses?.find(
    (a) => a.network === 'arbitrum' && a.accountIndex === 0
  )?.address

  useEffect(() => {
    if (!address) void loadAddresses([0], ['arbitrum']).catch(() => [])
  }, [address])

  const myCard = address && pay.identity
    ? encodeCard({ address, peerKey: pay.identity })
    : null

  const startScanning = async () => {
    setError(null)
    setSaved(null)
    if (!permission?.granted) {
      const next = await requestPermission()
      if (!next.granted) {
        setError(
          next.canAskAgain
            ? 'Moor needs the camera to read a code.'
            : 'Camera access is off for Moor. Turn it on in Settings to scan a code.'
        )
        return
      }
    }
    locked.current = false
    setMode('scanning')
  }

  const onScan = ({ data }: { data: string }) => {
    if (locked.current) return
    const card = decodeCard(data) as Scanned | null

    if (card === null) {
      locked.current = true
      // The most likely wrong code by far is another wallet's receive QR. Naming it beats
      // "invalid code", which leaves people pointing the camera at the same thing again.
      setError(/^0x[0-9a-fA-F]{40}$/.test(data.trim())
        ? 'That is a plain address QR. It has nowhere to send a payment request — ask them ' +
          'to open Moor and show their code.'
        : 'That is not a Moor code.')
      setMode('card')
      return
    }

    if (card.peerKey && card.peerKey === pay.identity) {
      locked.current = true
      setError('That is your own code.')
      setMode('card')
      return
    }

    locked.current = true
    setScanned(card)
    setName(card.name ?? '')
    setError(null)
    setMode('confirm')
  }

  /**
   * Write the scanned card into the address book.
   *
   * Matching an existing contact matters more than it looks. The book rejects a second
   * contact holding an address it already knows, so a re-scan of somebody you already have
   * would fail with a duplicate error rather than doing the obvious thing. Match on the peer
   * key first — that is the identity — and fall back to the address.
   */
  const save = async () => {
    if (scanned === null) return
    const trimmed = name.trim()
    if (!trimmed) { setError('Give them a name.'); return }

    setBusy(true)
    setError(null)
    try {
      const contacts = await addressBook.listContacts()

      let existing = scanned.peerKey
        ? contacts.find((c) => decodePeerKey(c.username) === scanned.peerKey)
        : undefined

      const held = new Map<string, Address[]>()
      for (const c of contacts) held.set(c.id, await addressBook.listAddresses(c.id))

      if (!existing && scanned.address) {
        const wanted = scanned.address.toLowerCase()
        existing = contacts.find(
          (c) => held.get(c.id)?.some((a) => a.address.toLowerCase() === wanted)
        )
      }

      const id = existing
        ? (await addressBook.editContact(existing.id, {
            name: trimmed,
            ...(scanned.peerKey ? { username: encodePeerKey(scanned.peerKey) } : {})
          })).id
        : (await addressBook.addContact({
            name: trimmed,
            ...(scanned.peerKey ? { username: encodePeerKey(scanned.peerKey) } : {})
          })).id

      let note = `${trimmed} saved.`

      if (scanned.address) {
        const arbitrum = (existing ? held.get(existing.id) ?? [] : [])
          .find((a) => a.network === 'arbitrum')
        if (!arbitrum) {
          await addressBook.addAddress(id, {
            address: scanned.address,
            type: 'evm',
            network: 'arbitrum',
            label: 'USD₮0'
          })
        } else if (arbitrum.address.toLowerCase() !== scanned.address.toLowerCase()) {
          // Don't quietly rewrite where somebody's money goes. Say it and let them decide
          // in Contacts.
          note += ' Their code carries a different Arbitrum address to the one you already ' +
            'have saved — the saved one was kept.'
        }
      } else {
        note += ' Their code carried no address, so they can ask you for money but you ' +
          'cannot pay them yet.'
      }

      setSaved(note)
      setScanned(null)
      setName('')
      setMode('card')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const dark = useDark()
  const t = theme(dark)
  const s = styles(dark)

  if (mode === 'scanning') {
    return (
      <SafeAreaView style={s.safeDark}>
        <CameraView
          style={s.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        >
          <View style={s.reticleWrap}><View style={s.reticle} /></View>
          <View style={s.cameraFoot}>
            <Text style={s.cameraHint}>Point at their Moor code</Text>
            <Pressable
              style={({ pressed }) => [s.btnGhostLight, pressed && PRESSED]}
              onPress={() => setMode('card')}
            >
              <Text style={s.btnGhostLightText}>Cancel</Text>
            </Pressable>
          </View>
        </CameraView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <BackLink label="Contacts" onPress={onBack} dark={dark} />
          <Text style={s.title}>Exchange codes</Text>
        </View>

        {mode === 'confirm' && scanned
          ? (
            <View style={s.card}>
              <Text style={s.cardLabel}>Scanned</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={(text) => { setName(text); setError(null) }}
                placeholder="Name them"
                placeholderTextColor={t.dim}
                autoCapitalize="words"
                autoFocus
              />
              {scanned.address
                ? (
                  <>
                    <Text style={s.fieldLabel}>Arbitrum address</Text>
                    <Text style={s.mono} selectable>{scanned.address}</Text>
                  </>
                  )
                : null}
              {scanned.peerKey
                ? (
                  <>
                    <Text style={s.fieldLabel}>Peer key</Text>
                    <Text style={s.mono} numberOfLines={1} ellipsizeMode="middle">
                      {scanned.peerKey}
                    </Text>
                  </>
                  )
                : null}
              <View style={s.row}>
                <Pressable
                  style={({ pressed }) => [s.btn, busy && s.btnDisabled, pressed && PRESSED]}
                  onPress={save}
                  disabled={busy}
                >
                  <Text style={s.btnText}>{busy ? 'Saving…' : 'Save contact'}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.btnGhost, pressed && PRESSED]}
                  onPress={() => { setScanned(null); setMode('card') }}
                  disabled={busy}
                >
                  <Text style={s.btnGhostText}>Discard</Text>
                </Pressable>
              </View>
              {error && <Text style={s.err}>{error}</Text>}
            </View>
            )
          : null}

        {saved
          ? (
            <View style={s.done}>
              <Text style={s.doneText}>{saved}</Text>
              <Text style={s.note}>Now let them scan yours, so they can reach you too.</Text>
            </View>
            )
          : null}

        <View style={s.card}>
          <Text style={s.cardLabel}>Your code</Text>
          {myCard
            ? (
              <>
                <View style={s.qrWrap}>
                  <View style={s.qrPad}>
                    <QRCode value={myCard} size={216} backgroundColor={QR_LIGHT} color={QR_DARK} />
                  </View>
                </View>
                <Text style={s.note}>
                  They scan this to add you. It carries your Arbitrum address and the key that
                  lets you reach each other — nothing else, and nothing that can spend.
                </Text>
              </>
              )
            : (
              <View style={s.pending}>
                <ActivityIndicator />
                <Text style={s.note}>Announcing on the network…</Text>
              </View>
              )}
        </View>

        {mode === 'card'
          ? (
            <>
              <Pressable style={({ pressed }) => [s.scan, pressed && PRESSED]} onPress={startScanning}>
                <Text style={s.scanText}>Scan theirs</Text>
              </Pressable>
              {error && <Text style={s.err}>{error}</Text>}
            </>
            )
          : null}

        <Text style={s.footer}>
          Both of you scan. Until someone is in your contacts they cannot open a connection to
          your phone at all — there is no route for a request to arrive down.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    safe: { flex: 1, backgroundColor: t.bg },
    safeDark: { flex: 1, backgroundColor: CAMERA_BG },
    body: { padding: 20, gap: 12 },
    header: { gap: 6, marginBottom: 4 },
    back: { fontSize: 15, color: t.accent, fontWeight: '600' },
    title: { fontSize: 30, fontWeight: '700', color: t.fg, letterSpacing: -0.5 },

    card: {
      padding: 16, borderRadius: 14, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 10
    },
    cardLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.dim },
    fieldLabel: { fontSize: 11, color: t.dim, marginTop: 2 },

    input: {
      padding: 12, borderRadius: 10, backgroundColor: t.bg,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      color: t.fg, fontSize: 15
    },
    mono: { fontSize: 12, fontFamily: FONT.mono, color: t.fg },

    qrWrap: { alignItems: 'center', paddingVertical: 6 },
    qrPad: { padding: 14, backgroundColor: QR_LIGHT, borderRadius: 14 },
    pending: { alignItems: 'center', gap: 10, paddingVertical: 24 },

    done: {
      padding: 16, borderRadius: 14, backgroundColor: t.card,
      borderWidth: 1, borderColor: t.accent, gap: 6
    },
    doneText: { fontSize: 15, fontWeight: '600', color: t.fg },

    camera: { flex: 1, justifyContent: 'space-between' },
    reticleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    reticle: {
      width: 240, height: 240, borderRadius: 20,
      borderWidth: 2, borderColor: CAMERA_FG
    },
    cameraFoot: { padding: 24, gap: 14, alignItems: 'center' },
    cameraHint: { color: CAMERA_FG, fontSize: 15, fontWeight: '600' },
    btnGhostLight: {
      paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10,
      borderWidth: 1, borderColor: CAMERA_FG
    },
    btnGhostLightText: { color: CAMERA_FG, fontWeight: '600', fontSize: 14 },

    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: {
      flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: t.accent,
      alignItems: 'center'
    },
    btnText: { color: t.onAccent, fontWeight: '600', fontSize: 14 },
    btnDisabled: { opacity: 0.6 },
    btnGhost: {
      flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line
    },
    btnGhostText: { color: t.fg, fontWeight: '600', fontSize: 14 },

    scan: { paddingVertical: 15, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center' },
    scanText: { color: t.onAccent, fontWeight: '700', fontSize: 16 },

    note: { fontSize: 12, color: t.dim, lineHeight: 17 },
    err: { fontSize: 13, color: t.danger, lineHeight: 19 },
    footer: { fontSize: 12, color: t.dim, textAlign: 'center', lineHeight: 18, marginTop: 6 }
  }))
}
