// The newsletter on Home (owner, 2026-11-25, after h2DrawNewsletter on the website): the latest weekly issue, which
// opens in the app, and a one-line sign-up through the website's newsletter function (double opt-in).
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Section, SectionHead } from '@/components/redesign';
import { Kicker } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Digest, EMAIL_RE, subscribeNewsletter } from '@/lib/home';
import { localDate, t } from '@/lib/i18n';

type State = 'idle' | 'sending' | 'sent' | 'saved_later' | 'error';
// Error red with AA contrast on each theme's card
const DANGER = { light: '#B3261E', dark: '#F2B8B5' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SignUp() {
  const c = useTheme();
  const danger = DANGER[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState('');
  const send = async () => {
    const v = email.trim();
    if (!v) { setErr(t('newsletter.error_empty', 'Please enter your email address.')); return; }
    if (!EMAIL_RE.test(v)) { setErr(t('newsletter.error_invalid', 'Please enter a valid email address.')); return; }
    setErr('');
    setState('sending');
    const r = await subscribeNewsletter(v).catch(() => 'failed' as const);
    if (r === 'sent' || r === 'saved_later') { setState(r); return; }
    setState('idle');
    setErr(r === 'invalid' ? t('newsletter.error_invalid', 'Please enter a valid email address.') : t('newsletter.error_failed', 'Subscription failed. Please try again.'));
  };
  if (state === 'sent' || state === 'saved_later') {
    const msg = state === 'sent' ? t('newsletter.check_inbox', 'Almost done: check your inbox and click the link to confirm.')
      : t('newsletter.saved_later', "Thank you, you're on the list. We'll email you to confirm soon.");
    return <Text style={[styles.small, { color: c.sage }]} accessibilityRole="alert">{msg}</Text>;
  }
  const busy = state === 'sending';
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.signTitle, { color: c.text }]}>{t('newsletter.card_heading', 'Get the weekly digest')}</Text>
      <View style={styles.signRow}>
        <TextInput value={email} onChangeText={setEmail} onSubmitEditing={send} returnKeyType="send" editable={!busy}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
          placeholder={t('newsletter.placeholder', 'your@email.com')} placeholderTextColor={c.textMuted}
          accessibilityLabel={t('footer.newsletter_label', 'Your email address')}
          style={[styles.input, { color: c.text, borderColor: err ? danger : c.border, backgroundColor: c.background }]} />
        <Pressable onPress={send} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.btn, { backgroundColor: c.gold, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
          <Text style={[styles.btnText, { color: c.onGold }]}>
            {busy ? t('newsletter.subscribing', 'Subscribing...') : cap(t('newsletter.subscribe_btn', 'subscribe'))}
          </Text>
        </Pressable>
      </View>
      {err ? <Text style={[styles.small, { color: danger }]} accessibilityRole="alert">{err}</Text> : null}
    </View>
  );
}

/** The newsletter: this week's issue and the sign-up line. Without an issue, the sign-up stands alone. */
export function NewsletterSection({ digest }: { digest: Digest | null }) {
  const c = useTheme();
  const open = () => digest && router.push({ pathname: '/article/[id]', params: { id: digest.id } });
  return (
    <Section>
      <SectionHead title={t('home2.newsletter', 'The newsletter')} />
      <View style={[styles.card, { backgroundColor: c.elevated, borderColor: c.border }]}>
        {digest ? (
          <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={digest.title + '. ' + t('home2.read_issue', "Read this week's issue")}
            style={({ pressed }) => [{ gap: 4, opacity: pressed ? 0.85 : 1 }]}>
            <Kicker>{localDate(digest.published_at, { weekday: 'long', month: 'long', day: 'numeric' })}</Kicker>
            <Text style={[styles.title, { color: c.text }]}>{digest.title}</Text>
            {digest.excerpt ? <Text style={[styles.small, { color: c.textSecondary }]} numberOfLines={3}>{digest.excerpt}</Text> : null}
            <View style={styles.link}>
              <Text style={[styles.linkText, { color: c.goldText }]}>{t('home2.read_issue', "Read this week's issue")}</Text>
              <Icon name="arrow" size={15} color={c.goldText} />
            </View>
          </Pressable>
        ) : null}
        <View style={digest ? [styles.split, { borderTopColor: c.border }] : null}><SignUp /></View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: Spacing.lg, gap: Spacing.md },
  title: { fontFamily: Fonts.bodyBold, fontSize: 17, lineHeight: 22 },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  linkText: { fontFamily: Fonts.bodyBold, fontSize: 14 },
  split: { borderTopWidth: 1, paddingTop: Spacing.md },
  signTitle: { fontFamily: Fonts.bodyBold, fontSize: 14.5 },
  signRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 16, fontFamily: Fonts.body, fontSize: 15 },
  btn: { minHeight: 46, paddingHorizontal: 18, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.bodyBold, fontSize: 15 },
});
