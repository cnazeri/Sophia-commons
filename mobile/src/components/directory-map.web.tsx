// The web preview has no native map; the phone apps show Apple Maps (iPhone) or Google Maps (Android).
import { Body } from '@/components/ui';
import type { Listing } from '@/lib/directory';

export function DirectoryMap({ rows }: { rows: Listing[]; near?: { lat: number; lng: number } | null }) {
  const n = rows.filter((l) => l.latitude != null && l.longitude != null).length;
  return <Body muted>Map preview: {n} places with a location. The map itself shows in the phone app.</Body>;
}
