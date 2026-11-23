// Suggest a place for the directory. No account needed; it goes to the owner's review queue (Admin > Pending Listings).
import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { Field, FormMessage, Label } from '@/components/form';
import { ImageField } from '@/components/image-field';
import { Body, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CATEGORIES } from '@/lib/directory';
import type { Picked } from '@/lib/images';
import { t } from '@/lib/i18n';
import { isEmail, postPlace, webUrl } from '@/lib/post';

export default function PostPlace() {
  const [f, setF] = useState({ name: '', category: '', url: '', location: '', description: '', email: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { session } = useAuth();
  const [img, setImg] = useState<Picked | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const send = async () => {
    const url = webUrl(f.url);
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = t('app.err_name', 'Please give the name.');
    if (!f.category) e.category = t('app.err_category', 'Please choose a category.');
    if (url === null) e.url = t('app.err_url', 'Please enter a web address, for example example.org');
    if (!f.location.trim()) e.location = t('app.err_location', 'Please give the city, state and country.');
    if (f.email && !isEmail(f.email.trim())) e.email = t('app.err_email', 'Please enter a valid email address.');
    setErr(e);
    if (Object.keys(e).length) { setMsg({ text: t('app.err_check', 'Please check the fields marked in red.'), error: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const label = CATEGORIES.find((x) => x.key === f.category)?.label || f.category;
      await postPlace({ ...f, name: f.name.trim(), category: label, url: url || '', location: f.location.trim(), email: f.email.trim() }, img, session);
      setDone(true);
      setMsg({ text: t('app.place_sent', 'Thank you. We will check the place and add it to the directory, usually within a few days.') });
    } catch (x) {
      setMsg({ text: t('app.err_send', 'Sorry, this could not be sent. Please try again, or email hello@sophiacommons.org.') + ' (' + (x as Error).message + ')', error: true });
    } finally { setBusy(false); }
  };

  return (
    <Screen title={t('app.post_place', 'Suggest a place')} underHeader>
      <Body muted>{t('app.place_intro', 'A Waldorf school, farm, Camphill, clinic, group or initiative that is missing from the directory.')}</Body>
      <Field label={t('app.f_name', 'Name')} value={f.name} onChange={set('name')} error={err.name} maxLength={200} />
      <Label>{t('app.f_category', 'Category')}</Label>
      <Chips value={f.category} onChange={set('category')} items={CATEGORIES.map((x) => ({ key: x.key, label: t('app.cat_' + x.key, x.label) }))} />
      {err.category ? <Body style={{ color: '#B3261E' }}>{err.category}</Body> : null}
      <Field label={t('app.f_location', 'City, state and country')} value={f.location} onChange={set('location')} error={err.location} placeholder="Chestnut Ridge, NY, USA" maxLength={200} />
      <Field label={t('app.f_website', 'Website')} value={f.url} onChange={set('url')} error={err.url} placeholder="example.org"
        autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
      <Field label={t('app.f_description', 'Description')} value={f.description} onChange={set('description')} multiline maxLength={5000}
        hint={t('app.f_description_hint', 'What it is and what it offers, in a few sentences.')} />
      {session
        ? <ImageField label={t('app.img_place', 'Photo (optional)')} hint={t('app.img_place_hint', 'A photo of the place, or its logo.')} value={img} onChange={setImg} />
        : <Body muted>{t('app.img_place_signin', 'Signed-in members can add a photo too.')}</Body>}
      <Field label={t('app.f_your_email', 'Your email (optional)')} value={f.email} onChange={set('email')} error={err.email}
        hint={t('app.f_your_email_hint', 'Only so we can ask you a question. It is not shown.')}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} />
      {msg ? <FormMessage text={msg.text} error={msg.error} /> : null}
      {done
        ? <Button label={t('app.done', 'Done')} onPress={() => router.back()} />
        : <Button label={busy ? t('app.sending', 'Sending...') : t('app.send', 'Send')} onPress={send} disabled={busy} />}
    </Screen>
  );
}
