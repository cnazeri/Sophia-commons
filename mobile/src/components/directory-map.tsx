// Directory map on the phone: Apple Maps on iPhone, Google Maps on Android. One pin per place with coordinates;
// tapping the pin's label opens the place.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';

import { type Listing, listingPlace } from '@/lib/directory';

type Props = { rows: Listing[]; near?: { lat: number; lng: number } | null };

export function DirectoryMap({ rows, near }: Props) {
  const pins = useMemo(() => rows.filter((l) => l.latitude != null && l.longitude != null).slice(0, 300), [rows]);
  const region = useMemo(() => {
    if (near) return { latitude: near.lat, longitude: near.lng, latitudeDelta: 1.2, longitudeDelta: 1.2 };
    if (!pins.length) return { latitude: 30, longitude: 0, latitudeDelta: 120, longitudeDelta: 160 };
    const lats = pins.map((p) => p.latitude as number), lngs = pins.map((p) => p.longitude as number);
    const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    return { latitude: (a + b) / 2, longitude: (c + d) / 2, latitudeDelta: Math.min(150, Math.max(0.2, (b - a) * 1.3)), longitudeDelta: Math.min(300, Math.max(0.2, (d - c) * 1.3)) };
  }, [pins, near]);

  return (
    // initialRegion (not region) so the map stays where the reader moves it; a new search or Near me re-centers it
    <MapView key={near ? 'near-' + near.lat + ',' + near.lng : 'all-' + pins.length + '-' + (pins[0]?.id || '')}
      style={styles.map} initialRegion={region} showsUserLocation={!!near} toolbarEnabled={false}>
      {pins.map((l) => (
        <Marker key={l.id} coordinate={{ latitude: l.latitude as number, longitude: l.longitude as number }} pinColor="#C9A035">
          <Callout onPress={() => router.push({ pathname: '/directory/[id]', params: { id: l.id } })}
            accessibilityLabel={l.organization_name}>
            {/* Callout content must be plain native views */}
            <CalloutText title={l.organization_name} sub={listingPlace(l)} />
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

function CalloutText({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.callout}>
      <Text style={styles.ct} numberOfLines={2}>{title}</Text>
      {sub ? <Text style={styles.cs} numberOfLines={1}>{sub}</Text> : null}
      <Text style={styles.cl}>Open ›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 460, borderRadius: 16 },
  callout: { maxWidth: 240, padding: 4, gap: 2 },
  ct: { fontWeight: '700', fontSize: 14, color: '#1E1810' },
  cs: { fontSize: 12, color: '#5C5346' },
  cl: { fontSize: 12, fontWeight: '700', color: '#7F6116' },
});
