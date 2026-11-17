// /api/geo: the visitor's country code from Netlify's IP lookup, so the site can open in German for
// visitors in Germany who have not picked a language yet (owner, 2026-11-17). Returns only the
// two-letter country code; nothing is stored or logged. Never cached: each visitor gets their own answer.
export default async (request, context) => {
  const country = (context.geo && context.geo.country && context.geo.country.code) || '';
  return new Response(JSON.stringify({ country }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};

export const config = { path: '/api/geo', cache: 'manual' };
