// /mcp: the Sophia Commons MCP server, so AI assistants (Claude, ChatGPT and other MCP clients) can
// search the directory and events directly. The protocol and tools live in automation/mcp_server.mjs.
import { supabase, rest } from '../../automation/edge_db.mjs';
import { handleHttp } from '../../automation/mcp_server.mjs';

export default (request) => handleHttp(request, () => supabase(new URL(request.url).origin), rest);

export const config = { path: '/mcp', cache: 'manual' };
