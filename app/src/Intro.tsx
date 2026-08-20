import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'

import { useDark } from './useTheme'
import { theme, sheet } from './theme'

const RISE_MS = 620
const RULE_MS = 820
const FADE_MS = 380

/** Long enough to actually read the name, short enough not to be in the way. */
const MINIMUM_MS = 1700

/**
 * The wordmark, once, while the app is genuinely busy — then gone.
 *
 * "Moor" used to sit at the top of the wallet screen forever, and on three near-identical
 * boot screens. A logo on a screen whose job is a balance is just something in the way; a
 * wallet should open on your money. So the name gets one moment on launch and then leaves.
 *
 * It is not a fake delay. The worklet is booting both stacks and the keychain unlock is
 * running behind this, which is time the app was spending anyway — the animation covers real
 * latency rather than manufacturing some. `settled` is the caller saying there is finally
 * something real to show.
 */
export function Intro ({ settled, onHidden }: {
  settled: boolean
  onHidden: () => void
}) {
  const dark = useDark()
  const s = styles(dark)

  const rise = useRef(new Animated.Value(0)).current
  const rule = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const shownAt = useRef(Date.now())

  const [reduced, setReduced] = useState<boolean | null>(null)

  // DESIGN.md asks for prefers-reduced-motion, and this is the only animation in the app.
  // Null until we know: guessing wrong means animating at someone who asked us not to.
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduced(on) })
      .catch(() => { if (alive) setReduced(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (reduced === null || reduced) return
    Animated.parallel([
      Animated.timing(rise, {
        toValue: 1, duration: RISE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true
      }),
      Animated.timing(rule, {
        toValue: 1, duration: RULE_MS, delay: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true
      })
    ]).start()
  }, [reduced])

  useEffect(() => {
    if (!settled || reduced === null) return

    // Don't let a fast boot turn the wordmark into a flicker.
    const remaining = Math.max(0, MINIMUM_MS - (Date.now() - shownAt.current))
    const timer = setTimeout(() => {
      if (reduced) { onHidden(); return }
      Animated.timing(fade, {
        toValue: 0, duration: FADE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true
      }).start(({ finished }) => { if (finished) onHidden() })
    }, remaining)

    return () => clearTimeout(timer)
  }, [settled, reduced])

  if (reduced === null) return <View style={s.fill} />

  const lift = reduced
    ? 0
    : rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] })

  return (
    <Animated.View style={[s.fill, { opacity: reduced ? 1 : fade }]}>
      <View style={s.centre}>
        <Animated.Text
          style={[s.brand, { opacity: reduced ? 1 : rise, transform: [{ translateY: lift }] }]}
          accessibilityRole="header"
        >
          Moor
        </Animated.Text>
        {/* The one place gold appears outside a send confirmation, and it is a hairline for
            half a second. DESIGN.md's rule is that an accent used everywhere is not an
            accent — this is the launch mark, not chrome. */}
        <Animated.View
          style={[s.rule, { transform: [{ scaleX: reduced ? 1 : rule }] }]}
        />
      </View>
    </Animated.View>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    fill: { ...StyleSheet.absoluteFillObject, backgroundColor: t.bg },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    brand: { fontSize: 40, fontWeight: '700', color: t.fg, letterSpacing: -0.8 },
    rule: { width: 56, height: 2, borderRadius: 1, backgroundColor: t.gold }
  }))
}
