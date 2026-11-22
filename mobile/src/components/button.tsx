import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DANGER = '#B3261E';

export function Button({ label, onPress, kind = 'primary', disabled = false }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const c = useTheme();
  const primary = kind === 'primary';
  const danger = kind === 'danger';
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.btn, {
        backgroundColor: primary ? c.gold : c.elevated,
        borderColor: primary ? c.gold : danger ? DANGER : c.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }]}>
      <Text style={[styles.label, { color: primary ? c.onGold : danger ? DANGER : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15 },
});
