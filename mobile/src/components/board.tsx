// Pieces of the Community board (2026-11-27): the topic chips, a post card for the list, and the options menu
// (Report and Block for other members' items, Delete for your own; admins may delete any).
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chips } from '@/components/chips';
import { Icon } from '@/components/icon';
import { Kicker } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsk } from '@/lib/admin';
import { type BoardPost, commentCount, timeAgo, TOPICS, topicLabel } from '@/lib/board';
import { blockMember } from '@/lib/chat';
import { t } from '@/lib/i18n';
import { isAdmin } from '@/lib/post';
import { reportItem } from '@/lib/report';
import { SITE } from '@/lib/supabase';

export const ALL = 'all';

interface TopicChipsProps { value: string; onChange: (slug: string) => void; withAll?: boolean }

/** All + the nine topics, in a row that scrolls sideways */
export function TopicChips({ value, onChange, withAll = true }: TopicChipsProps) {
  const items = [
    ...(withAll ? [{ key: ALL, label: t('board.all', 'All') }] : []),
    ...TOPICS.map((x) => ({ key: x.slug, label: topicLabel(x.slug) })),
  ];
  return <Chips items={items} value={value} onChange={onChange} />;
}

/** A post in the list: topic, title, author and time, a few lines of the body, the comment count */
export function PostCard({ p }: { p: BoardPost }) {
  const c = useTheme();
  const when = timeAgo(p.created_at);
  return (
    <Pressable onPress={() => router.push({ pathname: '/chat/post/[id]', params: { id: p.id } })} accessibilityRole="link"
      accessibilityLabel={p.title + ', ' + (p.username || 'member') + ', ' + when + ', ' + commentCount(p.comment_count)}
      style={({ pressed }) => [styles.card, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}>
      <Kicker numberOfLines={1}>{topicLabel(p.topic)}</Kicker>
      <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{p.title}</Text>
      <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{(p.username || 'member') + ' · ' + when}</Text>
      <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={3}>{p.body}</Text>
      <View style={styles.count}>
        <Icon name="chat" size={15} color={c.goldText} />
        <Text style={[styles.countText, { color: c.goldText }]}>{commentCount(p.comment_count)}</Text>
      </View>
    </Pressable>
  );
}

export type BoardItem = { kind: 'post' | 'comment'; id: string; postId: string; userId: string; username: string; text: string };

interface MenuArgs { item: BoardItem; session: Session | null; onDelete: (item: BoardItem) => void }

/** The options for a post or comment. Delete asks first; `onDelete` does the (optimistic) removal. */
export function openItemMenu({ item, session, onDelete }: MenuArgs) {
  const me = session?.user?.id || '';
  const mine = !!me && item.userId === me;
  const name = item.username || 'member';
  const askDelete = async () => {
    const ok = await confirmAsk(
      item.kind === 'post' ? t('board.delete_post_q', 'Delete this post?') : t('board.delete_comment_q', 'Delete this comment?'),
      item.kind === 'post' ? t('board.delete_post_desc', 'The post and all its comments will be removed.') : t('board.delete_comment_desc', 'The comment will be removed.'),
      t('app.delete', 'Delete'));
    if (ok) onDelete(item);
  };
  const block = () => {
    Alert.alert(t('app.chat_block_title', 'Block {name}?', { name }),
      t('board.block_desc', "You won't see their posts, comments or messages any more. You can unblock them under Account."), [
        { text: t('app.cancel', 'Cancel'), style: 'cancel' },
        { text: t('app.chat_block', 'Block member'), style: 'destructive', onPress: () => {
          blockMember(me, item.userId).catch(() => Alert.alert(t('board.block_error', 'The member could not be blocked. Please try again.')));
        } },
      ]);
  };
  const report = () => reportItem({
    type: item.kind === 'post' ? 'board_post' : 'board_comment', id: item.id,
    title: ('[' + name + '] ' + item.text).slice(0, 600), url: SITE + '/chat',   // the website's board; admins open the post from Admin > Reports
  }, session, () => Alert.alert(t('app.reported', 'Thank you. We will review it within 24 hours.'), '', [
    { text: t('app.chat_block', 'Block member'), onPress: block },
    { text: 'OK' },
  ]));

  if (mine) {
    askDelete();
    return;
  }
  const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
    { text: t('board.report', 'Report'), onPress: report },
    { text: t('app.chat_block', 'Block member'), onPress: block },
  ];
  if (isAdmin(session)) buttons.push({ text: t('app.delete', 'Delete'), style: 'destructive', onPress: askDelete });
  buttons.push({ text: t('app.cancel', 'Cancel'), style: 'cancel' });
  Alert.alert(name, '', buttons);
}

/** The small options button on a post or comment */
export function ItemOptions({ item, session, onDelete }: MenuArgs) {
  const c = useTheme();
  const mine = item.userId === session?.user?.id;
  return (
    <Pressable onPress={() => openItemMenu({ item, session, onDelete })} accessibilityRole="button" hitSlop={8}
      accessibilityLabel={mine ? t('app.delete', 'Delete') : t('board.options', 'Options: report or block')}
      style={({ pressed }) => [styles.opt, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.optText, { color: mine ? c.textMuted : c.textSecondary }]}>
        {mine ? t('app.delete', 'Delete') : t('board.report', 'Report')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: Spacing.lg, gap: 6 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 17, lineHeight: 23 },
  meta: { fontFamily: Fonts.body, fontSize: 13 },
  body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  countText: { fontFamily: Fonts.bodyBold, fontSize: 13.5 },
  opt: { minHeight: 32, paddingHorizontal: 12, borderWidth: 1, borderRadius: Radius.pill, justifyContent: 'center' },
  optText: { fontFamily: Fonts.bodySemi, fontSize: 13 },
});
