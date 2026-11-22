import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Button({ label, onPress, kind = 'primary' }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' }) {
  const c = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.btn, { backgroundColor: primary ? c.gold : c.elevated, borderColor: primary ? c.gold : c.border, opacity: pressed ? 0.85 : 1 }]}>
      <Text style={[styles.label, { color: primary ? c.onGold : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15 },
});
