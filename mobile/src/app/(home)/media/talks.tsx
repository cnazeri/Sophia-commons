// Talks: the newest videos from the curated YouTube channels; each opens its own page and can be saved.
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { MediaCard } from '@/components/media-card';
import { Body, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { type MediaItem, fetchVideos, videoItem } from '@/lib/media';

export default function Talks() {
  const c = useTheme();
  const [rows, setRows] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { fetchVideos(30, 30).then((r) => setRows(r.map(videoItem))).catch(() => setError(true)); }, []);
  return (
    <Screen underHeader title={t('app.media_talks', 'Talks')}>
      {error ? <Body muted>{t('app.load_error', 'Could not load. Try again in a moment.')}</Body> : null}
      {!rows && !error ? <ActivityIndicator color={c.goldText} /> : null}
      {(rows || []).map((m) => <MediaCard key={m.id} m={m} wide />)}
    </Screen>
  );
}
