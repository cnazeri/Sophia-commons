// Shared pieces of the Admin area: the page (pull down to refresh), a message banner, and small pills.
import { type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { GOLD_TINT } from '@/components/redesign';
import { H1, Wordmark } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

const DANGER = '#B3261E';
const DANGER_DARK = '#F2B8B5';
const DANGER_TINT = 'rgba(179,38,30,0.10)';

type AdminScreenProps = { title?: string; intro?: string; refreshing: boolean; onRefresh: () => void; children: ReactNode };

/** A page under the stack header, with the wordmark and title, that refreshes when pulled down */
export function AdminScreen({ title, intro, refreshing, onRefresh, children }: AdminScreenProps) {
  const c = useTheme();
  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gold} colors={[c.gold]} />}>
        <View style={styles.inner}>
          <Wordmark />
          {title ? <H1>{title}</H1> : null}
          {intro ? <Text style={[styles.intro, { color: c.textSecondary }]}>{intro}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** A message on top of the list: an error in red, or a note in gold. Tap the cross to close it. */
export function Banner({ text, tone = 'error', onClose }: { text: string; tone?: 'error' | 'note'; onClose?: () => void }) {
  const c = useTheme();
  if (!text) return null;
  const error = tone === 'error';
  const dark = c.background !== '#FDFBF7';
  const fg = error ? (dark ? DANGER_DARK : DANGER) : c.text;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: error ? DANGER_TINT : GOLD_TINT, borderColor: error ? fg : c.gold }]}>
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
      {onClose ? (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('app.close', 'Close')} hitSlop={8} style={styles.close}>
          <Text style={[styles.closeX, { color: fg }]}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A small rounded label, e.g. the section or "From the app" */
export function Pill({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: GOLD_TINT }]}>
      <Text style={[styles.pillText, { color: c.goldText }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Shown when a list is empty */
export function EmptyNote({ text }: { text: string }) {
  const c = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.elevated }]}>
      <View style={[styles.emptyIcon, { backgroundColor: GOLD_TINT }]}><Icon name="check" size={22} color={c.goldText} /></View>
      <Text style={[styles.intro, { color: c.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.md },
  intro: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderWidth: 1, borderRadius: 14, padding: Spacing.md },
  bannerText: { flex: 1, fontFamily: Fonts.bodySemi, fontSize: 14.5, lineHeight: 20 },
  close: { minWidth: 44, minHeight: 44, marginTop: -12, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  closeX: { fontSize: 24, lineHeight: 26, fontFamily: Fonts.body },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.pill },
  pillText: { fontFamily: Fonts.bodyBold, fontSize: 12 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: 14, padding: Spacing.lg },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
