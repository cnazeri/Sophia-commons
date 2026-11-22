// "Add to calendar": the phone's own add-event form; a Google Calendar link if that is not available.
import * as Calendar from 'expo-calendar';
import { Linking, Platform } from 'react-native';

import { type EventRow, eventPlace, eventTitle } from '@/lib/events';
import { SITE } from '@/lib/supabase';

function googleLink(e: EventRow) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(e.start_date);
  const end = e.end_date ? new Date(e.end_date) : new Date(start.getTime() + 2 * 3600e3);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: eventTitle(e), dates: fmt(start) + '/' + fmt(end),
    details: SITE + '/event/' + e.id, location: e.is_online ? 'Online' : [e.location_name, e.address, eventPlace(e)].filter(Boolean).join(', '),
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

export async function addToCalendar(e: EventRow) {
  const start = new Date(e.start_date);
  const end = e.end_date ? new Date(e.end_date) : new Date(start.getTime() + 2 * 3600e3);
  const details = {
    title: eventTitle(e), startDate: start, endDate: end, allDay: !!e.is_all_day,
    location: e.is_online ? 'Online' : [e.location_name, e.address, eventPlace(e)].filter(Boolean).join(', '),
    notes: SITE + '/event/' + e.id, url: SITE + '/event/' + e.id,
  };
  try {
    if (Platform.OS === 'ios') {
      await Calendar.getDefaultCalendarSync().addEventWithForm(details);
      return;
    }
    if (Platform.OS === 'android') {
      const cals = await Calendar.getCalendars();
      const cal = cals.find((c) => c.isPrimary && c.allowsModifications) || cals.find((c) => c.allowsModifications);
      if (cal) { await cal.addEventWithForm(details); return; }
    }
  } catch {
    // fall through to the link
  }
  await Linking.openURL(googleLink(e));
}
