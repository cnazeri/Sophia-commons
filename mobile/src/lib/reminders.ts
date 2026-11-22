// A reminder the day before a saved event (9 am the phone's time; at least an hour ahead), cancelled when unsaved.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { type EventRow, eventTitle } from '@/lib/events';
import { t } from '@/lib/i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const idFor = (e: EventRow) => 'event-' + e.id;

export async function remindEvent(e: EventRow): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const start = new Date(e.start_date);
  const at = new Date(start); at.setDate(at.getDate() - 1); at.setHours(9, 0, 0, 0);
  if (at.getTime() < Date.now() + 3600e3) return false;
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: idFor(e),
    content: { title: t('app.reminder_title', 'Tomorrow'), body: eventTitle(e), data: { url: '/events/' + e.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
  return true;
}
export async function cancelReminder(e: EventRow) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(idFor(e)).catch(() => {});
}
