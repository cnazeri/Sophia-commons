// Settings > Send feedback (owner, 2026-11-23): a short note that comes to the owner (app_feedback table).
import { useState } from 'react';

import { Button } from '@/components/button';
import { Field, FormMessage } from '@/components/form';
import { Body, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { FEEDBACK_MAX, sendFeedback } from '@/lib/feedback';
import { t } from '@/lib/i18n';
import { isEmail } from '@/lib/post';

export default function FeedbackScreen() {
  const { session } = useAuth();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<{ message?: string; email?: string }>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const send = async () => {
    const e: { message?: string; email?: string } = {};
    if (message.trim().length < 3) e.message = t('app.feedback_err_empty', 'Please write a few words.');
    if (email.trim() && !isEmail(email.trim())) e.email = t('app.err_email', 'Please enter a valid email address.');
    setErr(e);
    if (e.message || e.email) return;
    setBusy(true); setMsg(null);
    try {
      await sendFeedback(message, email, session);
      setDone(true);
      setMsg({ text: t('app.feedback_thanks', 'Thank you. Every note is read.') });
    } catch {
      setMsg({ text: t('app.err_send', 'Sorry, this could not be sent. Please try again, or email hello@sophiacommons.org.'), error: true });
    } finally { setBusy(false); }
  };

  return (
    <Screen underHeader title={t('app.feedback_title', 'Send feedback')}>
      <Body muted>{t('app.feedback_intro', 'What could be better, what is missing, or what you like. It comes straight to the people who make Sophia Commons.')}</Body>
      {done ? null : (
        <>
          <Field label={t('app.feedback_label', 'Your note')} value={message} onChange={(v) => setMessage(v.slice(0, FEEDBACK_MAX))} error={err.message} multiline />
          {session ? null : (
            <Field label={t('app.feedback_email', 'Your email (optional, if you would like a reply)')} value={email} onChange={setEmail} error={err.email}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          )}
          <Button label={busy ? t('app.sending', 'Sending...') : t('app.send', 'Send')} onPress={send} disabled={busy} />
        </>
      )}
      {msg ? <FormMessage text={msg.text} error={msg.error} /> : null}
    </Screen>
  );
}
