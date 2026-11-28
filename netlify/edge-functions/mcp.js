// /mcp: the Sophia Commons MCP server, so AI assistants (Claude, ChatGPT and other MCP clients) can
// search the directory and events directly. The protocol and tools live in automation/mcp_server.mjs.
import { supabase, rest } from '../../automation/edge_db.mjs';
import { handleHttp } from '../../automation/mcp_server.mjs';

// Steiner lecture and audio indexes are static files on the site; load each once per edge instance.
const files = {};
const loadJson = origin => name => (files[name] ||= fetch(`${origin}/${name}`)
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .catch(err => { console.error('mcp file', name, String(err)); delete files[name]; return null; }));

// Usage log: one row per tool call in ai_app_calls (insert-only for the public key). If the table is not
// there yet, log to the function log only.
let logTable = true;
const logCall = origin => async row => {
  console.log('mcp_call', JSON.stringify(row));
  if (!logTable) return;
  const { url, key } = await supabase(origin);
  const r = await fetch(url + '/rest/v1/ai_app_calls', { method: 'POST', body: JSON.stringify(row),
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' } });
  if (r.status === 404) logTable = false;
  else if (!r.ok) console.error('mcp log insert', r.status);
};

export default (request) => {
  const origin = new URL(request.url).origin;
  return handleHttp(request, () => supabase(origin), rest, loadJson(origin), logCall(origin));
};

export const config = { path: '/mcp', cache: 'manual' };
