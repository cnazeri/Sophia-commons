// The web preview has no native map; the phone apps show Apple Maps (iPhone) or Google Maps (Android).
import { useEffect, useState } from 'react';

import { Body } from '@/components/ui';
import { type Pt, fetchMapPoints, filterPoints } from '@/lib/map-points';

export function DirectoryMap({ cat, q }: { cat: string | null; q: string; near?: { lat: number; lng: number } | null }) {
  const [all, setAll] = useState<Pt[] | null>(null);
  useEffect(() => { fetchMapPoints().then(setAll).catch(() => setAll([])); }, []);
  const n = all ? filterPoints(all, cat, q).length : 0;
  return <Body muted>Map preview: {all ? n.toLocaleString() : '...'} places with a location. The map itself shows in the phone app.</Body>;
}
