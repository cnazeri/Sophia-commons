// One listing: photo, description, and call / email / website / directions / share.
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, Card, H1, Kicker } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, fetchListing, type Listing, listingPlace } from '@/lib/directory';
import { sizedImage } from '@/lib/events';
import { toggleListing, useSaved } from '@/lib/saved';
import { t } from '@/lib/i18n';
import { SITE } from '@/lib/supabase';

export default function ListingDetail() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [l, setL] = useState<Listing | null | undefined>(undefined);
  const saved = useSaved();
  useEffect(() => { fetchListing(String(id)).then(setL).catch(() => setL(null)); }, [id]);

  if (l === undefined) return <ActivityIndicator style={{ marginTop: 80 }} color={c.goldText} />;
  if (l === null) return <Body style={{ padding: Spacing.lg }}>{t('app.listing_missing', 'This listing could not be found.')}</Body>;

  const logo = (l.photo_url || '').includes('#contain');
  const img = sizedImage((l.photo_url || '').split('#')[0], 900);
  const cat = CATEGORIES.find((x) => x.key === l.category);
  // Address and town often repeat each other ("Livermore, CA" + "Livermore, USA"): keep each part once
  const seen = new Set<string>();
  const place = [l.address, listingPlace(l)].filter(Boolean).join(', ').split(',').map((x) => x.trim())
    .filter((x) => x && !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true)).join(', ');
  const url = SITE + '/listing/' + (l.slug || l.id);
  const directions = () => {
    const q = l.latitude != null && l.longitude != null ? `${l.latitude},${l.longitude}` : encodeURIComponent(place);
    Linking.openURL(Platform.OS === 'ios' ? 'http://maps.apple.com/?q=' + encodeURIComponent(l.organization_name) + '&ll=' + q : 'geo:' + (l.latitude ?? 0) + ',' + (l.longitude ?? 0) + '?q=' + encodeURIComponent(place || l.organization_name));
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.wrap}>
      {img ? <Image source={img} style={[styles.photo, { backgroundColor: c.surface }]} contentFit={logo ? 'contain' : 'cover'} transition={200} accessibilityLabel={l.organization_name} /> : null}
      {cat ? <Kicker>{t('app.cat_' + cat.key, cat.label)}</Kicker> : null}
      <H1 style={{ marginTop: 0 }}>{l.organization_name}</H1>
      {place ? <Body muted selectable>{place}</Body> : null}
      {l.description ? <Card><Body selectable>{l.description}</Body></Card> : null}
      <View style={styles.actions}>
        {l.website_url ? <Button label={t('app.website', 'Website')} onPress={() => WebBrowser.openBrowserAsync(l.website_url!)} /> : null}
        {l.phone ? <Button kind="secondary" label={t('app.call', 'Call') + ' ' + l.phone} onPress={() => Linking.openURL('tel:' + l.phone!.replace(/[^\d+]/g, ''))} /> : null}
        {l.email ? <Button kind="secondary" label={t('app.email', 'Email')} onPress={() => Linking.openURL('mailto:' + l.email)} /> : null}
        {place ? <Button kind="secondary" label={t('app.directions', 'Directions')} onPress={directions} /> : null}
        <Button kind="secondary" label={saved.listings[l.id] ? t('app.saved', 'Saved') : t('app.save_place', 'Save')} onPress={() => toggleListing(l)} />
        <Button kind="secondary" label={t('app.share', 'Share')} onPress={() => Share.share({ message: l.organization_name + '\n' + url, url })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: 48 },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14 },
  actions: { gap: Spacing.sm },
});
