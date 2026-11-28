// Sign in or create a free account (same accounts as sophiacommons.org). Shown on the Chat tab when signed out.
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, H2 } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resetPassword, signIn, signUp } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { SITE } from '@/lib/supabase';

// chatIntro: the line about chat rooms (shown on the Chat tab, not on the Post forms)
// initialMode: open on "Create account" instead of "Sign in" (the sign-in screen's ?mode=signup)
export function AuthForm({ chatIntro = true, initialMode = 'signin' }: { chatIntro?: boolean; initialMode?: 'signin' | 'signup' } = {}) {
  const c = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newsletter, setNewsletter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const signup = mode === 'signup';

  const submit = async () => {
    if (!email.includes('@') || password.length < 6) {
      setMsg({ text: t('app.auth_check_fields', 'Enter your email and a password of at least 6 characters.'), error: true });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      if (signup) {
        const mustConfirm = await signUp(email, password, newsletter);
        if (mustConfirm) {
          setMsg({ text: t('auth.check_email', 'Check your email for a confirmation link, then sign in.'), error: false });
          setMode('signin');
        }
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      const m = (e as Error).message || '';
      setMsg({ text: /not confirmed/i.test(m) ? t('auth.not_confirmed', 'Please confirm your email first. Check your inbox for the link we sent.') : m, error: true });
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.includes('@')) { setMsg({ text: t('app.auth_reset_prompt', 'Enter your email above, then tap "Forgot password?" again.'), error: true }); return; }
    try {
      await resetPassword(email);
      setMsg({ text: t('app.auth_reset_sent', 'We sent you an email with a link to choose a new password.'), error: false });
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  };

  const input = [styles.input, { backgroundColor: c.elevated, borderColor: c.border, color: c.text }];
  return (
    <View style={styles.wrap}>
      <H2>{signup ? t('modal.title_signup', 'Create account') : t('modal.title_signin', 'Sign in')}</H2>
      {chatIntro ? <Body muted>{t('chat.gate_desc', 'Join conversations with anthroposophists worldwide across 9 topic rooms.')}</Body> : null}
      <TextInput value={email} onChangeText={setEmail} placeholder={t('modal.email_placeholder', 'you@example.com')} placeholderTextColor={c.textMuted}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" autoCorrect={false}
        accessibilityLabel={t('modal.email_label', 'Email address')} style={input} />
      <TextInput value={password} onChangeText={setPassword} placeholder={t('modal.password_label', 'Password')} placeholderTextColor={c.textMuted}
        secureTextEntry autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'}
        textContentType={signup ? 'newPassword' : 'password'} accessibilityLabel={t('modal.password_label', 'Password')}
        onSubmitEditing={submit} returnKeyType="go" style={input} />
      {signup ? (
        <View style={styles.row}>
          <Switch value={newsletter} onValueChange={setNewsletter} trackColor={{ true: c.gold }} accessibilityLabel={t('app.auth_newsletter', 'Send me the weekly newsletter')} />
          <Text style={[styles.small, { color: c.textSecondary, flex: 1 }]}>{t('app.auth_newsletter', 'Send me the weekly newsletter')}</Text>
        </View>
      ) : null}
      {msg ? <Text style={[styles.small, { color: msg.error ? '#B3261E' : c.goldText }]} accessibilityLiveRegion="polite">{msg.text}</Text> : null}
      <Button label={busy ? (signup ? t('auth.creating_account', 'Creating account...') : t('auth.signing_in', 'Signing in...'))
        : signup ? t('modal.btn_signup', 'Create account') : t('modal.btn_signin', 'Sign in')} onPress={submit} disabled={busy} />
      <Button kind="secondary" label={signup ? t('modal.have_account', 'Have an account?') + ' ' + t('modal.sign_in_link', 'Sign in')
        : t('modal.no_account', 'No account?') + ' ' + t('modal.create_free', 'Create one free')}
        onPress={() => { setMode(signup ? 'signin' : 'signup'); setMsg(null); }} />
      {!signup ? <Text onPress={forgot} accessibilityRole="button" style={[styles.link, { color: c.goldText }]}>{t('modal.forgot_password', 'Forgot password?')}</Text> : null}
      <Text style={[styles.small, { color: c.textMuted }]}>
        {t('app.auth_agree', 'By continuing you agree to the community guidelines and terms. Abusive or hateful messages are not allowed and lead to removal.')}{' '}
        <Text accessibilityRole="link" style={{ color: c.goldText }} onPress={() => WebBrowser.openBrowserAsync(SITE + '/guidelines')}>{t('app.guidelines', 'Guidelines')}</Text>
        {' · '}
        <Text accessibilityRole="link" style={{ color: c.goldText }} onPress={() => WebBrowser.openBrowserAsync(SITE + '/terms')}>{t('app.terms', 'Terms')}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, fontFamily: Fonts.body, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  small: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
  link: { fontFamily: Fonts.bodySemi, fontSize: 15, textAlign: 'center', paddingVertical: 6 },
});
