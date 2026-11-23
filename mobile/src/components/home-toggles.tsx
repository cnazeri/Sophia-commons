// The two Home page switches (owner, 2026-11-22): the festival/Advent card and the Calendar of the Soul.
// Shown on a festival day's own page and in Settings > Home page.
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setHomePref, useHomePrefs } from '@/lib/home-prefs';
import { t } from '@/lib/i18n';

export function HomeToggles() {
  const c = useTheme();
  const p = useHomePrefs();
  const rows = [
    { k: 'days' as const, label: t('app.home_show_days', 'Festivals and special days'), desc: t('app.home_show_days_desc', 'Advent and the other festivals, anniversaries and memorial days') },
    { k: 'cots' as const, label: t('cots.title', 'Calendar of the Soul'), desc: t('app.home_show_cots_desc', "This week's verse") },
  ];
  return (
    <View style={[styles.box, { backgroundColor: c.elevated, borderColor: c.border }]}>
      <Text style={[styles.head, { color: c.text }]}>{t('app.home_show_title', 'Show on the Home page')}</Text>
      {rows.map((r) => (
        <View key={r.k} style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.label, { color: c.text }]}>{r.label}</Text>
            <Text style={[styles.desc, { color: c.textSecondary }]}>{r.desc}</Text>
          </View>
          <Switch value={p[r.k]} onValueChange={(on) => setHomePref(r.k, on)} trackColor={{ true: c.gold }} thumbColor="#FFFFFF" accessibilityLabel={r.label} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  head: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  desc: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
});
