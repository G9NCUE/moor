import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'

import { theme, sheet, PRESSED } from './theme'

/**
 * Back navigation, in one place.
 *
 * Four screens were each drawing their own `‹` character. A typographic glyph is not an
 * icon — its size and baseline shift with the font, and it cannot take a stroke width — so
 * this is Lucide, at the 20 step of the icon scale, with a 44pt touch target it would not
 * otherwise have.
 */
export function BackLink ({ label, onPress, dark }: {
  label: string
  onPress: () => void
  dark: boolean
}) {
  const t = theme(dark)
  const s = styles(dark)

  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      style={({ pressed }) => [s.hit, pressed && PRESSED]}
    >
      <View style={s.row}>
        <ChevronLeft size={20} color={t.accent} strokeWidth={2} />
        <Text style={s.label}>{label}</Text>
      </View>
    </Pressable>
  )
}

const styles = (dark: boolean) => {
  const t = theme(dark)
  return StyleSheet.create(sheet({
    hit: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    label: { fontSize: 15, color: t.accent, fontWeight: '600' }
  }))
}
