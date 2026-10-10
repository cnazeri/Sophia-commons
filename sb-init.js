// Supabase client and session restore. Loaded with defer after supabase.js and before the app
// scripts (deferred scripts run in order). automation/prerender.mjs reads the URL and key from here.
const SUPABASE_URL = 'https://bnrvgitzbpocratvszgk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Quj2NdNaaDKJOe4UT5Y5nw_1Sog2yjI';
let _sb;
try {
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Check for existing session on page load
  _sb.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      window._supabaseUser = session.user;
      const uname = session.user.email ? session.user.email.split('@')[0] : 'user';
      window._scAuthDetail = { username: uname, user: session.user };
      window.dispatchEvent(new CustomEvent('supabase-auth-ready', { detail: window._scAuthDetail }));
    }
  });

  // Listen for auth state changes (login, logout, token refresh)
  _sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      window._supabaseUser = session.user;
    } else if (event === 'SIGNED_OUT') {
      window._supabaseUser = null;
    }
  });
} catch(e) {
  console.warn('Supabase not available:', e.message);
  _sb = null;
}
