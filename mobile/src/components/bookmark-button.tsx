// The heart: saves an event, a place, a news article, or a talk, blog or podcast to the member's account
// (owner, 2026-11-23: one heart means "saved" everywhere, and saving is for signed-in members only, so the heart
// is not shown to visitors who are signed out). Saved items appear in Settings > Saved and open offline.
// Saving an event also sets its reminders; removing it cancels them.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
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

const HEART = '#C0392B';

export function BookmarkButton(p: Props) {
  const c = useTheme();
  const saved = useSaved();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  const on = p.event ? !!saved.events[p.event.id] : p.listing ? !!saved.listings[p.listing.id]
    : p.media ? !!(saved.media || {})[mediaKey(p.media)] : !!saved.news[p.article.id];
  const name = p.event ? eventTitle(p.event) : p.listing ? p.listing.organization_name : p.media ? p.media.title : p.article.title;

  async function press() {
    if (busy) return;
    setBusy(true);
    try {
      if (p.event) {
        const nowOn = await toggleEvent(p.event);
        try { if (nowOn) await remindEvent(p.event); else await cancelReminder(p.event); } catch { /* saved without a reminder */ }
      } else if (p.listing) {
        await toggleListing(p.listing);
      } else if (p.media) {
        await toggleMedia(p.media);
      } else {
        await toggleNews(p.article);
      }
    } catch {
      Alert.alert(t('saved.error', 'Could not save. Please try again.'));
    }
    setBusy(false);
  }

  return (
    <Pressable onPress={press} hitSlop={10} disabled={busy} style={({ pressed }) => [styles.btn, { opacity: pressed || busy ? 0.6 : 1 }]}
      accessibilityRole="button" accessibilityState={{ selected: on, busy }}
      accessibilityLabel={(on ? t('saved.unsave', 'Remove from saved') : t('saved.save', 'Save')) + ': ' + name}>
      <MaterialIcons name={on ? 'favorite' : 'favorite-border'} size={24} color={on ? HEART : c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ btn: { padding: 4, alignSelf: 'flex-start' } });
