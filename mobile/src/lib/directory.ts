// The directory: same listings as sophiacommons.org.
import { supabase } from '@/lib/supabase';

export type Listing = {
  id: string;
  slug?: string | null;
  organization_name: string;
  category?: string | null;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  location?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  website_url?: string | null;
  email?: string | null;
  phone?: string | null;
  is_verified?: boolean | null;
};

const FIELDS = 'id,slug,organization_name,category,description,city,region,country,location,address,latitude,longitude,photo_url,website_url,email,phone,is_verified';

// Categories shown as chips (keys match the website's directory categories)
export const CATEGORIES = [
  { key: 'waldorf', label: 'Waldorf & education' },
  { key: 'biodynamic', label: 'Biodynamic' },
  { key: 'camphill', label: 'Camphill' },
  { key: 'christian_community', label: 'Christian Community' },
  { key: 'medicine', label: 'Medicine' },
  { key: 'eurythmy', label: 'Arts & eurythmy' },
  { key: 'societies', label: 'Groups & societies' },
  { key: 'eldercare', label: 'Eldercare' },
  { key: 'online', label: 'Online' },
] as const;

export async function searchListings(q: string, category: string | null, limit = 60): Promise<Listing[]> {
  let query = supabase.from('directory_entries').select(FIELDS).eq('status', 'approved').neq('category', 'social_media');
  if (category) query = query.eq('category', category);
  const words = q.trim().replace(/[,()%*]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
  for (const w of words) {
    query = query.or(`organization_name.ilike.%${w}%,city.ilike.%${w}%,country.ilike.%${w}%,description.ilike.%${w}%`);
  }
  // Fullest listings first when nothing is typed: the ones with a photo and a description
  const { data, error } = await query.order('photo_url', { ascending: true, nullsFirst: false }).order('organization_name').limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as Listing[];
}

// Listings around a point, nearest first (a box of about 150 km, then exact distance)
export async function nearListings(lat: number, lng: number, category: string | null, limit = 60): Promise<(Listing & { km: number })[]> {
  const dLat = 1.4, dLng = 1.4 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  let query = supabase.from('directory_entries').select(FIELDS).eq('status', 'approved').neq('category', 'social_media')
    .gte('latitude', lat - dLat).lte('latitude', lat + dLat).gte('longitude', lng - dLng).lte('longitude', lng + dLng);
  if (category) query = query.eq('category', category);
  const { data, error } = await query.limit(1000);
  if (error) throw new Error(error.message);
  const rad = Math.PI / 180;
  const km = (l: Listing) => {
    const a = Math.sin(((l.latitude! - lat) * rad) / 2) ** 2 + Math.cos(lat * rad) * Math.cos(l.latitude! * rad) * Math.sin(((l.longitude! - lng) * rad) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };
  return ((data || []) as Listing[]).map((l) => ({ ...l, km: km(l) })).sort((a, b) => a.km - b.km).slice(0, limit);
}

export async function fetchListing(id: string): Promise<Listing | null> {
  const byId = /^[0-9a-f-]{36}$/i.test(id);
  const { data, error } = await supabase.from('directory_entries').select(FIELDS).eq(byId ? 'id' : 'slug', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Listing | null;
}

export function listingPlace(l: Listing) {
  return [l.city || l.location, l.country].filter(Boolean).join(', ');
}
