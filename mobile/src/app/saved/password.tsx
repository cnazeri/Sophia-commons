// Settings > Change password. The current password is checked first, so a phone left signed in cannot be used to take
// over the account. "Forgot it?" sends the usual reset email instead.
import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Field, FormMessage } from '@/components/form';
import { Body, Screen } from '@/components/ui';
import { changePassword, resetPassword, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

export default function PasswordScreen() {
  const { session } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const email = session?.user?.email || '';

  if (!session) return <Screen underHeader><Body muted>{t('app.settings_sign_in', 'Sign in to see your posts, change your password and manage your account.')}</Body></Screen>;

  const save = async () => {
    if (!cur) { setMsg({ text: t('app.pw_err_current', 'Please enter your current password.'), error: true }); return; }
    if (next.length < 8) { setMsg({ text: t('app.pw_err_short', 'The new password needs at least 8 characters.'), error: true }); return; }
    if (next !== again) { setMsg({ text: t('app.pw_err_match', 'The two new passwords are not the same.'), error: true }); return; }
    if (next === cur) { setMsg({ text: t('app.pw_err_same', 'The new password is the same as the current one.'), error: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await changePassword(email, cur, next);
      setDone(true); setCur(''); setNext(''); setAgain('');
      setMsg({ text: t('app.pw_done', 'Your password is changed. Use the new one on the app and sophiacommons.org.') });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally { setBusy(false); }
  };

  const forgot = async () => {
    try {
      await resetPassword(email);
      setMsg({ text: t('app.pw_reset_sent', 'We sent a reset link to {email}.').replace('{email}', email) });
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  };

  return (
    <Screen title={t('app.change_password', 'Change password')} underHeader>
      <Body muted>{t('app.pw_intro', 'This is the password for {email}, on the app and sophiacommons.org.').replace('{email}', email)}</Body>
      <Field label={t('app.pw_current', 'Current password')} value={cur} onChange={setCur} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" />
      <Field label={t('app.pw_new', 'New password')} value={next} onChange={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword"
        hint={t('app.pw_hint', 'At least 8 characters.')} />
      <Field label={t('app.pw_again', 'New password again')} value={again} onChange={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
      {msg ? <FormMessage text={msg.text} error={msg.error} /> : null}
      {done
        ? <Button label={t('app.done', 'Done')} onPress={() => router.back()} />
        : <Button label={busy ? t('app.sending', 'Sending...') : t('app.pw_save', 'Change password')} onPress={save} disabled={busy} />}
      <Button kind="secondary" label={t('app.pw_forgot', 'Forgot it? Email me a reset link')} onPress={forgot} />
    </Screen>
  );
}
