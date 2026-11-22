// Write a community post: news, a reflection, a question or an offer. Needs a free account. Saved as pending; it is
// published on the app's Home screen and sophiacommons.org/blog once the editor approves it (Admin > Blog).
import { router } from 'expo-router';
import { useState } from 'react';

import { AuthForm } from '@/components/auth-form';
import { Button } from '@/components/button';
import { Field, FormMessage } from '@/components/form';
import { Body, Screen } from '@/components/ui';
import { displayName, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { type CommunityIn, postCommunity } from '@/lib/post';

export default function PostCommunity() {
  const { session } = useAuth();
  const [f, setF] = useState<CommunityIn>({ title: '', body: '', tags: '' });
  const [author, setAuthor] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof CommunityIn) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  if (!session) {
    return (
      <Screen title={t('app.post_community', 'Write a community post')} underHeader>
        <Body muted>{t('app.post_sign_in', 'Sign in or create a free account to post. It is the same account as on sophiacommons.org.')}</Body>
        <AuthForm chatIntro={false} />
      </Screen>
    );
  }

  const send = async () => {
    const e: Record<string, string> = {};
    if (author.trim().length < 2) e.author = t('app.err_author', 'Please give the name to show with your post.');
    if (f.title.trim().length < 3) e.title = t('app.err_post_title', 'Please add a title.');
    if (f.body.trim().length < 50) e.body = t('app.err_post_body', 'The post needs at least 50 characters.');
    setErr(e);
    if (Object.keys(e).length) { setMsg({ text: t('app.err_check', 'Please check the fields marked in red.'), error: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await postCommunity({ ...f, title: f.title.trim(), body: f.body.trim() }, author.trim());
      setDone(true);
      setMsg({ text: t('app.community_sent', 'Thank you. Your post will appear after the editor reviews it, usually within a few days.') });
    } catch (x) {
      setMsg({ text: t('app.err_send', 'Sorry, this could not be sent. Please try again, or email hello@sophiacommons.org.') + ' (' + (x as Error).message + ')', error: true });
    } finally { setBusy(false); }
  };

  return (
    <Screen title={t('app.post_community', 'Write a community post')} underHeader>
      <Body muted>{t('app.community_intro', 'Share news from your school, farm or group, a reflection, a question, or something you offer. Please keep it kind and on topic.')}</Body>
      <Field label={t('app.f_author', 'Your name, as shown with the post')} value={author} onChange={setAuthor} error={err.author}
        placeholder={displayName(session)} maxLength={80} />
      <Field label={t('app.f_title', 'Title')} value={f.title} onChange={set('title')} error={err.title} maxLength={200} />
      <Field label={t('app.f_post_body', 'Your post')} value={f.body} onChange={set('body')} error={err.body} multiline maxLength={60000} />
      <Field label={t('app.f_tags', 'Topics (optional)')} value={f.tags} onChange={set('tags')} hint={t('app.f_tags_hint', 'Separated by commas, like: waldorf, festivals')}
        autoCapitalize="none" maxLength={200} />
      {msg ? <FormMessage text={msg.text} error={msg.error} /> : null}
      {done
        ? <Button label={t('app.done', 'Done')} onPress={() => router.back()} />
        : <Button label={busy ? t('app.sending', 'Sending...') : t('app.post_btn', 'Post')} onPress={send} disabled={busy} />}
    </Screen>
  );
}
