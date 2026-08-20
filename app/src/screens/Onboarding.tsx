import { useState } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { useWalletManager, validateMnemonic } from '@tetherto/wdk-react-native-core'

import { useDark } from '../useTheme'
import { theme, sheet, FONT, PRESSED } from '../theme'
import { WALLET_ID } from '../wdk/config'

type Mode = 'choose' | 'creating' | 'showPhrase' | 'import'

/**
 * First run. Two doors: make a wallet, or bring one.
 *
 * The second door is what makes Moor's whole point demonstrable — two devices only share
 * a contact list because they share a recovery phrase. Without import there is no second
 * device, just two strangers.
 */
export function Onboarding () {
  // Both doors use restoreWallet: WDK's createWallet returns void, so it can't show you
  // the phrase it just made.
  const { restoreWallet, generateMnemonic, setActiveWalletId } = useWalletManager()

  const [mode, setMode] = useState<Mode>('choose')
  const [phrase, setPhrase] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const dark = useDark()
  const t = theme(dark)
  const s = styles(dark)

  const create = async () => {
    setError(null); setMode('creating')
    try {
      // Generate first and show it, rather than creating silently and offering a backup
      // later. "Later" is where unbacked-up wallets come from.
      const m = await generateMnemonic(12)
      setPhrase(m)
      setMode('showPhrase')
    } catch (e) {
      setError((e as Error).message); setMode('choose')
    }
  }

  const confirmCreated = async () => {
    setBusy(true); setError(null)
    try {
      await restoreWallet(phrase, WALLET_ID)
      setActiveWalletId(WALLET_ID)
      setPhrase('') // out of component state the moment it's committed
    } catch (e) {
      setError((e as Error).message); setBusy(false)
    }
  }

  const importPhrase = async () => {
    const cleaned = input.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!validateMnemonic(cleaned)) {
      setError('That isn\'t a valid recovery phrase. Check the spelling and word order.')
      return
    }
    setBusy(true); setError(null)
    try {
      await restoreWallet(cleaned, WALLET_ID)
      setActiveWalletId(WALLET_ID)
      setInput('')
    } catch (e) {
      setError((e as Error).message); setBusy(false)
    }
  }

  const copyPhrase = async () => {
    await Clipboard.setStringAsync(phrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>Moor</Text>

        {mode === 'choose' && (
          <>
            <Text style={s.lede}>
              A USD₮ wallet where your contacts and your devices talk to each other directly,
              with no company in between.
            </Text>
            <Pressable style={({ pressed }) => [s.btn, pressed && PRESSED]} onPress={create}>
              <Text style={s.btnText}>Create a new wallet</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.btnGhost, pressed && PRESSED]}
              onPress={() => { setMode('import'); setError(null) }}
            >
              <Text style={s.btnGhostText}>I already have a recovery phrase</Text>
            </Pressable>
          </>
        )}

        {mode === 'creating' && (
          <View style={s.center}><ActivityIndicator /><Text style={s.muted}>Generating…</Text></View>
        )}

        {mode === 'showPhrase' && (
          <>
            <Text style={s.h2}>Write these twelve words down</Text>
            <Text style={s.lede}>
              They are the wallet. Anyone who has them has your money, and nobody — including
              us — can recover them for you. Enter them on another device to see the same
              contacts there.
            </Text>

            <View style={s.phraseBox}>
              {phrase.split(' ').map((w, i) => (
                <View key={i} style={s.word}>
                  <Text style={s.wordIndex}>{i + 1}</Text>
                  <Text style={s.wordText}>{w}</Text>
                </View>
              ))}
            </View>

            <Pressable style={({ pressed }) => [s.btnGhost, pressed && PRESSED]} onPress={copyPhrase}>
              <Text style={s.btnGhostText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.btn, busy && s.btnDisabled, pressed && PRESSED]}
              onPress={confirmCreated}
              disabled={busy}
            >
              <Text style={s.btnText}>{busy ? 'Setting up…' : "I've written them down"}</Text>
            </Pressable>
          </>
        )}

        {mode === 'import' && (
          <>
            <Text style={s.h2}>Enter your recovery phrase</Text>
            <Text style={s.lede}>Twelve words, in order, separated by spaces.</Text>

            <TextInput
              style={s.input}
              value={input}
              onChangeText={(text) => { setInput(text); setError(null) }}
              placeholder="abandon abandon abandon…"
              placeholderTextColor={t.dim}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [s.btn, busy && s.btnDisabled, pressed && PRESSED]}
              onPress={importPhrase}
              disabled={busy}
            >
              <Text style={s.btnText}>{busy ? 'Restoring…' : 'Restore wallet'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.btnGhost, pressed && PRESSED]}
              onPress={() => { setMode('choose'); setInput(''); setError(null) }}
            >
              <Text style={s.btnGhostText}>Back</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={s.err}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    safe: { flex: 1, backgroundColor: t.bg },
    body: { padding: 22, gap: 14 },
    center: { alignItems: 'center', gap: 10, paddingVertical: 40 },
    brand: { fontSize: 34, fontWeight: '700', color: t.fg, letterSpacing: -0.6, marginBottom: 4 },
    h2: { fontSize: 21, fontWeight: '600', color: t.fg },
    lede: { fontSize: 15, color: t.dim, lineHeight: 22 },
    muted: { fontSize: 14, color: t.dim },

    phraseBox: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, borderRadius: 14,
      backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line
    },
    word: { flexDirection: 'row', alignItems: 'baseline', gap: 6, width: '30%' },
    wordIndex: { fontSize: 11, color: t.dim, minWidth: 14, textAlign: 'right' },
    // Mono for the phrase. These twelve words get transcribed by hand onto paper, and a
    // proportional face is where 'rn' becomes 'm'.
    wordText: { fontSize: 15, color: t.fg, fontFamily: FONT.monoMedium },

    input: {
      minHeight: 110, padding: 14, borderRadius: 10, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      color: t.fg, fontSize: 16, lineHeight: 24
    },

    btn: { paddingVertical: 15, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: t.onAccent, fontWeight: '600', fontSize: 15 },
    btnGhost: {
      paddingVertical: 15, borderRadius: 10, alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.line
    },
    btnGhostText: { color: t.fg, fontWeight: '600', fontSize: 15 },

    err: { fontSize: 13, color: t.danger, lineHeight: 19 }
  }))
}
