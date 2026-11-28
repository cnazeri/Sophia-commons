// Admin > Waiting for you: one card per kind with its count. Kinds reviewed in the app open their list; the others open
// the website's Admin page. A kind with nothing waiting shows as done.
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { GOLD_TINT } from '@/components/redesign';
import { Card } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Counts, KindDef } from '@/lib/admin';
import { t } from '@/lib/i18n';

type TileProps = { def: KindDef; count: number | null | undefined; onPress: () => void };

export function KindTile({ def, count, onPress }: TileProps) {
  const c = useTheme();
  const known = typeof count === 'number';
  const done = count === 0;
  const status = !known ? t('app.admin_count_unknown', 'Could not count')
    : done ? t('app.admin_done', 'Done') : t('app.admin_n_waiting', '{n} waiting', { n: count as number });
  const where = def.inApp ? '' : t('app.admin_on_website', 'on the website');
  return (
    <Pressable onPress={onPress} accessibilityRole={def.inApp ? 'button' : 'link'}
      accessibilityLabel={[def.title, status, where].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.tile, {
        backgroundColor: done ? c.surface : c.elevated, borderColor: done || !known ? c.border : c.gold, opacity: pressed ? 0.85 : 1,
      }]}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: done ? 'transparent' : GOLD_TINT }]}>
          <Icon name={done ? 'check' : def.icon} size={20} color={done ? c.textMuted : c.goldText} />
        </View>
        {known && !done ? (
          <View style={[styles.bubble, { backgroundColor: c.gold }]}><Text style={[styles.bubbleText, { color: c.onGold }]}>{count}</Text></View>
        ) : null}
      </View>
      <Text style={[styles.title, { color: done ? c.textSecondary : c.text }]} numberOfLines={2}>{def.title}</Text>
      <Text style={[styles.status, { color: done ? c.textMuted : c.goldText }]}>{status}</Text>
      {where ? (
        <View style={styles.where}>
          <Icon name="web" size={13} color={c.textMuted} />
          <Text style={[styles.whereText, { color: c.textMuted }]}>{where}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The grid of kinds, two to a row */
export function KindGrid({ defs, counts, onOpen }: { defs: KindDef[]; counts: Counts; onOpen: (d: KindDef) => void }) {
  return <View style={styles.grid}>{defs.map((d) => <KindTile key={d.kind} def={d} count={counts[d.kind]} onPress={() => onOpen(d)} />)}</View>;
}

/** Everything is 0 */
export function AllCaughtUp() {
  const c = useTheme();
  return (
    <Card style={styles.caught}>
      <View style={[styles.bigIcon, { backgroundColor: GOLD_TINT }]}><Icon name="star" size={24} color={c.goldText} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.caughtTitle, { color: c.text }]} accessibilityRole="header">{t('app.admin_caught_up', 'All caught up')}</Text>
        <Text style={[styles.caughtText, { color: c.textSecondary }]}>{t('app.admin_caught_up_desc', 'Nothing is waiting for you. New posts will show here.')}</Text>
      </View>
    </Card>
  );
}

/** A row that opens the website's Admin page for everything else */
export function WebsiteRow({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  const title = t('app.admin_more_title', 'Open the website Admin');
  const desc = t('app.admin_more_desc', 'Traffic, members, blog, newsletter, featured posts and the rest');
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={title + '. ' + desc}
      style={({ pressed }) => [styles.row, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.bigIcon, { backgroundColor: GOLD_TINT }]}><Icon name="web" size={20} color={c.goldText} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
        <Text style={[styles.caughtText, { color: c.textSecondary }]}>{desc}</Text>
      </View>
      <Icon name="chevron" size={18} color={c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 116, padding: 12, gap: 4, borderWidth: 1, borderRadius: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bubble: { minWidth: 30, height: 30, borderRadius: Radius.pill, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  status: { fontFamily: Fonts.bodySemi, fontSize: 13.5 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  whereText: { fontFamily: Fonts.body, fontSize: 12.5 },
  caught: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  bigIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  caughtTitle: { fontFamily: Fonts.headingBold, fontSize: 19, lineHeight: 25 },
  caughtText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 64, padding: 14, borderWidth: 1, borderRadius: 14 },
});
