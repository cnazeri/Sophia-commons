// Directory: search by name, town or country, filter by category.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chips } from '@/components/chips';
import { DirectoryMap } from '@/components/directory-map';
import { ListingCard } from '@/components/listing-card';
import { Body, H1, Wordmark } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, type Listing, nearListings, searchListings } from '@/lib/directory';
import { track, trackSearch } from '@/lib/analytics';
import { t } from '@/lib/i18n';

export default function DirectoryScreen() {
  const c = useTheme();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [rows, setRows] = useState<(Listing & { km?: number })[] | null>(null);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');

  // Search shortly after typing stops
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      (near && !q ? nearListings(near.lat, near.lng, cat === 'all' ? null : cat) : searchListings(q, cat === 'all' ? null : cat))
        .then((r) => { if (alive) { setRows(r); setError(''); } })
        .catch((e: Error) => { if (alive) setError(e.message); });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, cat, near]);
  useEffect(() => { trackSearch('directory', q); }, [q]);

  // Location is asked for only when "Near me" is tapped, and never stored
  const findNear = async () => {
    if (near) { setNear(null); return; }
    setLocMsg('');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { setLocMsg(t('app.location_denied', 'Location is off for Sophia Commons. You can still search by town.')); return; }
    // A fresh position first (the last known one can be hours old); fall back to it after 8 seconds
    const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
    const pos = (await Promise.race([fresh, timeout])) || (await Location.getLastKnownPositionAsync());
    if (!pos) { setLocMsg(t('app.location_unavailable', 'Your location is not available right now. You can still search by town.')); return; }
    setQ(''); setRows(null);
    setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    track('near_me');
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={view === 'map' ? [] : rows || []}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.head}>
            <Wordmark post />
            <H1>{t('app.directory_title', 'Find anthroposophy near you')}</H1>
            <TextInput value={q} onChangeText={setQ} placeholder={t('app.search_placeholder', 'School, farm, group, town or country')}
              placeholderTextColor={c.textMuted} returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false}
              accessibilityLabel={t('app.search_placeholder', 'School, farm, group, town or country')}
              style={[styles.search, { backgroundColor: c.elevated, borderColor: c.border, color: c.text }]} />
            <Button kind={near ? 'primary' : 'secondary'} label={near ? t('app.near_me_on', 'Showing places near you (tap to search instead)') : t('app.near_me', 'Near me')} onPress={findNear} />
            {locMsg ? <Body muted>{locMsg}</Body> : null}
            <Chips value={cat} onChange={setCat} items={[{ key: 'all', label: t('app.filter_all', 'All') }, ...CATEGORIES.map((x) => ({ key: x.key, label: t('app.cat_' + x.key, x.label) }))]} />
            <Chips value={view} onChange={(v) => setView(v as 'list' | 'map')} items={[
              { key: 'list', label: t('app.view_list', 'List') }, { key: 'map', label: t('app.view_map', 'Map') }]} />
            {view === 'map' ? <DirectoryMap cat={cat === 'all' ? null : cat} q={q} near={near} /> : null}
            {!rows && !error && view === 'list' ?<ActivityIndicator style={{ marginTop: 40 }} color={c.goldText} /> : null}
          </View>
        }
        renderItem={({ item }) => <View style={styles.item}><ListingCard l={item} km={item.km} /></View>}
        ListEmptyComponent={rows && view === 'list' ? <Body muted style={{ paddingVertical: Spacing.lg }}>{error ? t('app.load_error_dir', 'Could not load the directory. Try again in a moment.') : t('app.no_results', 'Nothing found. Try another word or category.')}</Body> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  head: { gap: Spacing.md, paddingBottom: Spacing.md },
  search: { minHeight: 48, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 18, fontFamily: Fonts.body, fontSize: 16 },
  item: { paddingBottom: Spacing.sm },
});
