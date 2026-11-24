// "Add to calendar" (owner, 2026-11-22: "save on their Google/Apple/Windows calendar"). A short menu:
//   iPhone:  Apple Calendar (the phone's own add-event form), Google Calendar, Outlook (Windows)
//   Android: Phone calendar (the phone's own form, which is usually Google Calendar), Outlook (Windows)
// Google and Outlook open their own "new event" page, filled in, in the browser or their app.
import * as Calendar from 'expo-calendar';
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { type EventRow, eventPlace, eventTitle } from '@/lib/events';
import { t } from '@/lib/i18n';
import { maybeAskForReview } from '@/lib/review';
import { SITE } from '@/lib/supabase';

function times(e: EventRow) {
  const start = new Date(e.start_date);
  const end = e.end_date ? new Date(e.end_date) : new Date(start.getTime() + 2 * 3600e3);
  return { start, end };
}
const place = (e: EventRow) => (e.is_online ? 'Online' : [e.location_name, e.address, eventPlace(e)].filter(Boolean).join(', '));
const link = (e: EventRow) => SITE + '/event/' + e.id;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function googleLink(e: EventRow) {
  const { start, end } = times(e);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = (d: Date) => ymd(d).replace(/-/g, '');
  const dates = e.is_all_day ? day(start) + '/' + day(new Date(end.getTime() + 864e5)) : fmt(start) + '/' + fmt(end);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: eventTitle(e), dates, details: link(e), location: place(e) });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

// Outlook on the web (outlook.live.com for personal accounts; it hands work accounts over to Microsoft 365)
function outlookLink(e: EventRow) {
  const { start, end } = times(e);
  const q = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent', subject: eventTitle(e), body: link(e), location: place(e),
    startdt: e.is_all_day ? ymd(start) : start.toISOString(), enddt: e.is_all_day ? ymd(end) : end.toISOString(),
    allday: e.is_all_day ? 'true' : 'false',
  });
  return 'https://outlook.live.com/calendar/0/deeplink/compose?' + q.toString();
}

// 'added' also covers Android, which always answers 'done' (it cannot tell a save from a cancel)
async function phoneCalendar(e: EventRow): Promise<'added' | 'cancelled' | false> {
  const { start, end } = times(e);
  const details = { title: eventTitle(e), startDate: start, endDate: end, allDay: !!e.is_all_day, location: place(e), notes: link(e), url: link(e) };
  try {
    if (Platform.OS === 'ios') {
      const r = await Calendar.getDefaultCalendarSync().addEventWithForm(details);
      return r.action === 'canceled' || r.action === 'deleted' ? 'cancelled' : 'added';
    }
    if (Platform.OS === 'android') {
      const cals = await Calendar.getCalendars();
      const cal = cals.find((c) => c.isPrimary && c.allowsModifications) || cals.find((c) => c.allowsModifications);
      if (cal) { await cal.addEventWithForm(details); return 'added'; }
    }
  } catch { /* no calendar access or no calendar: the caller falls back to Google */ }
  return false;
}

export function addToCalendar(e: EventRow) {
  // Adding an event to a calendar is a happy moment. The rating card is only asked for when the member stays in the
  // app (the phone calendar); Google and Outlook open the browser, which would hide the card.
  const added = (where: string) => { track('calendar_added', { where }); if (where === 'phone') maybeAskForReview('calendar'); };
  const google = () => { added('google'); return Linking.openURL(googleLink(e)); };
  const outlook = () => { added('outlook'); return Linking.openURL(outlookLink(e)); };
  const phone = async () => {
    const r = await phoneCalendar(e);
    if (r === 'added') added('phone'); else if (r === false) await google();
  };
  const title = t('app.add_to_calendar', 'Add to calendar');
  if (Platform.OS === 'ios') {
    const opts = [t('app.cal_apple', 'Apple Calendar'), t('app.cal_google', 'Google Calendar'), t('app.cal_outlook', 'Outlook (Windows)'), t('app.cancel', 'Cancel')];
    ActionSheetIOS.showActionSheetWithOptions({ title, options: opts, cancelButtonIndex: 3 }, (i) => {
      if (i === 0) phone(); else if (i === 1) google(); else if (i === 2) outlook();
    });
    return;
  }
  // Android shows at most three buttons in an alert
  Alert.alert(title, undefined, [
    { text: t('app.cancel', 'Cancel'), style: 'cancel' },
    { text: t('app.cal_outlook', 'Outlook (Windows)'), onPress: outlook },
    { text: t('app.cal_phone', 'Phone calendar'), onPress: phone },
  ]);
}
