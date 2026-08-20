import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useWdkApp, useWalletManager, useModule } from '@tetherto/wdk-react-native-core'
import type { AddressBookApi } from '@tetherto/wdk-p2p-address-book'

import { Onboarding } from './screens/Onboarding'
import { Wallet } from './screens/Wallet'
import { Contacts } from './screens/Contacts'
import { Menu } from './screens/Menu'
import { Exchange } from './screens/Exchange'
import { Send, type SendPrefill } from './screens/Send'
import { BLIND_PEERS, WALLET_ID } from './wdk/config'
import { usePayRequests } from './usePayRequests'
import { Intro } from './Intro'
import { useDark } from './useTheme'
import { theme, sheet } from './theme'

/**
 * DEV ONLY — restores a fixed recovery phrase instead of showing onboarding, so both
 * simulators can be put on the same seed without a human tapping through two devices.
 * It is how the two-device sync demo is verified automatically.
 *
 * Ignored entirely in release builds (`__DEV__` is false), and it must stay that way: a
 * recovery phrase in an environment variable is a recovery phrase in your shell history,
 * your CI logs and your process list. Only ever put a throwaway phrase here — the one used
 * for testing is the publicly known `abandon abandon … about`, which holds nothing because
 * everybody has it.
 */
const DEV_SEED = __DEV__ ? (process.env.EXPO_PUBLIC_DEV_SEED || '') : ''

/**
 * Routing and wallet lifecycle, in one place so the screens stay about their own job.
 *
 * WDK's lifecycle is INITIALIZING → NO_WALLET | LOCKED → READY, and the transitions need
 * driving. Note the quirk: lock() clears the ACTIVE wallet pointer, not the stored seed, so
 * WDK reports NO_WALLET for both "never had one" and "has one, currently locked". Telling
 * them apart needs the persisted wallets list — get it wrong and returning users are sent
 * back through onboarding, which for a wallet means being asked to write down a phrase they
 * already have.
 */
function DevSeedRestore () {
  const { restoreWallet, setActiveWalletId } = useWalletManager()
  const started = useRef(false)
  const [err, setErr] = useState<string | null>(null)
  const dark = useDark()
  const s = styles(dark)

  useEffect(() => {
    if (started.current) return
    started.current = true
    restoreWallet(DEV_SEED, WALLET_ID)
      .then(() => setActiveWalletId(WALLET_ID))
      .catch((e: Error) => {
        // Already in secure storage, e.g. the wallets list hadn't loaded when Root
        // decided there was none. Adopt it and let the unlock effect take over.
        if (/already exists/i.test(e?.message ?? '')) setActiveWalletId(WALLET_ID)
        else setErr(e?.message ?? String(e))
      })
  }, [])

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        {err ? null : <ActivityIndicator />}
        <Text style={err ? s.err : s.muted}>{err ?? 'restoring dev seed…'}</Text>
      </View>
    </SafeAreaView>
  )
}

export function Root () {
  const { state } = useWdkApp()
  const { unlock, wallets } = useWalletManager()
  const addressBook = useModule<AddressBookApi>('addressBook')

  const [screen, setScreen] = useState<'wallet' | 'menu' | 'contacts' | 'exchange' | 'send'>('wallet')
  const [prefill, setPrefill] = useState<SendPrefill | undefined>()
  const [introGone, setIntroGone] = useState(false)
  const didUnlock = useRef(false)
  const didEnrol = useRef(false)

  const hasStored = wallets?.some((w) => w.identifier === WALLET_ID) ?? false
  const ready = state.status === 'READY'

  // Attach the host-side handler for worklet module events. Until something subscribes,
  // rn-core registers no handler and the first event the module emits takes the app down
  // (upstream rn-core#83). Subscribing here means it's always attached, whatever screen
  // is showing.
  useEffect(() => addressBook.on('update', () => {}), [state.status])

  const pay = usePayRequests(ready)

  useEffect(() => {
    const locked = state.status === 'LOCKED' || (state.status === 'NO_WALLET' && hasStored)
    if (!locked || didUnlock.current) return
    didUnlock.current = true
    unlock(WALLET_ID).catch(() => { didUnlock.current = false })
  }, [state.status, hasStored])

  /**
   * Enrolment order is load-bearing and getting it wrong forks the address book.
   *
   *   addMirror()  joins an EXISTING book from a mirror, then enrols this device
   *   create()     starts a NEW one
   *
   * With a mirror configured we always try to join first, because this seed may already
   * have a book that another device wrote — and create() would begin a second history for
   * the same identity. Only when joining genuinely finds nothing do we create. This is
   * exactly the path a restored-from-phrase second device takes.
   */
  useEffect(() => {
    if (!ready || didEnrol.current) return
    didEnrol.current = true
    ;(async () => {
      try {
        const info = await addressBook.getInfo()
        if (info.writable) {
          if (BLIND_PEERS.length > 0 && (await addressBook.listMirrors()).length === 0) {
            await addressBook.addMirror(BLIND_PEERS)
          }
          return
        }
        if (BLIND_PEERS.length === 0) { await addressBook.create(); return }
        try {
          await addressBook.addMirror(BLIND_PEERS)
        } catch {
          await addressBook.create()
          await addressBook.addMirror(BLIND_PEERS)
        }
      } catch { /* the contacts screen surfaces its own errors */ }
    })()
  }, [ready])

  const dark = useDark()
  const s = styles(dark)

  // Five screens and a back stack one level deep. A router would be more machinery than
  // this app has navigation.
  const screens = {
    menu: (
      <Menu
        pay={pay}
        onBack={() => setScreen('wallet')}
        onOpenContacts={() => setScreen('contacts')}
        onOpenExchange={() => setScreen('exchange')}
      />
    ),
    contacts: (
      <Contacts
        onBack={() => setScreen('menu')}
        onExchange={() => setScreen('exchange')}
      />
    ),
    exchange: <Exchange pay={pay} onBack={() => setScreen('contacts')} />,
    send: (
      <Send
        prefill={prefill}
        onBack={() => setScreen('wallet')}
        onSent={() => setPrefill(undefined)}
      />
    ),
    wallet: (
      <Wallet
        onOpenMenu={() => setScreen('menu')}
        onSend={(next) => { setPrefill(next); setScreen('send') }}
        pay={pay}
      />
    )
  }

  /**
   * "Settled" is the app having something real to show — a wallet, an onboarding form, or a
   * failure. Until then the intro is what's on screen, and it is covering genuine work:
   * booting a worklet with both stacks in it, then a keychain unlock.
   */
  const settled = ready ||
    state.status === 'ERROR' ||
    (state.status === 'NO_WALLET' && !hasStored)

  const content = state.status === 'ERROR'
    ? (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><Text style={s.err}>{state.error.message}</Text></View>
      </SafeAreaView>
      )
    : state.status === 'NO_WALLET' && !hasStored
      ? (DEV_SEED ? <DevSeedRestore /> : <Onboarding />)
      : ready
        ? screens[screen]
        // Not ready. Normally the intro is still covering this, but a re-initialisation
        // after it has gone would otherwise leave a blank screen.
        : introGone
          ? (
            <SafeAreaView style={s.safe}>
              <View style={s.center}><ActivityIndicator /></View>
            </SafeAreaView>
            )
          : null

  return (
    <View style={s.root}>
      {content}
      <DevSeedBanner />
      {introGone ? null : <Intro settled={settled} onHidden={() => setIntroGone(true)} />}
    </View>
  )
}

/**
 * Says out loud that this build unlocked a phrase from an environment variable.
 *
 * The phrase never reaches a release build — `__DEV__` is false there and the branch is
 * eliminated before the value is inlined, which we checked against a real production export
 * rather than assuming. What this guards against is the human failure: demoing or screen
 * sharing a wallet you believe is yours, on a seed that is sitting in a file, in your shell
 * history, and in `ps`. Anyone watching can drain it.
 */
function DevSeedBanner () {
  const dark = useDark()
  const s = styles(dark)

  if (!DEV_SEED) return null

  return (
    <View style={s.devBanner}>
      <Text style={s.devBannerText}>
        DEV SEED — unlocked from an env var. Never hold real money here.
      </Text>
    </View>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    root: { flex: 1, backgroundColor: t.bg },
    safe: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    devBanner: { backgroundColor: t.warning, paddingVertical: 6, paddingHorizontal: 12 },
    devBannerText: {
      color: t.onWarning, fontSize: 11, fontWeight: '700',
      textAlign: 'center', letterSpacing: 0.3
    },
    brand: { fontSize: 32, fontWeight: '700', color: t.fg, letterSpacing: -0.5 },
    muted: { fontSize: 14, color: t.dim },
    err: { fontSize: 13, color: t.danger, textAlign: 'center', paddingHorizontal: 30 }
  }))
}
