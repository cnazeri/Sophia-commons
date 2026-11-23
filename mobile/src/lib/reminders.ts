// Notifications for a saved event, set on the phone itself (no account needed), cancelled when the event is unsaved:
//   - the day before at 9 am (phone time)
//   - one hour before it starts (owner, 2026-11-22), not for all-day events
// Each is skipped when its time has already passed.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { type EventRow, eventTitle } from '@/lib/events';
import { localTime, t } from '@/lib/i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const dayId = (e: EventRow) => 'event-' + e.id;          // same id as before, so older reminders are still cancelled
const hourId = (e: EventRow) => 'event-' + e.id + '-hour';

export async function remindEvent(e: EventRow): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const start = new Date(e.start_date);
  const dayBefore = new Date(start); dayBefore.setDate(dayBefore.getDate() - 1); dayBefore.setHours(9, 0, 0, 0);
  const hourBefore = new Date(start.getTime() - 3600e3);
  const soon = Date.now() + 5 * 60e3;
  const plans: { id: string; at: Date; title: string; body: string }[] = [];
  if (dayBefore.getTime() > soon) plans.push({ id: dayId(e), at: dayBefore, title: t('app.reminder_title', 'Tomorrow'), body: eventTitle(e) });
  if (!e.is_all_day && hourBefore.getTime() > soon) {
    plans.push({ id: hourId(e), at: hourBefore, title: t('app.reminder_hour_title', 'In one hour'),
      body: eventTitle(e) + ' · ' + localTime(e.start_date) + (e.is_online ? ' · ' + t('event_detail.online', 'Online') : '') });
  }
  if (!plans.length) return false;
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  for (const p of plans) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { url: '/events/' + e.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at },
    });
  }
  return true;
}

export async function cancelReminder(e: EventRow) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(dayId(e)).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(hourId(e)).catch(() => {});
}
