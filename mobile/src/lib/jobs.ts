// Jobs: the same public job listings as the website (listings table, category 11, active and not expired).
import { supabase } from '@/lib/supabase';

export type Job = {
  id: string; title: string; description?: string | null; location?: string | null; region?: string | null; country?: string | null;
  website_url?: string | null; contact_email?: string | null; contact_phone?: string | null;
  tags?: string[] | null; created_at: string; expires_at?: string | null; image_url?: string | null;
};

const JOBS_CAT_ID = 11;
const FIELDS = 'id,title,description,location,region,country,website_url,contact_email,contact_phone,tags,created_at,expires_at,image_url';
const live = (j: Job) => !j.expires_at || Date.parse(j.expires_at) > Date.now();
const featured = (j: Job) => (j.tags || []).includes('featured');

/** Newest first, featured jobs on top. Optional search across title, place and country. */
export async function fetchJobs(q = '', limit = 200): Promise<Job[]> {
  let query = supabase.from('listings').select(FIELDS).eq('status', 'active').eq('category_id', JOBS_CAT_ID)
    .order('created_at', { ascending: false }).limit(limit);
  const term = q.trim().replace(/[%,()]/g, ' ');
  if (term) query = query.or(`title.ilike.%${term}%,location.ilike.%${term}%,country.ilike.%${term}%,description.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = ((data || []) as Job[]).filter(live);
  return [...rows.filter(featured), ...rows.filter((j) => !featured(j))];
}

export async function fetchJob(id: string): Promise<Job | null> {
  const { data, error } = await supabase.from('listings').select(FIELDS).eq('id', id).eq('category_id', JOBS_CAT_ID).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Job) || null;
}

export const jobPlace = (j: Job) => [j.location, j.region, j.country].filter(Boolean).join(', ');
