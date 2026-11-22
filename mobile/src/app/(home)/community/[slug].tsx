// A published community post (blog_posts), read in the app. Members write them from Post > Write a community post.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Share } from 'react-native';

import { Button } from '@/components/button';
import { Body, H1, Kicker, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { localDate, t } from '@/lib/i18n';
import { paragraphs } from '@/lib/news';
import { type CommunityPost, fetchCommunityPost } from '@/lib/post';
import { SITE } from '@/lib/supabase';

export default function CommunityPostScreen() {
  const c = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [p, setP] = useState<CommunityPost | null | undefined>(undefined);
  useEffect(() => { fetchCommunityPost(String(slug)).then(setP).catch(() => setP(null)); }, [slug]);

  if (p === undefined) return <Screen underHeader><ActivityIndicator color={c.goldText} /></Screen>;
  if (!p) return <Screen underHeader><Body muted>{t('app.post_missing', 'This post is not available.')}</Body></Screen>;
  const link = `${SITE}/blog/${p.slug}`;
  return (
    <Screen underHeader>
      <Kicker>{[p.author_name, p.published_at ? localDate(p.published_at, { day: 'numeric', month: 'long', year: 'numeric' }) : ''].filter(Boolean).join(' · ')}</Kicker>
      <H1>{p.title}</H1>
      {paragraphs(p.body).map((para, i) => <Body key={i} style={{ fontSize: 17, lineHeight: 27 }}>{para}</Body>)}
      <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => Share.share({ message: p.title + '\n' + link })} />
    </Screen>
  );
}
