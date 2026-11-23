// Blogs: the Substack writers (same list as the website's "On Substack"), each with its latest post; each opens its
// own page and can be saved.
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { MediaCard } from '@/components/media-card';
import { Body, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { type MediaItem, blogItem, fetchBlogs } from '@/lib/media';

export default function Blogs() {
  const c = useTheme();
  const [rows, setRows] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { fetchBlogs().then((r) => setRows(r.map(blogItem))).catch(() => setError(true)); }, []);
  return (
    <Screen underHeader title={t('app.media_blogs', 'Blogs')}>
      {error ? <Body muted>{t('app.load_error', 'Could not load. Try again in a moment.')}</Body> : null}
      {!rows && !error ? <ActivityIndicator color={c.goldText} /> : null}
      {(rows || []).map((m) => <MediaCard key={m.id} m={m} />)}
    </Screen>
  );
}
