// Settings (the bottom-right tab, owner 2026-11-22): Saved items, My posts, Change password and Account.
// Saved works without an account; the rest ask the member to sign in (same account as sophiacommons.org).
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { Body, Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayName, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { useSaved } from '@/lib/saved';

type Row = { href: Href; icon: keyof typeof MaterialIcons.glyphMap; title: string; desc: string };

export default function SettingsScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const saved = useSaved();
  const n = Object.keys(saved.events).length + Object.keys(saved.listings).length + Object.keys(saved.news || {}).length;

  const rows: Row[] = [
    { href: '/saved/list', icon: 'bookmark', title: t('app.saved_title', 'Saved'),
      desc: n ? t('app.settings_saved_n', '{n} saved events, places and articles').replace('{n}', String(n))
        : t('app.settings_saved_none', 'Events, places and articles you bookmark') },
  ];
  if (session) {
    rows.push(
      { href: '/saved/mine', icon: 'history', title: t('app.my_posts', 'My posts'),
        desc: t('app.settings_posts_desc', 'Your job posts, their status, and renewing them') },
      { href: '/saved/password', icon: 'lock', title: t('app.change_password', 'Change password'),
        desc: t('app.settings_password_desc', 'For the app and sophiacommons.org') },
      { href: '/saved/account', icon: 'person', title: t('app.account', 'Account'),
        desc: t('app.settings_account_desc', 'Sign out, blocked members, delete account') },
    );
  }

  return (
    <Screen title={t('app.tab_settings', 'Settings')}>
      {session ? <Body muted>{t('app.signed_in_as', 'Signed in as {name}').replace('{name}', displayName(session))}</Body> : null}
      {rows.map((r) => (
        <Pressable key={r.title} onPress={() => router.push(r.href)} accessibilityRole="button" accessibilityLabel={r.title + '. ' + r.desc}
          style={({ pressed }) => [styles.row, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.icon, { backgroundColor: c.surface }]}><MaterialIcons name={r.icon} size={24} color={c.goldText} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: c.text }]}>{r.title}</Text>
            <Text style={[styles.desc, { color: c.textSecondary }]}>{r.desc}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={c.textMuted} />
        </Pressable>
      ))}
      {!session ? (
        <>
          <Body muted>{t('app.settings_sign_in', 'Sign in to see your posts, change your password and manage your account.')}</Body>
          <AuthForm chatIntro={false} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bodyBold, fontSize: 17 },
  desc: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
});
