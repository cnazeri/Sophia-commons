// One-tap bookmark for an event, a place, a news article, or a talk, blog or podcast. Bookmarked items appear on the Saved tab and open offline.
// Bookmarking an event also sets its reminder (9 am the day before); removing it cancels the reminder.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { Listing } from '@/lib/directory';
import { type EventRow, eventTitle } from '@/lib/events';
import { t } from '@/lib/i18n';
import { type MediaItem, mediaKey } from '@/lib/media';
import type { Article } from '@/lib/news';
import { cancelReminder, remindEvent } from '@/lib/reminders';
import { toggleEvent, toggleListing, toggleMedia, toggleNews, useSaved } from '@/lib/saved';

type Props =
  | { event: EventRow; listing?: undefined; article?: undefined; media?: undefined }
  | { listing: Listing; event?: undefined; article?: undefined; media?: undefined }
  | { article: Article; event?: undefined; listing?: undefined; media?: undefined }
  | { media: MediaItem; event?: undefined; listing?: undefined; article?: undefined };

export function BookmarkButton(p: Props) {
  const c = useTheme();
  const saved = useSaved();
  const on = p.event ? !!saved.events[p.event.id] : p.listing ? !!saved.listings[p.listing.id]
    : p.media ? !!(saved.media || {})[mediaKey(p.media)] : !!saved.news[p.article.id];
  const name = p.event ? eventTitle(p.event) : p.listing ? p.listing.organization_name : p.media ? p.media.title : p.article.title;

  async function press() {
    if (p.event) {
      const nowOn = toggleEvent(p.event);
      try { if (nowOn) await remindEvent(p.event); else await cancelReminder(p.event); } catch { /* bookmark still kept */ }
    } else if (p.listing) {
      toggleListing(p.listing);
    } else if (p.media) {
      toggleMedia(p.media);
    } else {
      toggleNews(p.article);
    }
  }

  return (
    <Pressable onPress={press} hitSlop={10} style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={(on ? t('app.remove_bookmark', 'Remove bookmark') : t('app.bookmark', 'Bookmark')) + ': ' + name}>
      <MaterialIcons name={on ? 'bookmark' : 'bookmark-border'} size={24} color={on ? c.goldText : c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ btn: { padding: 4, alignSelf: 'flex-start' } });
