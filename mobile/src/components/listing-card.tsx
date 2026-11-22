import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { BookmarkButton } from '@/components/bookmark-button';
import { useTheme } from '@/hooks/use-theme';
import { type Listing, listingPlace } from '@/lib/directory';
import { sizedImage } from '@/lib/events';

export function ListingCard({ l, km }: { l: Listing; km?: number }) {
  const c = useTheme();
  const logo = (l.photo_url || '').includes('#contain');
  const img = sizedImage((l.photo_url || '').split('#')[0], 200);
  return (
    <Pressable onPress={() => router.push({ pathname: '/directory/[id]', params: { id: l.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })} accessibilityRole="link" accessibilityLabel={l.organization_name + ', ' + listingPlace(l)}>
      <View style={[styles.row, { backgroundColor: c.elevated, borderColor: c.border }]}>
        {img ? <Image source={img} style={[styles.thumb, { backgroundColor: c.surface }]} contentFit={logo ? 'contain' : 'cover'} transition={150} />
          : <View style={[styles.thumb, { backgroundColor: c.surface }]} />}
        <View style={styles.main}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{l.organization_name}{l.is_verified ? '  ✓' : ''}</Text>
          {listingPlace(l) || km != null ? <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{[km != null ? (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km' : '', listingPlace(l)].filter(Boolean).join(' · ')}</Text> : null}
          {l.description ? <Text style={[styles.desc, { color: c.textSecondary }]} numberOfLines={2}>{l.description}</Text> : null}
        </View>
        <BookmarkButton listing={l} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg },
  thumb: { width: 60, height: 60, borderRadius: Radius.md },
  main: { flex: 1, gap: 3 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15.5, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 13 },
  desc: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 18 },
});
