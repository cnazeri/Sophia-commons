// Directory map on the phone: Apple Maps on iPhone, Google Maps on Android. Shows every place with a position
// (not just the 60 in the list). Where places crowd together they join into a numbered gold circle; tapping it
// zooms in. Tapping a single pin's label opens the place.
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';

import { Body } from '@/components/ui';
import { t } from '@/lib/i18n';
import { type Group, type Pt, type Region, fetchMapPoints, filterPoints, fitRegion, groupPoints } from '@/lib/map-points';

type Props = { cat: string | null; q: string; near?: { lat: number; lng: number } | null };

export function DirectoryMap({ cat, q, near }: Props) {
  const [all, setAll] = useState<Pt[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetchMapPoints().then(setAll).catch(() => setFailed(true)); }, []);

  const pts = useMemo(() => (all ? filterPoints(all, cat, q) : []), [all, cat, q]);
  const start = useMemo<Region>(() => near
    ? { latitude: near.lat, longitude: near.lng, latitudeDelta: 1.2, longitudeDelta: 1.2 }
    : fitRegion(pts), [near, pts]);
  // where the reader has moved the map; a new starting view (search, category, Near me) replaces it
  const [moved, setMoved] = useState<{ from: Region; r: Region } | null>(null);
  const region = moved && moved.from === start ? moved.r : start;
  const groups = useMemo(() => groupPoints(pts, region), [pts, region]);
  const map = useRef<MapView>(null);

  if (failed && !all) return <Body muted>{t('app.load_error_dir', 'Could not load the directory. Try again in a moment.')}</Body>;
  if (!all) return <ActivityIndicator style={{ marginTop: 40 }} />;

  const zoomTo = (g: Group) => {
    const r = fitRegion(g.pts);
    // a circle whose places are all very close: zoom in by a step instead of fitting exactly
    map.current?.animateToRegion(r.latitudeDelta < region.latitudeDelta / 2 ? r
      : { latitude: g.lat, longitude: g.lng, latitudeDelta: region.latitudeDelta / 3, longitudeDelta: region.longitudeDelta / 3 }, 350);
  };

  return (
    <View style={{ gap: 6 }}>
      {/* initialRegion (not region) so the map stays where the reader moves it; a new search, category or Near me re-centers it */}
      <MapView ref={map} key={(near ? 'near-' + near.lat + ',' + near.lng : 'all') + '|' + (cat || '') + '|' + q}
        style={styles.map} initialRegion={start} showsUserLocation={!!near} toolbarEnabled={false}
        onRegionChangeComplete={(r) => setMoved({ from: start, r })}>
        {groups.map((g) => g.pts.length === 1 ? (
          <Marker key={g.key} coordinate={{ latitude: g.lat, longitude: g.lng }} pinColor="#C9A035">
            <Callout onPress={() => router.push({ pathname: '/directory/[id]', params: { id: g.pts[0].id } })}
              accessibilityLabel={g.pts[0].name}>
              {/* Callout content must be plain native views */}
              <View style={styles.callout}>
                <Text style={styles.ct} numberOfLines={2}>{g.pts[0].name}</Text>
                {g.pts[0].place ? <Text style={styles.cs} numberOfLines={1}>{g.pts[0].place}</Text> : null}
                <Text style={styles.cl}>{t('app.open', 'Open')} ›</Text>
              </View>
            </Callout>
          </Marker>
        ) : (
          <Marker key={g.key} coordinate={{ latitude: g.lat, longitude: g.lng }} onPress={() => zoomTo(g)}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={t('app.map_group', '{n} places here. Tap to zoom in.').replace('{n}', String(g.pts.length))}>
            <View style={[styles.group, g.pts.length >= 100 ? styles.big : g.pts.length >= 10 ? styles.mid : null]}>
              <Text style={styles.gt}>{g.pts.length >= 1000 ? Math.floor(g.pts.length / 1000) + 'k' : g.pts.length}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <Body muted>{t('app.map_count', '{n} places on the map').replace('{n}', pts.length.toLocaleString())}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 460, borderRadius: 16 },
  callout: { maxWidth: 240, padding: 4, gap: 2 },
  ct: { fontWeight: '700', fontSize: 14, color: '#1E1810' },
  cs: { fontSize: 12, color: '#5C5346' },
  cl: { fontSize: 12, fontWeight: '700', color: '#7F6116' },
  group: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#C9A035', borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center' },
  mid: { width: 42, height: 42, borderRadius: 21 },
  big: { width: 50, height: 50, borderRadius: 25 },
  gt: { color: '#1E1810', fontWeight: '800', fontSize: 13 },
});
