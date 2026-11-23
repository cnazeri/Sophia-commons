// Post a job. Needs a free account. Saved as a draft; it appears on the Jobs page once the owner approves it
// (in the app: Post > Review jobs). Jobs stay up for 90 days.
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { Button } from '@/components/button';
import { Field, FormMessage, Label } from '@/components/form';
import { ImageField } from '@/components/image-field';
import { Body, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { Picked } from '@/lib/images';
import { t } from '@/lib/i18n';
import { type JobIn, isEmail, postJob, webUrl } from '@/lib/post';

export default function PostJob() {
  const { session } = useAuth();
  const [f, setF] = useState<JobIn>({ title: '', description: '', location: '', region: '', country: '', url: '', email: '', phone: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [img, setImg] = useState<Picked | null>(null);
  const set = (k: keyof JobIn) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  if (!session) {
    return (
      <Screen title={t('app.post_job', 'Post a job')} underHeader>
        <Body muted>{t('app.post_sign_in', 'Sign in or create a free account to post. It is the same account as on sophiacommons.org.')}</Body>
        <AuthForm chatIntro={false} />
      </Screen>
    );
  }

  const send = async () => {
    const url = webUrl(f.url);
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = t('app.err_job_title', 'Please give the job title.');
    if (f.description.trim().length < 40) e.description = t('app.err_job_desc', 'Please describe the job in a few sentences.');
    if (!f.location.trim()) e.location = t('app.err_job_place', 'Please give the city, or write Remote.');
    if (url === null) e.url = t('app.err_url', 'Please enter a web address, for example example.org');
    if (f.email && !isEmail(f.email.trim())) e.email = t('app.err_email', 'Please enter a valid email address.');
    if (!url && !f.email.trim() && !f.phone.trim()) e.email = t('app.err_job_contact', 'Please give at least one way to apply: a link, an email or a phone number.');
    setErr(e);
    if (Object.keys(e).length) { setMsg({ text: t('app.err_check', 'Please check the fields marked in red.'), error: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await postJob({ ...f, title: f.title.trim(), description: f.description.trim(), location: f.location.trim(), region: f.region.trim(), country: f.country.trim(),
        url: url || '', email: f.email.trim(), phone: f.phone.trim() }, session, img);
      setDone(true);
      setMsg({ text: t('app.job_sent', 'Thank you. Your job will appear on the Jobs page after a quick review, usually within a day or two. It stays up for 90 days; we email you a week before it ends so you can renew it under Post > My posts.') });
    } catch (x) {
      setMsg({ text: t('app.err_send', 'Sorry, this could not be sent. Please try again, or email hello@sophiacommons.org.') + ' (' + (x as Error).message + ')', error: true });
    } finally { setBusy(false); }
  };

  return (
    <Screen title={t('app.post_job', 'Post a job')} underHeader>
      <Body muted>{t('app.job_intro', 'Jobs, training places and volunteer roles in Waldorf schools, farms, Camphill, clinics and other anthroposophical work.')}</Body>
      <Field label={t('app.f_job_title', 'Job title')} value={f.title} onChange={set('title')} error={err.title} placeholder={t('app.f_job_title_ph', 'Class teacher, grade 1')} maxLength={200} />
      <Field label={t('app.f_description', 'Description')} value={f.description} onChange={set('description')} error={err.description} multiline maxLength={10000}
        hint={t('app.f_job_desc_hint', 'Who you are, the role, hours, start date, and what you are looking for.')} />
      <ImageField label={t('app.img_job', 'Picture (optional)')} hint={t('app.img_job_hint', 'Your logo, the school or farm, or a flyer.')} value={img} onChange={setImg} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label={t('app.f_city', 'City')} value={f.location} onChange={set('location')} error={err.location} maxLength={200} /></View>
        <View style={{ flex: 1 }}><Field label={t('app.f_region', 'State or province')} value={f.region} onChange={set('region')} maxLength={120} /></View>
      </View>
      <Field label={t('app.f_country', 'Country')} value={f.country} onChange={set('country')} maxLength={120} />
      <Label>{t('app.f_how_apply', 'How to apply (at least one)')}</Label>
      <Field label={t('app.f_apply_link', 'Link to the job page')} value={f.url} onChange={set('url')} error={err.url} placeholder="example.org/jobs"
        autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
      <Field label={t('app.f_email', 'Email')} value={f.email} onChange={set('email')} error={err.email}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} />
      <Field label={t('app.f_phone', 'Phone')} value={f.phone} onChange={set('phone')} keyboardType="phone-pad" maxLength={40} />
      {msg ? <FormMessage text={msg.text} error={msg.error} /> : null}
      {done
        ? <Button label={t('app.done', 'Done')} onPress={() => router.back()} />
        : <Button label={busy ? t('app.sending', 'Sending...') : t('app.post_btn', 'Post')} onPress={send} disabled={busy} />}
    </Screen>
  );
}
