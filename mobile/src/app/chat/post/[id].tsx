// Board > a post: the full post, its comments oldest first, and a comment box at the bottom (kept above the keyboard).
// Report and Block on other members' posts and comments, Delete (after asking) on your own; admins may delete any.
// New comments and deletions show at once and roll back with a message when the database refuses them.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type BoardItem, ItemOptions } from '@/components/board';
import { Body, Kicker } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayName, useAuth } from '@/lib/auth';
import {
  type BoardComment, type BoardPost, commentCount, createComment, deleteComment, deletePost, fetchComments, fetchPost,
  LIMITS, timeAgo, topicLabel,
} from '@/lib/board';
import { hasBlockedWords, useBlocked } from '@/lib/chat';
import { headingFont } from '@/lib/heading-font';
import { localDate, localTime, t } from '@/lib/i18n';

const ERROR_RED = '#B3261E';
const isTemp = (id: string) => id.startsWith('tmp-');

export default function PostScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user?.id || '';
  const blocked = useBlocked();
  const [post, setPost] = useState<BoardPost | null | undefined>(undefined);   // undefined = loading, null = not found
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (alive: () => boolean = () => true) => {
    if (!id) return;
    try {
      const [p, cs] = await Promise.all([fetchPost(id), fetchComments(id)]);
      if (!alive()) return;
      setPost(p); setComments(cs); setNote('');
    } catch {
      if (!alive()) return;
      setPost((cur) => (cur === undefined ? null : cur));
      setNote(t('board.load_post_error', 'Could not load this post. Pull down to try again.'));
    }
  }, [id]);

  useEffect(() => {
    if (!me) return;
    let on = true;
    Promise.resolve().then(() => load(() => on));
    return () => { on = false; };
  }, [me, load]);

  const shown = useMemo(() => comments.filter((x) => !blocked.has(x.user_id)), [comments, blocked]);

  const send = async () => {
    const body = text.trim();
    if (!body || !post || !session) return;
    if (body.length > LIMITS.commentMax) { setNote(t('board.err_comment_long', 'A comment can be at most {n} characters.', { n: LIMITS.commentMax })); return; }
    if (hasBlockedWords(body)) { setNote(t('app.chat_filtered', 'That message contains words that are not allowed here. Please rephrase it.')); return; }
    const temp: BoardComment = { id: 'tmp-' + Date.now(), post_id: post.id, user_id: me, username: displayName(session), body, created_at: new Date().toISOString() };
    setComments((cur) => [...cur, temp]);
    setPost((cur) => (cur ? { ...cur, comment_count: cur.comment_count + 1 } : cur));
    setText(''); setNote('');
    try {
      const saved = await createComment(post.id, body);
      setComments((cur) => cur.map((x) => (x.id === temp.id ? saved : x)));
    } catch {
      setComments((cur) => cur.filter((x) => x.id !== temp.id));
      setPost((cur) => (cur ? { ...cur, comment_count: Math.max(0, cur.comment_count - 1) } : cur));
      setText((cur) => cur || body);
      setNote(t('board.err_comment', 'Your comment was not sent. Check your connection and try again.'));
    }
  };

  const remove = async (item: BoardItem) => {
    if (item.kind === 'post') {
      try {
        await deletePost(item.id);
        router.back();
      } catch {
        setNote(t('board.err_delete', 'That could not be deleted. Please try again.'));
      }
      return;
    }
    const before = comments;
    setComments((cur) => cur.filter((x) => x.id !== item.id));
    setPost((cur) => (cur ? { ...cur, comment_count: Math.max(0, cur.comment_count - 1) } : cur));
    try {
      await deleteComment(item.id);
    } catch {
      setComments(before);
      setPost((cur) => (cur ? { ...cur, comment_count: cur.comment_count + 1 } : cur));
      setNote(t('board.err_delete', 'That could not be deleted. Please try again.'));
    }
  };

  if (!session) return <View style={[styles.center, { backgroundColor: c.background }]}><Body muted>{t('board.sign_in_first_read', 'Please sign in to read the board.')}</Body></View>;
  if (post === undefined) return <View style={[styles.center, { backgroundColor: c.background }]}><ActivityIndicator color={c.goldText} /></View>;
  if (post === null || blocked.has(post.user_id)) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Body muted>{note || t('board.not_found', 'This post is no longer on the board.')}</Body>
      </View>
    );
  }

  const postItem: BoardItem = { kind: 'post', id: post.id, postId: post.id, userId: post.user_id, username: post.username, text: post.title + '\n' + post.body };
  const header = (
    <View style={[styles.post, { borderBottomColor: c.border }]}>
      <Kicker>{topicLabel(post.topic)}</Kicker>
      <Text style={[styles.title, { color: c.text, fontFamily: headingFont(post.title) }]} accessibilityRole="header" selectable>{post.title}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: c.textMuted, flex: 1 }]} numberOfLines={1}>
          {(post.username || 'member') + ' · ' + localDate(post.created_at, { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + localTime(post.created_at)}
        </Text>
        <ItemOptions item={postItem} session={session} onDelete={remove} />
      </View>
      <Text style={[styles.body, { color: c.text }]} selectable>{post.body}</Text>
      <Text style={[styles.section, { color: c.textSecondary }]}>{commentCount(post.comment_count)}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen options={{ title: topicLabel(post.topic) }} />
      <FlatList
        data={shown}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.goldText} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Body muted style={styles.empty}>{t('board.no_comments', 'No comments yet. Share your thoughts.')}</Body>}
        renderItem={({ item: x }) => {
          const mine = x.user_id === me;
          const item: BoardItem = { kind: 'comment', id: x.id, postId: post.id, userId: x.user_id, username: x.username, text: x.body };
          return (
            <View style={[styles.comment, { backgroundColor: mine ? c.surface : c.elevated, borderColor: c.border, opacity: isTemp(x.id) ? 0.6 : 1 }]}>
              <View style={styles.metaRow}>
                <Text style={[styles.name, { color: mine ? c.goldText : c.text }]} numberOfLines={1}>{x.username || 'member'}</Text>
                <Text style={[styles.meta, { color: c.textMuted, flex: 1 }]} numberOfLines={1}>{isTemp(x.id) ? t('board.sending', 'sending...') : timeAgo(x.created_at)}</Text>
                {isTemp(x.id) ? null : <ItemOptions item={item} session={session} onDelete={remove} />}
              </View>
              <Text style={[styles.text, { color: c.text }]} selectable>{x.body}</Text>
            </View>
          );
        }}
      />
      {note ? <Text style={[styles.note, { color: ERROR_RED }]} accessibilityLiveRegion="polite">{note}</Text> : null}
      <View style={[styles.bar, { borderTopColor: c.border, backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, Spacing.sm) + (Platform.OS === 'ios' ? 56 : 64) }]}>
        <TextInput value={text} onChangeText={setText} maxLength={LIMITS.commentMax} multiline
          placeholder={t('board.comment_ph', 'Write a comment...')} placeholderTextColor={c.textMuted}
          accessibilityLabel={t('board.comment_label', 'Write a comment')}
          style={[styles.input, { backgroundColor: c.elevated, borderColor: c.border, color: c.text }]} />
        <Pressable onPress={send} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel={t('board.comment_btn', 'Comment')}
          style={({ pressed }) => [styles.send, { backgroundColor: c.gold, opacity: !text.trim() ? 0.5 : pressed ? 0.85 : 1 }]}>
          <Text style={[styles.sendTxt, { color: c.onGold }]}>{t('board.comment_btn', 'Comment')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { padding: Spacing.lg, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  post: { gap: Spacing.sm, paddingBottom: Spacing.md, marginBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, lineHeight: 30 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  meta: { fontFamily: Fonts.body, fontSize: 13 },
  body: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 24 },
  section: { fontFamily: Fonts.bodyBold, fontSize: 14, marginTop: Spacing.sm },
  empty: { paddingVertical: Spacing.md },
  comment: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4 },
  name: { fontFamily: Fonts.bodyBold, fontSize: 13.5, maxWidth: '50%' },
  text: { fontFamily: Fonts.body, fontSize: 15.5, lineHeight: 22 },
  note: { fontFamily: Fonts.body, fontSize: 13.5, paddingHorizontal: Spacing.lg, paddingBottom: 4 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontFamily: Fonts.body, fontSize: 16 },
  send: { height: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontFamily: Fonts.bodyBold, fontSize: 15 },
});
