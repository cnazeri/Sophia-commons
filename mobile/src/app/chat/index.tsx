// Chat tab: sign in, then pick one of the nine community rooms (the same rooms as the website).
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { Button } from '@/components/button';
import { Body, Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayName, useAuth } from '@/lib/auth';
import { clearBlocks, loadBlocks, ROOMS } from '@/lib/chat';
import { t } from '@/lib/i18n';
import { SITE } from '@/lib/supabase';

export default function ChatHome() {
  const c = useTheme();
  const { session, ready } = useAuth();
  const uid = session?.user?.id;

  useEffect(() => { if (uid) loadBlocks(); else clearBlocks(); }, [uid]);

  if (!ready) return <Screen><ActivityIndicator style={{ marginTop: 40 }} color={c.goldText} /></Screen>;
  if (!session) return <Screen title={t('chat.heading', 'Community Chat')}><AuthForm /></Screen>;

  return (
    <Screen title={t('chat.heading', 'Community Chat')}>
      <View style={styles.me}>
        <Body muted style={{ flex: 1 }}>{t('chat.signed_in_as', 'Signed in as')} {displayName(session)}</Body>
        <Text onPress={() => router.push('/chat/account')} accessibilityRole="button" style={[styles.link, { color: c.goldText }]}>
          {t('app.account', 'Account')}
        </Text>
      </View>
      {ROOMS.map((r) => (
        <Pressable key={r.name} onPress={() => router.push({ pathname: '/chat/[room]', params: { room: r.name } })}
          accessibilityRole="link" accessibilityLabel={r.name + ', ' + t('chat.room_' + r.key + '_desc', r.desc)}
          style={({ pressed }) => [styles.room, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[styles.name, { color: c.text }]}>{t('chat.room_' + r.key, '# ' + r.name)}</Text>
          <Text style={[styles.desc, { color: c.textMuted }]}>{t('chat.room_' + r.key + '_desc', r.desc)}</Text>
        </Pressable>
      ))}
      <Button kind="secondary" label={t('app.guidelines', 'Guidelines')} onPress={() => WebBrowser.openBrowserAsync(SITE + '/guidelines')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  link: { fontFamily: Fonts.bodyBold, fontSize: 15, paddingVertical: 6 },
  room: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 2 },
  name: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  desc: { fontFamily: Fonts.body, fontSize: 14 },
});
