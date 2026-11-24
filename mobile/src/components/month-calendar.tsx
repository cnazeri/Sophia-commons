// Month calendar for the Events tab (owner, 2026-11-24: "we should have a calendar"): a dot per event under each day,
// colored in person, online or festival, today in gold; tapping a day with events calls onPick with that day.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type EventRow } from '@/lib/events';
import { localDate, t } from '@/lib/i18n';

export const KIND_COLORS = { in: '#C9A035', on: '#2A5DB0', fest: '#3F7539' } as const;
const dayKey = (d: Date) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

export function MonthCalendar({ events, onPick }: { events: EventRow[]; onPick: (key: string) => void }) {
  const c = useTheme();
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = new Map<string, ('in' | 'on' | 'fest')[]>();
    events.forEach((e) => {
      const k = dayKey(new Date(e.start_date));
      const kind = e.event_type === 'festival' ? 'fest' : e.is_online ? 'on' : 'in';
      m.set(k, [...(m.get(k) || []), kind]);
    });
    return m;
  }, [events]);
  const lead = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const todayKey = dayKey(new Date());
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weekdays = Array.from({ length: 7 }, (_, i) => localDate(new Date(2023, 0, 1 + i).toISOString(), { weekday: 'narrow' }));
  const step = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <View style={[styles.box, { backgroundColor: c.elevated, borderColor: c.border }]}>
      <View style={styles.head}>
        <Pressable onPress={() => step(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('app.prev_month', 'Previous month')} style={[styles.nav, { borderColor: c.border }]}>
          <Icon name="back" size={17} color={c.text} />
        </Pressable>
        <Text style={[styles.month, { color: c.text }]} accessibilityRole="header">{localDate(month.toISOString(), { month: 'long', year: 'numeric' })}</Text>
        <Pressable onPress={() => step(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('app.next_month', 'Next month')} style={[styles.nav, { borderColor: c.border }]}>
          <Icon name="arrow" size={17} color={c.text} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {weekdays.map((w, i) => <Text key={'w' + i} style={[styles.wd, { color: c.textMuted }]}>{w}</Text>)}
        {cells.map((d, i) => {
          if (!d) return <View key={'x' + i} style={styles.cell} />;
          const k = month.getFullYear() + '-' + (month.getMonth() + 1) + '-' + d;
          const kinds = byDay.get(k) || [];
          const today = k === todayKey;
          const label = localDate(new Date(month.getFullYear(), month.getMonth(), d).toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })
            + (kinds.length ? ', ' + t('app.n_events', '{n} events').replace('{n}', String(kinds.length)) : '');
          return (
            <Pressable key={k} onPress={() => kinds.length && onPick(k)} disabled={!kinds.length} accessibilityRole="button" accessibilityLabel={label} style={styles.cell}>
              <View style={[styles.num, today && { backgroundColor: c.gold }]}>
                <Text style={[styles.numText, { color: today ? c.onGold : kinds.length ? c.text : c.textMuted }]}>{d}</Text>
              </View>
              <View style={styles.dots}>
                {kinds.slice(0, 4).map((kind, j) => <View key={j} style={[styles.dot, { backgroundColor: KIND_COLORS[kind] }]} />)}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.key}>
        {([['in', t('app.filter_in_person', 'In person')], ['on', t('event_detail.online', 'Online')], ['fest', t('app.filter_festivals', 'Festivals')]] as const).map(([k, label]) => (
          <View key={k} style={styles.keyItem}><View style={[styles.dot, { backgroundColor: KIND_COLORS[k] }]} /><Text style={[styles.keyText, { color: c.textSecondary }]}>{label}</Text></View>
        ))}
      </View>
    </View>
  );
}

export { dayKey };

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  nav: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: Fonts.headingBold, fontSize: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: Fonts.bodyBold, fontSize: 11.5, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4, minHeight: 50 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: Fonts.bodyBold, fontSize: 14.5 },
  dots: { flexDirection: 'row', gap: 3, marginTop: 3, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  key: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6, paddingTop: 8 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyText: { fontFamily: Fonts.body, fontSize: 12.5 },
});
