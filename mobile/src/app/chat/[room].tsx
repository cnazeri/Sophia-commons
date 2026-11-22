// One chat room: live messages, newest at the bottom, and a box to write.
// Long-press a message: Report or Block for others' messages, Delete for your own.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayName, useAuth } from '@/lib/auth';
import {
  blockMember, deleteMessage, fetchMessages, hasBlockedWords, MAX_LEN, type Message, reportMessage, ROOMS,
  sendMessage, subscribeRoom, useBlocked,
} from '@/lib/chat';
import { localTime, t } from '@/lib/i18n';

export default function RoomScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { room } = useLocalSearchParams<{ room: string }>();
  const meta = ROOMS.find((r) => r.name === room);
  const { session } = useAuth();
  const me = session?.user?.id || '';
  const blocked = useBlocked();
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!meta || !me) return;
    let alive = true;
    fetchMessages(meta.name).then((r) => { if (alive) setMsgs(r); }).catch(() => { if (alive) { setMsgs([]); setNote(t('app.chat_load_error', 'Could not load messages. Try again in a moment.')); } });
    const stop = subscribeRoom(meta.name,
      (m) => setMsgs((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur)),
      (id) => setMsgs((cur) => (cur ? cur.filter((x) => x.id !== id) : cur)));
    return () => { alive = false; stop(); };
  }, [meta, me]);

  // Newest first for the inverted list; blocked members' messages are hidden
  const shown = useMemo(() => (msgs || []).filter((m) => !m.user_id || !blocked.has(m.user_id)).slice().reverse(), [msgs, blocked]);

  const send = async () => {
    const body = text.trim();
    if (!body || !meta || !session) return;
    if (hasBlockedWords(body)) { setNote(t('app.chat_filtered', 'That message contains words that are not allowed here. Please rephrase it.')); return; }
    setSending(true); setNote('');
    try {
      const m = await sendMessage(meta.name, body, displayName(session), me);
      setMsgs((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur));
      setText('');
    } catch {
      setNote(t('app.chat_send_error', 'Your message was not sent. Check your connection and try again.'));
    } finally {
      setSending(false);
    }
  };

  const report = (m: Message) => {
    const done = (reason: string) => reportMessage(m, me, reason)
      .then(() => Alert.alert(t('app.chat_reported', 'Thank you. The message was reported and will be reviewed within 24 hours.'), '', [
        { text: t('app.chat_block', 'Block member'), onPress: () => block(m) },
        { text: 'OK' },
      ]))
      .catch(() => Alert.alert(t('app.chat_report_error', 'The report could not be sent. Please try again.')));
    Alert.alert(t('app.chat_report_title', 'Report message'), t('app.chat_report_why', 'Why are you reporting it?'), [
      { text: t('app.chat_reason_abuse', 'Abusive or hateful'), onPress: () => done('harassment') },
      { text: t('app.chat_reason_spam', 'Spam'), onPress: () => done('spam') },
      { text: t('app.cancel', 'Cancel'), style: 'cancel' },
    ]);
  };

  const block = (m: Message) => {
    if (!m.user_id) return;
    Alert.alert(t('app.chat_block_title', 'Block {name}?', { name: m.username || 'member' }),
      t('app.chat_block_desc', "You won't see their messages any more. You can unblock them under Account."), [
        { text: t('app.cancel', 'Cancel'), style: 'cancel' },
        { text: t('app.chat_block', 'Block member'), style: 'destructive', onPress: () => { blockMember(me, String(m.user_id)).catch(() => {}); } },
      ]);
  };

  const actions = (m: Message) => {
    if (m.user_id === me) {
      Alert.alert(t('app.chat_your_message', 'Your message'), '', [
        { text: t('app.cancel', 'Cancel'), style: 'cancel' },
        { text: t('app.delete', 'Delete'), style: 'destructive', onPress: () => deleteMessage(m.id).then(() => setMsgs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur))).catch(() => {}) },
      ]);
    } else {
      Alert.alert(m.username || 'member', '', [
        { text: t('app.chat_report_title', 'Report message'), onPress: () => report(m) },
        { text: t('app.chat_block', 'Block member'), onPress: () => block(m) },
        { text: t('app.cancel', 'Cancel'), style: 'cancel' },
      ]);
    }
  };

  if (!meta) return <View style={[styles.center, { backgroundColor: c.background }]}><Body muted>{t('app.chat_no_room', 'This room does not exist.')}</Body></View>;
  if (!session) return <View style={[styles.center, { backgroundColor: c.background }]}><Body muted>{t('chat.sign_in_btn', 'Sign in to Chat')}</Body></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen options={{ title: '# ' + meta.name }} />
      {msgs === null ? <ActivityIndicator style={{ marginTop: 40 }} color={c.goldText} /> : (
        <FlatList
          inverted
          data={shown}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={<Body muted style={styles.desc}>{t('chat.room_' + meta.key + '_desc', meta.desc)}</Body>}
          ListEmptyComponent={<Body muted style={styles.desc}>{t('chat.empty_room', 'No messages here yet. Say hello and start the conversation.')}</Body>}
          renderItem={({ item: m }) => {
            const mine = m.user_id === me;
            return (
              <Pressable onLongPress={() => actions(m)} delayLongPress={350} accessibilityHint={t('app.chat_hold_hint', 'Press and hold for options')}
                accessibilityLabel={(m.username || 'member') + ': ' + m.content}
                style={[styles.msg, mine ? styles.mine : null, { backgroundColor: mine ? c.surface : c.elevated, borderColor: c.border }]}>
                <View style={styles.metaRow}>
                  <Text style={[styles.name, { color: mine ? c.goldText : c.text }]}>{m.username || 'member'}</Text>
                  <Text style={[styles.time, { color: c.textMuted }]}>{localTime(m.created_at)}</Text>
                  {!mine ? (
                    <Pressable onPress={() => actions(m)} accessibilityRole="button" accessibilityLabel={t('app.chat_options', 'Message options')} hitSlop={10} style={styles.moreBtn}>
                      <Text style={[styles.more, { color: c.textMuted }]}>...</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={[styles.text, { color: c.text }]} selectable>{m.content}</Text>
              </Pressable>
            );
          }}
        />
      )}
      {note ? <Text style={[styles.note, { color: '#B3261E' }]} accessibilityLiveRegion="polite">{note}</Text> : null}
      <View style={[styles.bar, { borderTopColor: c.border, backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, Spacing.sm) + (Platform.OS === 'ios' ? 56 : 64) }]}>
        <TextInput value={text} onChangeText={setText} maxLength={MAX_LEN} multiline
          placeholder={t('chat.input_placeholder', 'message # {room} as {username}...').replace('{room}', meta.name).replace('{username}', displayName(session))}
          placeholderTextColor={c.textMuted} accessibilityLabel={t('app.chat_write', 'Write a message')}
          style={[styles.input, { backgroundColor: c.elevated, borderColor: c.border, color: c.text }]} />
        <Pressable onPress={send} disabled={sending || !text.trim()} accessibilityRole="button" accessibilityLabel={t('chat.send_btn', 'send')}
          style={({ pressed }) => [styles.send, { backgroundColor: c.gold, opacity: sending || !text.trim() ? 0.5 : pressed ? 0.85 : 1 }]}>
          <Text style={[styles.sendTxt, { color: c.onGold }]}>{t('chat.send_btn', 'send')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { padding: Spacing.md, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  desc: { textAlign: 'center', paddingVertical: Spacing.md },
  msg: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4, maxWidth: '88%', alignSelf: 'flex-start' },
  mine: { alignSelf: 'flex-end' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontFamily: Fonts.bodyBold, fontSize: 13.5 },
  time: { fontFamily: Fonts.body, fontSize: 12 },
  moreBtn: { marginLeft: 'auto', paddingHorizontal: 4 },
  more: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  text: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 22 },
  note: { fontFamily: Fonts.body, fontSize: 13.5, paddingHorizontal: Spacing.lg, paddingBottom: 4 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontFamily: Fonts.body, fontSize: 16 },
  send: { height: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontFamily: Fonts.bodyBold, fontSize: 15 },
});
