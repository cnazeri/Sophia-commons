// Settings (the bottom-right tab, owner 2026-11-22): Saved items, My posts, Change password and Account.
// Saved, My posts and the rest need a signed-in account (owner, 2026-11-23: saving is for members only).
// Home page settings work without one, and so do Privacy, Send feedback and Rate Sophia Commons (owner, 2026-11-23).
// 2026-11-24 redesign: an account card on top (signed out: one button to the sign-in screen, no inline form), every
// setting in one grouped list, and the app version with Guidelines and Terms at the bottom.
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { type Href, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { GOLD_TINT } from '@/components/redesign';
import { Card, Screen } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isAdmin } from '@/lib/admin';
import { displayName, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { openStorePage, storePageUrl } from '@/lib/review';
import { useSaved } from '@/lib/saved';
import { SITE } from '@/lib/supabase';

type Row = { href?: Href; onPress?: () => void; icon: IconName; title: string; desc: string };

const APP_VERSION = Application.nativeApplicationVersion || Constants.expoConfig?.version || '';

export default function SettingsScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const saved = useSaved();
  const n = Object.keys(saved.events).length + Object.keys(saved.listings).length + Object.keys(saved.news || {}).length;

  const rows: Row[] = [
    { href: '/saved/list', icon: 'heart', title: t('app.saved_title', 'Saved'),
      desc: n ? t('app.settings_saved_n', '{n} saved events, places and articles').replace('{n}', String(n))
        : t('app.settings_saved_none', 'Events, places and articles you save with the heart') },
    { href: '/saved/home', icon: 'home', title: t('app.home_page', 'Home page'),
      desc: t('app.settings_home_desc', 'Show or hide the festival card and the Calendar of the Soul') },
  ];
  if (session) {
    rows.push(
      { href: '/saved/mine', icon: 'post', title: t('app.my_posts', 'My posts'),
        desc: t('app.settings_posts_desc', 'Your job posts, their status, and renewing them') },
      { href: '/saved/password', icon: 'lock', title: t('app.change_password', 'Change password'),
        desc: t('app.settings_password_desc', 'For the app and sophiacommons.org') },
      { href: '/saved/account', icon: 'person', title: t('app.account', 'Account'),
        desc: t('app.settings_account_desc', 'Sign out, blocked members, delete account') },
    );
  }
  if (isAdmin(session)) {
    rows.push({ href: '/saved/admin', icon: 'flag', title: t('app.admin_title', 'Admin'),
      desc: t('app.settings_admin_desc', 'Review listings, events, jobs, memorials and reports') });
  }
  rows.push(
    { href: '/saved/privacy', icon: 'shield', title: t('app.privacy_title', 'Privacy'),
      desc: t('app.settings_privacy_desc', 'Anonymous usage statistics') },
    { href: '/saved/feedback', icon: 'chat', title: t('app.feedback_title', 'Send feedback'),
      desc: t('app.settings_feedback_desc', 'Tell us what could be better') },
  );
  // Opens the store page (Google asks that a button never calls the in-app rating card). Hidden until the store page exists.
  if (storePageUrl()) {
    rows.push({ onPress: () => { openStorePage().catch(() => {}); }, icon: 'star', title: t('app.rate_app', 'Rate Sophia Commons'),
      desc: t('app.settings_rate_desc', 'A review in the store helps others find the app') });
  }

  const name = session ? displayName(session) : '';
  return (
    <Screen title={t('app.tab_settings', 'Settings')}>
      <Card style={styles.account}>
        <View style={[styles.avatar, { backgroundColor: GOLD_TINT }]}>
          {session ? <Text style={[styles.initials, { color: c.goldText }]}>{name.slice(0, 2).toUpperCase()}</Text>
            : <Icon name="person" size={24} color={c.goldText} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{session ? name : t('app.not_signed_in', 'Not signed in')}</Text>
          <Text style={[styles.desc, { color: c.textSecondary }]} numberOfLines={1}>
            {session ? session.user.email : t('app.account_card_desc', 'Save events, post, and join the chat')}
          </Text>
        </View>
      </Card>
      {!session ? (
        <Button label={t('app.sign_in_or_create', 'Sign in or create a free account')} onPress={() => router.push('/saved/sign-in')} />
      ) : null}

      <Card style={styles.list}>
        {rows.map((r, i) => (
          <Fragment key={r.title}>
            {i ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
            <Pressable onPress={() => (r.onPress ? r.onPress() : r.href && router.push(r.href))} accessibilityRole="button" accessibilityLabel={r.title + '. ' + r.desc}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface : 'transparent' }]}>
              <View style={[styles.icon, { backgroundColor: GOLD_TINT }]}><Icon name={r.icon} size={20} color={c.goldText} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.title, { color: c.text }]}>{r.title}</Text>
                <Text style={[styles.desc, { color: c.textSecondary }]}>{r.desc}</Text>
              </View>
              <Icon name="chevron" size={18} color={c.textMuted} />
            </Pressable>
          </Fragment>
        ))}
      </Card>

      <View style={styles.footer}>
        <Text style={[styles.small, { color: c.textMuted }]}>Sophia Commons{APP_VERSION ? ' ' + APP_VERSION : ''}</Text>
        <Text style={[styles.small, { color: c.textMuted }]} accessible={false}>·</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(SITE + '/guidelines')} accessibilityRole="link" style={styles.footLink}>
          <Text style={[styles.small, { color: c.goldText }]}>{t('app.guidelines', 'Guidelines')}</Text>
        </Pressable>
        <Text style={[styles.small, { color: c.textMuted }]} accessible={false}>·</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(SITE + '/terms')} accessibilityRole="link" style={styles.footLink}>
          <Text style={[styles.small, { color: c.goldText }]}>{t('app.terms', 'Terms')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: Fonts.bodyBold, fontSize: 17 },
  list: { padding: 0, gap: 0, overflow: 'hidden', marginTop: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 + 38 + Spacing.md },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bodyBold, fontSize: 16 },
  desc: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 6 },
  footLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  small: { fontFamily: Fonts.body, fontSize: 13.5 },
});
