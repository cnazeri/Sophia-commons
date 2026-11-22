// Media: the newest talks from the curated YouTube channels, Substack blogs, podcasts.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LinkRow } from '@/components/link-row';
import { H2, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { localDate, t } from '@/lib/i18n';
import { type Blog, fetchBlogs, fetchVideos, PODCASTS, type Video } from '@/lib/media';

export default function MediaScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  useEffect(() => {
    let alive = true;
    fetchVideos(12).then((r) => { if (alive) setVideos(r); }).catch(() => {});
    fetchBlogs().then((r) => { if (alive) setBlogs(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const short = { month: 'short', day: 'numeric' } as const;
  return (
    <Screen title={t('app.media_title', 'Talks, blogs and podcasts')}>
      <View style={styles.section}>
        <H2>{t('app.new_videos', 'New videos')}</H2>
        {videos.map((v) => (
          <LinkRow key={v.video_id} wide title={v.title} url={v.url || 'https://www.youtube.com/watch?v=' + v.video_id}
            image={v.thumbnail_url || 'https://i.ytimg.com/vi/' + v.video_id + '/hqdefault.jpg'} meta={[v.channel, localDate(v.published_at, short)].filter(Boolean).join(' · ')} />
        ))}
      </View>
      {blogs.length ? (
        <View style={styles.section}>
          <H2>{t('podcasts.substack_heading', 'On Substack')}</H2>
          {blogs.map((b) => (
            <LinkRow key={b.url} title={b.name} url={b.latest?.url || b.url} image={b.image || null}
              meta={[b.author !== b.name ? b.author : '', b.latest ? localDate(b.latest.date, short) : ''].filter(Boolean).join(' · ')}
              body={b.latest ? t('podcasts.substack_latest', 'Latest:') + ' ' + b.latest.title : b.desc} />
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <H2>{t('podcasts.podcasts_heading', 'Podcasts')}</H2>
        {PODCASTS.map((p) => <LinkRow key={p.url} title={p.name} meta={p.meta} url={p.url} />)}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { gap: 0, marginTop: Spacing.sm } });
