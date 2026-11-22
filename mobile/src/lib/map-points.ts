// Every directory place with a map position, for the Directory map. The list view shows 60 results at a time;
// the map needs all of them (about 4,800), so it loads a slim copy (name, town, category, position) once and keeps
// it on the phone for a day, which also lets the map work offline.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type Pt = { id: string; name: string; place: string; cat: string; lat: number; lng: number };
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type Group = { key: string; lat: number; lng: number; pts: Pt[] };

const KEY = 'sc_map_points_v1';
const DAY = 24 * 3600 * 1000;
const PAGE = 1000; // the database returns at most 1,000 rows per request
let memory: Pt[] | null = null;

type Row = { id: string; organization_name: string; city: string | null; location: string | null; country: string | null; category: string | null; latitude: number; longitude: number };

async function download(): Promise<Pt[]> {
  const out: Pt[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('directory_entries')
      .select('id,organization_name,city,location,country,category,latitude,longitude')
      .eq('status', 'approved').neq('category', 'social_media').not('latitude', 'is', null).not('longitude', 'is', null)
      .order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data || []) as Row[]) {
      out.push({ id: r.id, name: r.organization_name, place: [r.city || r.location, r.country].filter(Boolean).join(', '),
        cat: r.category || '', lat: Number(r.latitude), lng: Number(r.longitude) });
    }
    if (!data || data.length < PAGE) return out;
  }
}

export async function fetchMapPoints(): Promise<Pt[]> {
  if (memory) return memory;
  let cached: { at: number; pts: Pt[] } | null = null;
  try { const raw = await AsyncStorage.getItem(KEY); cached = raw ? JSON.parse(raw) : null; } catch { cached = null; }
  if (cached && Date.now() - cached.at < DAY) return (memory = cached.pts);
  try {
    const pts = await download();
    AsyncStorage.setItem(KEY, JSON.stringify({ at: Date.now(), pts })).catch(() => {});
    return (memory = pts);
  } catch (e) {
    if (cached) return (memory = cached.pts); // offline: last saved copy, even if older than a day
    throw e;
  }
}

// Category chip and search words, applied on the phone (name, town and country)
export function filterPoints(pts: Pt[], cat: string | null, q: string): Pt[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return pts.filter((p) => (!cat || p.cat === cat) &&
    words.every((w) => p.name.toLowerCase().includes(w) || p.place.toLowerCase().includes(w)));
}

// Up to MAX_PINS visible places are drawn as pins. Above that, places are grouped into a grid over the visible area
// (about 6 x 8 cells) and each crowded cell is one numbered circle; zooming in splits it.
export const MAX_PINS = 200;
export function groupPoints(pts: Pt[], r: Region): Group[] {
  const latPad = r.latitudeDelta * 0.6, lngPad = r.longitudeDelta * 0.6; // a little beyond the edges, so panning is smooth
  const seen = r.longitudeDelta >= 300
    ? pts.filter((p) => Math.abs(p.lat - r.latitude) <= latPad)
    : pts.filter((p) => Math.abs(p.lat - r.latitude) <= latPad && Math.abs(((p.lng - r.longitude + 540) % 360) - 180) <= lngPad);
  if (seen.length <= MAX_PINS) return seen.map((p) => ({ key: p.id, lat: p.lat, lng: p.lng, pts: [p] }));
  const cellLat = r.latitudeDelta / 8, cellLng = r.longitudeDelta / 6;
  const cells = new Map<string, Pt[]>();
  for (const p of seen) {
    const k = Math.floor(p.lat / cellLat) + ':' + Math.floor(p.lng / cellLng);
    const list = cells.get(k);
    if (list) list.push(p); else cells.set(k, [p]);
  }
  return [...cells.entries()].map(([k, list]) => ({
    key: list.length === 1 ? list[0].id : 'g' + k + ':' + list.length,
    lat: list.reduce((s, p) => s + p.lat, 0) / list.length,
    lng: list.reduce((s, p) => s + p.lng, 0) / list.length,
    pts: list,
  }));
}

// The view that fits a set of places (used to open on the right area, and when a circle is tapped)
export function fitRegion(pts: { lat: number; lng: number }[]): Region {
  if (!pts.length) return { latitude: 30, longitude: 0, latitudeDelta: 120, longitudeDelta: 160 };
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // Worldwide sets: a phone map cannot zoom out to the whole globe, so open over the Atlantic, where North America
  // and Europe (most of the directory) are both in view
  if (d - c > 180) return { latitude: 35, longitude: -35, latitudeDelta: 100, longitudeDelta: 160 };
  return { latitude: (a + b) / 2, longitude: (c + d) / 2,
    latitudeDelta: Math.min(150, Math.max(0.05, (b - a) * 1.4)), longitudeDelta: Math.min(300, Math.max(0.05, (d - c) * 1.4)) };
}
