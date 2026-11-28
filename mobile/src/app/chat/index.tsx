// Board tab (2026-11-27, was the Community Chat): members post to the board and comment on posts. The folder stays
// 'chat' so links and the tab keep working. Signed out: the topics first, so people see what they would join, then
// one button to the shared sign-in screen and a link straight to "Create account".
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ALL, PostCard, TopicChips } from '@/components/board';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Body, Card, Screen, Wordmark } from '@/components/ui';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayName, useAuth } from '@/lib/auth';
import { type BoardPost, fetchPosts, TOPICS, topicLabel } from '@/lib/board';
import { clearBlocks, loadBlocks, useBlocked } from '@/lib/chat';
import { headingFont } from '@/lib/heading-font';
import { t } from '@/lib/i18n';
import { SITE } from '@/lib/supabase';

export default function BoardHome() {
  const c = useTheme();
  const { session, ready } = useAuth();
  const uid = session?.user?.id;

  useEffect(() => { if (uid) loadBlocks(); else clearBlocks(); }, [uid]);

  if (!ready) return <Screen><ActivityIndicator style={{ marginTop: 40 }} color={c.goldText} /></Screen>;
  if (!session) return <SignedOut />;
  return <BoardList />;
}

function BoardList() {
  const c = useTheme();
  const { session } = useAuth();
  const blocked = useBlocked();
  const [topic, setTopic] = useState(ALL);
  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const topicRef = useRef(ALL);   // the topic shown, so a slow answer for an earlier topic is dropped

  const load = useCallback(async (which: string) => {
    try {
      const rows = await fetchPosts(which === ALL ? undefined : which);
      if (topicRef.current === which) { setPosts(rows); setError(false); }
    } catch {
      if (topicRef.current === which) { setPosts((cur) => cur || []); setError(true); }
    }
  }, []);

  // Reload on coming back from a post (new comments, a deleted post) and on changing the topic
  useFocusEffect(useCallback(() => { load(topic); }, [load, topic]));

  const pick = (slug: string) => { topicRef.current = slug; setPosts(null); setTopic(slug); };
  const shown = useMemo(() => (posts || []).filter((p) => !blocked.has(p.user_id)), [posts, blocked]);
  const heading = t('board.heading', 'Community board');

  const header = (
    <View style={styles.head}>
      <Wordmark />
      <Text style={[styles.h1, { color: c.text, fontFamily: headingFont(heading) }]} accessibilityRole="header">{heading}</Text>
      <View style={styles.me}>
        <Body muted style={{ flex: 1 }} numberOfLines={1}>{t('chat.signed_in_as', 'Signed in as')} {displayName(session)}</Body>
        <Text onPress={() => router.push('/chat/account')} accessibilityRole="button" style={[styles.link, { color: c.goldText }]}>
          {t('app.account', 'Account')}
        </Text>
      </View>
      <Pressable onPress={() => router.push({ pathname: '/chat/new', params: topic === ALL ? {} : { topic } })} accessibilityRole="button"
        style={({ pressed }) => [styles.newBtn, { backgroundColor: c.gold, opacity: pressed ? 0.88 : 1 }]}>
        <Icon name="pen" size={18} color={c.onGold} />
        <Text style={[styles.newText, { color: c.onGold }]}>{t('board.new_post', 'New post')}</Text>
      </Pressable>
      <TopicChips value={topic} onChange={pick} />
      {topic !== ALL ? (
        <Pressable onPress={() => router.push({ pathname: '/chat/[room]', params: { room: topic } })} accessibilityRole="link" hitSlop={6} style={styles.archive}>
          <Text style={[styles.archiveText, { color: c.goldText }]}>{t('board.earlier_chat_in', 'Earlier chat in {topic}', { topic: topicLabel(topic) })}</Text>
          <Icon name="arrow" size={15} color={c.goldText} />
        </Pressable>
      ) : null}
    </View>
  );

  const empty = posts === null ? <ActivityIndicator style={{ marginTop: 32 }} color={c.goldText} /> : (
    <Body muted style={styles.empty}>
      {error ? t('board.load_error', 'Could not load the board. Pull down to try again.')
        : topic === ALL ? t('board.empty', 'No posts yet. Be the first to share something with the community.')
          : t('board.empty_topic', 'No posts in this topic yet. Start one.')}
    </Body>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={posts === null ? [] : shown}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <View style={styles.item}><PostCard p={item} /></View>}
        ListEmptyComponent={empty}
        ListFooterComponent={shown.length ? (
          <View style={styles.footer}>
            <Button kind="secondary" label={t('app.guidelines', 'Guidelines')} onPress={() => WebBrowser.openBrowserAsync(SITE + '/guidelines')} />
          </View>
        ) : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.goldText}
          onRefresh={async () => { setRefreshing(true); await load(topic); setRefreshing(false); }} />}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const PREVIEW_TOPICS = 6;

function SignedOut() {
  const c = useTheme();
  const more = TOPICS.length - PREVIEW_TOPICS;
  return (
    <Screen title={t('board.heading', 'Community board')}>
      <Body muted>{t('board.signed_out_intro', 'Posts and conversations with anthroposophists worldwide. Free membership.')}</Body>
      <Card style={styles.preview}>
        {TOPICS.slice(0, PREVIEW_TOPICS).map((x, i) => (
          <View key={x.slug} style={[styles.previewRow, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border } : null]}>
            <Text style={[styles.name, { color: c.text }]}>{topicLabel(x.slug)}</Text>
          </View>
        ))}
        {more > 0 ? (
          <View style={[styles.previewRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
            <Text style={[styles.desc, { color: c.textMuted }]}>{t('board.more_topics', 'and {n} more topics', { n: more })}</Text>
          </View>
        ) : null}
      </Card>
      <Button label={t('chat.sign_in_join', 'Sign in to join')} onPress={() => router.push('/chat/sign-in')} />
      <View style={styles.signup}>
        <Text style={[styles.desc, { color: c.textSecondary }]}>{t('modal.no_account', 'No account?')}</Text>
        <Pressable onPress={() => router.push({ pathname: '/chat/sign-in', params: { mode: 'signup' } })} accessibilityRole="link" style={styles.signupLink}>
          <Text style={[styles.link, { color: c.goldText }]}>{t('modal.create_free', 'Create one free')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  head: { gap: Spacing.md, paddingBottom: Spacing.md },
  h1: { fontSize: 26, lineHeight: 32, marginTop: Spacing.sm },
  item: { paddingBottom: Spacing.md },
  footer: { paddingTop: Spacing.sm },
  empty: { paddingVertical: Spacing.lg, textAlign: 'center' },
  me: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  link: { fontFamily: Fonts.bodyBold, fontSize: 15, paddingVertical: 6 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 999 },
  newText: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  archive: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, alignSelf: 'flex-start' },
  archiveText: { fontFamily: Fonts.bodyBold, fontSize: 14 },
  preview: { padding: 0, gap: 0, overflow: 'hidden' },
  previewRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  signup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  signupLink: { minHeight: 44, justifyContent: 'center' },
  name: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  desc: { fontFamily: Fonts.body, fontSize: 14 },
});
