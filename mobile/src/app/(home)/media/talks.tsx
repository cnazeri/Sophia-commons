// Talks: the newest videos from the curated YouTube channels; each opens its own page and can be saved.
// A signed-in member's favorite channels come first (owner, 2026-11-23; the favorite button is on a talk's page).
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { MediaCard } from '@/components/media-card';
import { Body, H2, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useFavChannels } from '@/lib/fav-channels';
import { t } from '@/lib/i18n';
import { type MediaItem, fetchFavVideos, fetchVideos, videoItem } from '@/lib/media';

export default function Talks() {
  const c = useTheme();
  const { favs } = useFavChannels();
  const [rows, setRows] = useState<MediaItem[] | null>(null);
  const [mine, setMine] = useState<MediaItem[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => { fetchVideos(30, 30).then((r) => setRows(r.map(videoItem))).catch(() => setError(true)); }, []);
  const favKey = [...favs].sort().join(',');
  useEffect(() => {
    let alive = true;
    fetchFavVideos(favKey ? favKey.split(',') : []).then((r) => { if (alive) setMine(r.map(videoItem)); }).catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
  }, [favKey]);
  const shown = new Set(mine.map((m) => m.id));
  const rest = (rows || []).filter((m) => !shown.has(m.id));
  return (
    <Screen underHeader title={t('app.media_talks', 'Talks')}>
      {error ? <Body muted>{t('app.load_error', 'Could not load. Try again in a moment.')}</Body> : null}
      {mine.length ? (
        <>
          <H2>{t('app.fav_channels_talks', 'From your favorite channels')}</H2>
          {mine.map((m) => <MediaCard key={m.id} m={m} wide />)}
          <H2>{t('app.media_newest_all', 'Newest from all channels')}</H2>
        </>
      ) : null}
      {!rows && !error ? <ActivityIndicator color={c.goldText} /> : null}
      {rest.map((m) => <MediaCard key={m.id} m={m} wide />)}
    </Screen>
  );
}
