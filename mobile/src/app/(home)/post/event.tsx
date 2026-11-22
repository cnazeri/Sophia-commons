// Share an event. Needs a free account. Saved by the same event-save function as the website's /events/new: the
// event is listed on the calendar at once and the owner reviews it afterwards (Admin > Events).
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, Switch, View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { DateField, Field, FormMessage, Label, isoDay, normTime } from '@/components/form';
import { Body, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { type EventIn, type EventOut, postEvent, webUrl } from '@/lib/post';

const TYPES = ['workshop', 'conference', 'study_group', 'festival', 'retreat', 'other'] as const;
const TYPE_LABEL: Record<string, string> = { workshop: 'Workshop or course', conference: 'Conference', study_group: 'Study group',
  festival: 'Festival', retreat: 'Retreat', other: 'Talk or other' };

export default function PostEvent() {
  const c = useTheme();
  const { session } = useAuth();
  const today = isoDay(new Date());
  const [f, setF] = useState<EventIn>({ title: '', event_type: 'workshop', description: '', start_date: '', start_time: '', end_date: '',
    end_time: '', is_all_day: false, attendance: 'place', online_url: '', location_name: '', address: '', city: '', region: '', country: '',
    organizer_name: '', organizer_url: '', price_text: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<EventOut | null>(null);
  const set = <K extends keyof EventIn>(k: K) => (v: EventIn[K]) => setF((p) => ({ ...p, [k]: v }));

  if (!session) {
    return (
      <Screen title={t('app.post_event', 'Share an event')} underHeader>
        <Body muted>{t('app.post_sign_in', 'Sign in or create a free account to post. It is the same account as on sophiacommons.org.')}</Body>
        <AuthForm chatIntro={false} />
      </Screen>
    );
  }

  const send = async () => {
    const st = normTime(f.start_time), et = normTime(f.end_time), org = webUrl(f.organizer_url), online = webUrl(f.online_url);
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = t('app.err_title', 'Please give the event a title.');
    if (!f.start_date) e.start_date = t('app.err_start_date', 'Please choose the start date.');
    if (!f.is_all_day && !st) e.start_time = t('app.err_start_time', 'Please give the start time, like 19:30, or turn on All day.');
    if (et === null) e.end_time = t('app.err_time', 'Please write the time like 19:30.');
    if (f.end_date && f.end_date < f.start_date) e.end_date = t('app.err_end_date', 'The end date is before the start date.');
    if (!f.is_all_day && st && et && (!f.end_date || f.end_date === f.start_date) && et <= st) e.end_time = t('app.err_end_time', 'The end time is before the start time.');
    if (f.attendance !== 'place' && !online) e.online_url = t('app.err_online_url', 'Please give the full link to join, like https://zoom.us/j/...');
    if (f.attendance !== 'online' && !f.city.trim() && !f.location_name.trim()) e.city = t('app.err_place', 'Please give the venue or the city.');
    if (org === null) e.organizer_url = t('app.err_url', 'Please enter a web address, for example example.org');
    if (f.description.trim().length < 20) e.description = t('app.err_description', 'Please describe the event in a sentence or two.');
    setErr(e);
    if (Object.keys(e).length) { setMsg({ text: t('app.err_check', 'Please check the fields marked in red.'), error: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const out = await postEvent({ ...f, title: f.title.trim(), description: f.description.trim(), start_time: f.is_all_day ? '' : st || '',
        end_time: f.is_all_day ? '' : et || '', online_url: online || '', organizer_url: org || '' }, session);
      setDone(out);
      setMsg({ text: t('app.event_sent', 'Thank you. Your event is on the calendar now. We also emailed you its link.') });
    } catch (x) {
      setMsg({ text: (x as Error).message, error: true });
    } finally { setBusy(false); }
  };

  return (
    <Screen title={t('app.post_event', 'Share an event')} underHeader>
      <Field label={t('app.f_title', 'Title')} value={f.title} onChange={set('title')} error={err.title} maxLength={200} />
      <Label>{t('app.f_type', 'Type')}</Label>
      <Chips value={f.event_type} onChange={set('event_type')} items={TYPES.map((k) => ({ key: k, label: t('app.etype_' + k, TYPE_LABEL[k]) }))} />
      <DateField label={t('app.f_start_date', 'Date')} value={f.start_date} onChange={set('start_date')} min={today} error={err.start_date} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label>{t('app.f_all_day', 'All day')}</Label>
        <Switch value={f.is_all_day} onValueChange={set('is_all_day')} trackColor={{ true: c.gold, false: c.border }} accessibilityLabel={t('app.f_all_day', 'All day')} />
      </View>
      {!f.is_all_day ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label={t('app.f_start_time', 'Starts')} value={f.start_time} onChange={set('start_time')} error={err.start_time}
            placeholder="19:30" keyboardType="numbers-and-punctuation" maxLength={5} /></View>
          <View style={{ flex: 1 }}><Field label={t('app.f_end_time', 'Ends (optional)')} value={f.end_time} onChange={set('end_time')} error={err.end_time}
            placeholder="21:00" keyboardType="numbers-and-punctuation" maxLength={5} /></View>
        </View>
      ) : null}
      <DateField label={t('app.f_end_date', 'Last day (for events over several days)')} value={f.end_date} onChange={set('end_date')}
        min={f.start_date || today} error={err.end_date} optional />
      <Body muted>{t('app.f_timezone_note', 'Times are in your phone\'s time zone: ') + Intl.DateTimeFormat().resolvedOptions().timeZone}</Body>
      <Label>{t('app.f_where', 'Where')}</Label>
      <Chips value={f.attendance} onChange={set('attendance')} items={[
        { key: 'place', label: t('app.where_place', 'In person') }, { key: 'online', label: t('app.where_online', 'Online') },
        { key: 'both', label: t('app.where_both', 'Both') }]} />
      {f.attendance !== 'online' ? (
        <>
          <Field label={t('app.f_venue', 'Venue')} value={f.location_name} onChange={set('location_name')} maxLength={200} />
          <Field label={t('app.f_address', 'Street address')} value={f.address} onChange={set('address')} maxLength={300} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label={t('app.f_city', 'City')} value={f.city} onChange={set('city')} error={err.city} maxLength={120} /></View>
            <View style={{ flex: 1 }}><Field label={t('app.f_region', 'State or province')} value={f.region} onChange={set('region')} maxLength={120} /></View>
          </View>
          <Field label={t('app.f_country', 'Country')} value={f.country} onChange={set('country')} maxLength={120} />
        </>
      ) : null}
      {f.attendance !== 'place' ? (
        <Field label={t('app.f_online_url', 'Link to join')} value={f.online_url} onChange={set('online_url')} error={err.online_url}
          placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
      ) : null}
      <Field label={t('app.f_description', 'Description')} value={f.description} onChange={set('description')} error={err.description} multiline maxLength={10000} />
      <Field label={t('app.f_price', 'Price (optional)')} value={f.price_text} onChange={set('price_text')} placeholder={t('app.f_price_ph', 'Free, or $20')} maxLength={100} />
      <Field label={t('app.f_organizer', 'Organizer (optional)')} value={f.organizer_name} onChange={set('organizer_name')} maxLength={200} />
      <Field label={t('app.f_organizer_url', 'Website for more information (optional)')} value={f.organizer_url} onChange={set('organizer_url')}
        error={err.organizer_url} placeholder="example.org" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
      {msg ? <FormMessage text={msg.text} error={msg.error} /> : null}
      {done ? (
        <>
          {done.link ? <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => Share.share({ message: f.title + '\n' + done.link })} /> : null}
          {done.id ? <Button kind="secondary" label={t('app.view_event', 'See the event')} onPress={() => router.push({ pathname: '/events/[id]', params: { id: done.id } })} /> : null}
          <Button label={t('app.done', 'Done')} onPress={() => router.back()} />
        </>
      ) : <Button label={busy ? t('app.sending', 'Sending...') : t('app.post_btn', 'Post')} onPress={send} disabled={busy} />}
    </Screen>
  );
}
