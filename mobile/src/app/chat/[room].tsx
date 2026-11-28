// Earlier chat (2026-11-27): the Community chat became the board, and each old room's messages stay readable here,
// read-only: the newest 100, oldest first. No sending. Old /chat/<room> links land here too.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Body } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { topicLabel } from '@/lib/board';
import { fetchMessages, type Message, ROOMS, useBlocked } from '@/lib/chat';
import { localDate, localTime, t } from '@/lib/i18n';

const ARCHIVE_SIZE = 100;

export default function ChatArchive() {
  const c = useTheme();
  const { room } = useLocalSearchParams<{ room: string }>();
  const meta = ROOMS.find((r) => r.name === room);
  const { session } = useAuth();
  const me = session?.user?.id || '';
  const blocked = useBlocked();
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!meta || !me) return;
    let alive = true;
    fetchMessages(meta.name, ARCHIVE_SIZE)
      .then((r) => { if (alive) setMsgs(r); })
      .catch(() => { if (alive) { setMsgs([]); setError(true); } });
    return () => { alive = false; };
  }, [meta, me]);

  const shown = useMemo(() => (msgs || []).filter((m) => !m.user_id || !blocked.has(m.user_id)), [msgs, blocked]);

  if (!meta) return <View style={[styles.center, { backgroundColor: c.background }]}><Body muted>{t('app.chat_no_room', 'This room does not exist.')}</Body></View>;
  if (!session) return <View style={[styles.center, { backgroundColor: c.background }]}><Body muted>{t('board.sign_in_first_read', 'Please sign in to read the board.')}</Body></View>;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t('board.earlier_chat', 'Earlier chat') }} />
      {msgs === null ? <ActivityIndicator style={{ marginTop: 40 }} color={c.goldText} /> : (
        <FlatList
          data={shown}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Body muted style={styles.intro}>
              {t('board.archive_intro', 'Messages from the earlier {topic} chat room, kept to read. To join the conversation, post on the board.', { topic: topicLabel(meta.name) })}
            </Body>
          }
          ListEmptyComponent={<Body muted style={styles.intro}>{error ? t('app.chat_load_error', 'Could not load messages. Try again in a moment.') : t('board.archive_empty', 'There were no messages in this room.')}</Body>}
          renderItem={({ item: m }) => {
            const mine = m.user_id === me;
            return (
              <View accessible accessibilityLabel={(m.username || 'member') + ': ' + m.content}
                style={[styles.msg, { backgroundColor: mine ? c.surface : c.elevated, borderColor: c.border }]}>
                <View style={styles.metaRow}>
                  <Text style={[styles.name, { color: mine ? c.goldText : c.text }]}>{m.username || 'member'}</Text>
                  <Text style={[styles.time, { color: c.textMuted }]}>{localDate(m.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}, {localTime(m.created_at)}</Text>
                </View>
                <Text style={[styles.text, { color: c.text }]} selectable>{m.content}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { padding: Spacing.md, paddingBottom: 96, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  intro: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
  msg: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  name: { fontFamily: Fonts.bodyBold, fontSize: 13.5 },
  time: { fontFamily: Fonts.body, fontSize: 12 },
  text: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 22 },
});
