// Read-only connection to the same database as sophiacommons.org.
// The publishable key is public by design (it is in the website's own page); row security limits it to public data.
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bnrvgitzbpocratvszgk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Quj2NdNaaDKJOe4UT5Y5nw_1Sog2yjI';

// v1 has no sign-in, so no session is stored on the phone.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export const SITE = 'https://sophiacommons.org';
