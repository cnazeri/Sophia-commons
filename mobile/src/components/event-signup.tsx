// Sign up for an event in the app (owner, 2026-11-23), in the design of the new sophiacommons.org/signup page:
// places-left bar, name, email and a people stepper on one row, yes/no as two tap buttons, choices as chips,
// the note folded away, then a thank-you (Add to calendar is right below, with the screen's other buttons). Rules and server calls: lib/signup.ts.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/button';
import { Field, FormMessage } from '@/components/form';
import { Card } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { type EventRow } from '@/lib/events';
import { localDate, localTime, t } from '@/lib/i18n';
import { maybeAskForReview } from '@/lib/review';
import { PEOPLE_MAX, type SignupResult, type Spots, fetchSpots, isEmail, sendSignup, signupClosesAt, signupOpen, signupQuestions } from '@/lib/signup';

const DANGER = '#B3261E';

export function EventSignup({ e }: { e: EventRow }) {
  const c = useTheme();
  const { session } = useAuth();
  const qs = signupQuestions(e);
  const [spots, setSpots] = useState<Spots | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(session?.user?.email || '');
  const [people, setPeople] = useState(1);
  const [answers, setAnswers] = useState<string[]>(qs.map(() => ''));
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SignupResult | null>(null);
  const open = signupOpen(e);

  useEffect(() => { if (open) fetchSpots(e.id).then(setSpots); }, [e.id, open]);

  const full = !!spots?.capacity && (spots.left ?? 1) <= 0;
  const answer = (i: number, v: string) => { setAnswers((a) => a.map((x, k) => (k === i ? v : x))); setErr(''); };

  const submit = async () => {
    if (!name.trim() || !isEmail(email.trim())) { setErr(t('signup.need_name_email', 'Please give your name and a valid email address.')); return; }
    setBusy(true); setErr('');
    try {
      const r = await sendSignup({ event_id: e.id, name: name.trim(), email: email.trim(), attending: people, note: note.trim(), answers });
      setDone(r);
      if (r.count != null) setSpots({ count: r.count, capacity: r.left != null ? r.count + r.left : null, left: r.left ?? null });
      track('event_signup', { waitlist: !!r.waitlist });
      if (!r.waitlist) maybeAskForReview('event_signup');
    } catch (x) {
      setErr((x as Error).message || t('signup.error', 'Your sign-up could not be sent. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
      <View style={styles.pad}>
        <Text style={[styles.h, { color: c.text }]}>{t('signup.heading', 'Sign up for this event')}</Text>
        {open && e.signup_close_hours != null ? (
          <Text style={[styles.small, { color: c.textMuted }]}>
            {t('signup.closes_on', 'Sign-ups close {date}').replace('{date}', localDate(new Date(signupClosesAt(e)).toISOString(), { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + localTime(new Date(signupClosesAt(e)).toISOString()))}
          </Text>
        ) : null}
      </View>
      {spots ? <SpotsBar spots={spots} /> : null}
      {e.donation_url && /^https?:\/\//i.test(e.donation_url) ? (
        <Pressable onPress={() => WebBrowser.openBrowserAsync(e.donation_url!)} accessibilityRole="link" style={[styles.pad, styles.line, { borderColor: c.border }]}>
          <Text style={[styles.small, { color: c.textSecondary }]}>
            {e.price_text && !/^(free|kostenlos|gratis|frei)$/i.test(e.price_text) ? t('signup.donation_amount', 'Suggested donation: {amount}.', { amount: e.price_text }) : t('signup.donation', 'A donation is suggested.')}
            {' '}<Text style={{ color: c.goldText, fontFamily: Fonts.bodyBold }}>{t('signup.donate', 'Donate here')}</Text>
          </Text>
        </Pressable>
      ) : null}

      <View style={[styles.pad, styles.line, styles.form, { borderColor: c.border }]}>
        {!open ? (
          <Text style={[styles.small, { color: c.textSecondary }]}>{t('signup.closed', 'Sign-ups for this event are closed.')}</Text>
        ) : done ? (
          <>
            <Text accessibilityLiveRegion="polite" style={[styles.done, { backgroundColor: done.waitlist ? c.surface : '#E4F2E2', color: done.waitlist ? c.text : '#24461F' }]}>
              {done.waitlist
                ? t('signup.done_waitlist', 'This event is full, so you are on the waitlist. If a place opens up you move up automatically and we email you.')
                : t('signup.done', 'Thank you, you are signed up. A confirmation is on its way to your email.')}
            </Text>
          </>
        ) : (
          <>
            <Field label={t('signup.name', 'Your name')} value={name} onChange={(v) => { setName(v); setErr(''); }} autoComplete="name" textContentType="name" maxLength={120} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label={t('signup.email', 'Email')} value={email} onChange={(v) => { setEmail(v); setErr(''); }} keyboardType="email-address"
                  autoCapitalize="none" autoComplete="email" textContentType="emailAddress" maxLength={200} />
              </View>
              <Stepper value={people} onChange={setPeople} />
            </View>
            {qs.map((q, i) => (
              <View key={i} style={{ gap: 6 }}>
                {q.type === 'yesno' || q.type === 'choice' ? (
                  <>
                    <Text style={[styles.label, { color: c.text }]}>{q.label}</Text>
                    <Choices options={q.type === 'yesno' ? ['Yes', 'No'] : q.options || []} value={answers[i]} onChange={(v) => answer(i, v)} even={q.type === 'yesno'} />
                  </>
                ) : (
                  <Field label={q.label} value={answers[i]} onChange={(v) => answer(i, v)} maxLength={500} />
                )}
              </View>
            ))}
            {noteOpen ? (
              <Field label={t('signup.note', 'Note for the organizer')} value={note} onChange={setNote} multiline maxLength={1000} autoFocus />
            ) : (
              <Pressable onPress={() => setNoteOpen(true)} accessibilityRole="button" hitSlop={8} style={styles.addNote}>
                <Text style={{ color: c.goldText, fontFamily: Fonts.bodyBold, fontSize: 14 }}>{t('signup.add_note', '+ Add a note for the organizer')}</Text>
              </Pressable>
            )}
            {full ? (
              <Text style={[styles.wait, { backgroundColor: c.surface, color: c.textSecondary }]}>
                {t('signup.full_note', 'This event is full. Join the waitlist and you move up automatically, with an email, if a place opens.')}
              </Text>
            ) : null}
            <Button label={busy ? t('signup.sending', 'Sending...') : full ? t('signup.join_waitlist', 'Join the waitlist') : t('signup.submit', 'Sign up')}
              onPress={submit} disabled={busy} />
            {err ? <FormMessage text={err} error /> : null}
            <Text style={[styles.fine, { color: c.textMuted }]}>
              {t('signup.privacy', 'Only the organizer and Sophia Commons see your details. A confirmation comes by email.')}
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}

/** "12 signed up [bar] 8 places left" (no bar when the organizer set no limit) */
function SpotsBar({ spots }: { spots: Spots }) {
  const c = useTheme();
  const count = spots.count > 0 ? t('signup.count', '{n} signed up').replace('{n}', String(spots.count)) : '';
  if (!spots.capacity) return count ? <View style={[styles.spots, { backgroundColor: c.surface, borderColor: c.border }]}><Text style={[styles.small, { color: c.textSecondary }]}>{count}</Text></View> : null;
  const left = Math.max(0, spots.left ?? 0);
  const pct = Math.min(100, Math.round((100 * (spots.capacity - left)) / spots.capacity));
  return (
    <View style={[styles.spots, { backgroundColor: c.surface, borderColor: c.border }]}
      accessible accessibilityLabel={[count, left ? t('signup.left', '{n} places left').replace('{n}', String(left)) : t('app.signup_full', 'Full')].filter(Boolean).join(', ')}>
      <Text style={[styles.small, { color: c.textSecondary }]}>{count || t('signup.no_one_yet', 'No one yet')}</Text>
      <View style={[styles.bar, { backgroundColor: c.border }]}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.sage }} /></View>
      <Text style={[styles.small, { fontFamily: Fonts.bodyBold, color: left ? c.text : DANGER }]}>
        {left ? t('signup.left', '{n} places left').replace('{n}', String(left)) : t('app.signup_full', 'Full')}
      </Text>
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const c = useTheme();
  const btn = (d: number, label: string, sign: string, off: boolean) => (
    <Pressable onPress={() => onChange(Math.min(PEOPLE_MAX, Math.max(1, value + d)))} disabled={off} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.stepBtn, { backgroundColor: c.elevated, opacity: off ? 0.35 : 1 }]}>
      <Text style={[styles.stepSign, { color: c.text }]}>{sign}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.text }]}>{t('signup.people', 'People')}</Text>
      <View style={[styles.stepper, { borderColor: c.border }]} accessibilityLabel={t('signup.people_n', '{n} people').replace('{n}', String(value))}>
        {btn(-1, t('signup.fewer', 'One fewer person'), '−', value <= 1)}
        <Text style={[styles.stepVal, { color: c.text, borderColor: c.border }]}>{value}</Text>
        {btn(1, t('signup.more', 'One more person'), '+', value >= PEOPLE_MAX)}
      </View>
    </View>
  );
}

/** Yes/No as two equal halves; a choice question as wrapping chips */
function Choices({ options, value, onChange, even }: { options: string[]; value: string; onChange: (v: string) => void; even?: boolean }) {
  const c = useTheme();
  return (
    <View style={[even ? [styles.seg, { borderColor: c.border }] : styles.chips]} accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const on = value === o;
        return (
          <Pressable key={o} onPress={() => onChange(on ? '' : o)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[even ? [styles.segItem, i > 0 && { borderLeftWidth: 1, borderColor: c.border }] : [styles.chip, { borderColor: on ? c.gold : c.border }],
              { backgroundColor: on ? c.surface : c.elevated }]}>
            <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 14.5, color: on ? c.goldText : c.text }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  line: { borderTopWidth: 1 },
  form: { gap: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  h: { fontFamily: Fonts.heading, fontSize: 18 },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 14 },
  spots: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderTopWidth: 1 },
  bar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-end' },
  stepper: { flexDirection: 'row', height: 48, borderWidth: 1, borderRadius: Radius.sm, overflow: 'hidden' },
  stepBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  stepSign: { fontFamily: Fonts.bodyBold, fontSize: 20 },
  stepVal: { width: 40, textAlign: 'center', textAlignVertical: 'center', lineHeight: 46, fontFamily: Fonts.bodyBold, fontSize: 16, borderLeftWidth: 1, borderRightWidth: 1 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.sm, overflow: 'hidden' },
  segItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  addNote: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  wait: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20, padding: Spacing.md, borderRadius: Radius.sm, overflow: 'hidden' },
  done: { fontFamily: Fonts.bodySemi, fontSize: 15, lineHeight: 21, padding: 14, borderRadius: Radius.md, overflow: 'hidden' },
  fine: { fontFamily: Fonts.body, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
});
