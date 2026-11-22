// Account: who is signed in, blocked members (unblock), guidelines, sign out, and delete the account.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, H2, Screen } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount, displayName, signOut, useAuth } from '@/lib/auth';
import { unblockMember, useBlocked } from '@/lib/chat';
import { t } from '@/lib/i18n';
import { SITE, supabase } from '@/lib/supabase';

export default function AccountScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const me = session?.user?.id || '';
  const blocked = useBlocked();
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Names for blocked members, from their latest chat message
  useEffect(() => {
    const ids = [...blocked];
    if (!ids.length) return;
    let alive = true;
    supabase.from('chat_messages').select('user_id,username').in('user_id', ids).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        if (!alive) return;
        const out: Record<string, string> = {};
        (data || []).forEach((r: { user_id: string; username: string | null }) => { if (!out[r.user_id] && r.username) out[r.user_id] = r.username; });
        setNames(out);
      });
    return () => { alive = false; };
  }, [blocked]);

  if (!session) {
    return <Screen><Body muted>{t('chat.sign_in_btn', 'Sign in to Chat')}</Body><Button label={t('app.back', 'Back')} onPress={() => router.back()} /></Screen>;
  }

  const askDelete = () => {
    Alert.alert(t('app.delete_account_title', 'Delete your account?'),
      t('app.delete_account_desc', 'This deletes your Sophia Commons account and your chat messages for good, on the app and the website. It cannot be undone.'), [
        { text: t('app.cancel', 'Cancel'), style: 'cancel' },
        { text: t('app.delete_account', 'Delete account'), style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            await deleteAccount();
            Alert.alert(t('app.delete_account_done', 'Your account has been deleted.'));
            router.replace('/chat');
          } catch (e) {
            Alert.alert((e as Error).message);
          } finally { setBusy(false); }
        } },
      ]);
  };

  const ids = [...blocked];
  return (
    <Screen underHeader>
      <Body>{t('chat.signed_in_as', 'Signed in as')} <Text style={{ fontFamily: Fonts.bodyBold, color: c.text }}>{displayName(session)}</Text> ({session.user.email})</Body>
      <Button kind="secondary" label={t('app.sign_out', 'Sign out')} onPress={async () => { await signOut(); router.replace('/chat'); }} />

      <H2>{t('app.blocked_title', 'Blocked members')}</H2>
      {ids.length ? ids.map((id) => (
        <View key={id} style={[styles.row, { borderColor: c.border }]}>
          <Text style={[styles.name, { color: c.text }]}>{names[id] || t('app.member', 'Member')}</Text>
          <Text accessibilityRole="button" onPress={() => unblockMember(me, id).catch(() => {})} style={[styles.link, { color: c.goldText }]}>{t('app.unblock', 'Unblock')}</Text>
        </View>
      )) : <Body muted>{t('app.blocked_none', 'You have not blocked anyone. Press and hold a chat message to report it or block its writer.')}</Body>}

      <H2>{t('app.guidelines', 'Guidelines')}</H2>
      <Body muted>{t('app.guidelines_desc', 'Be kind and stay on topic. Reported messages are reviewed within 24 hours, and abusive members are removed.')}</Body>
      <Button kind="secondary" label={t('app.guidelines', 'Guidelines')} onPress={() => WebBrowser.openBrowserAsync(SITE + '/guidelines')} />

      <H2>{t('app.delete_account', 'Delete account')}</H2>
      <Body muted>{t('app.delete_account_desc', 'This deletes your Sophia Commons account and your chat messages for good, on the app and the website. It cannot be undone.')}</Body>
      <Button kind="danger" label={busy ? '...' : t('app.delete_account', 'Delete account')} onPress={askDelete} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  name: { fontFamily: Fonts.bodySemi, fontSize: 15 },
  link: { fontFamily: Fonts.bodyBold, fontSize: 15, paddingVertical: 4 },
});
