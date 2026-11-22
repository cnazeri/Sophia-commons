// Connection to the same database as sophiacommons.org.
// The publishable key is public by design (it is in the website's own page); row security limits what it can do.
// Members who sign in (for chat) stay signed in: the session is kept on the phone and refreshed while the app is open.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const SUPABASE_URL = 'https://bnrvgitzbpocratvszgk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Quj2NdNaaDKJOe4UT5Y5nw_1Sog2yjI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Refresh the sign-in only while the app is in the foreground (Supabase's guidance for React Native)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const SITE = 'https://sophiacommons.org';
