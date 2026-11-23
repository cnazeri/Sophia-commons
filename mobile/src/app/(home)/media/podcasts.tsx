// Podcasts: the curated podcast list (same as the website's Social Media page); each opens its own page and can be saved.
import { MediaCard } from '@/components/media-card';
import { Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { PODCASTS, podcastItem } from '@/lib/media';

export default function Podcasts() {
  return (
    <Screen underHeader title={t('app.media_podcasts', 'Podcasts')}>
      {PODCASTS.map(podcastItem).map((m) => <MediaCard key={m.id} m={m} />)}
    </Screen>
  );
}
