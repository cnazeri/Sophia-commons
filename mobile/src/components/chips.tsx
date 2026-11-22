import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const c = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? c.gold : c.elevated, borderColor: on ? c.gold : c.border }]}>
            <Text style={[styles.label, { color: on ? c.onGold : c.textSecondary }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: Radius.pill, borderWidth: 1 },
  label: { fontFamily: Fonts.bodySemi, fontSize: 14 },
});
