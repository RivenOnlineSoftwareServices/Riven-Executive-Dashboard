#!/usr/bin/env node
'use strict';

/*
 * The Collective MCP server (zero-dependency) — PROTOTYPE.
 *
 * Wraps the deployed Collective retrieval gateway (POST /api/search) and exposes
 * it to Cowork as MCP tools so an executive Live Artifact can call
 * window.cowork.callMcpTool('mcp__collective__<tool>', ...) to ask the personas /
 * search Alice — WITHOUT holding any Pinecone keys.
 *
 * Mirrors the proven pulse-mcp-plugin shape:
 *  - MCP over stdio (newline-delimited JSON-RPC 2.0).
 *  - Node built-ins + global fetch only. No npm install.
 *  - Token from env (COLLECTIVE_GATEWAY_TOKEN), populated at install from
 *    userConfig. Sent as the X-Collective-Token header (the gateway's primary
 *    channel — App Hosting's LB claims Authorization). NEVER logged or returned.
 *
 * Scope is enforced GATEWAY-SIDE (a token maps to an allowed namespace set), so
 * an exec token physically cannot reach `business` / personal corpora even if a
 * tool here asked for them. The enums below are UX guard-rails, not the security.
 */

const readline = require('readline');
const { createHash } = require('crypto');

const BASE_URL = (process.env.COLLECTIVE_GATEWAY_URL || 'https://chat.glowming.business').replace(/\/+$/, '');
const TOKEN = process.env.COLLECTIVE_GATEWAY_TOKEN || '';
const SERVER_VERSION = '0.1.0';

// Mirrors the gateway allowlist (src/app/api/search/route.ts). The gateway is the
// real authority — these keep bad input from leaving the machine.
const ALLOWED_INDEX = ['heyu', 'alice'];
const ALLOWED_NAMESPACES = [
  'iris_persona', 'iris_patterns', 'iris_methodology', 'iris_news_global', 'iris_news_sa',
  'zac_persona', 'zac_patterns', 'zac_methodology', 'zac_news_global', 'zac_news_sa',
  'heyu_persona', 'heyu_patterns', 'heyu_methodology', 'heyu_news_global', 'heyu_news_sa',
  'alice_persona', 'research',
  'glowming_general', 'glowming_business', 'methodology', 'business',
];

// Persona shortcuts — a curated (index, namespace) fan, trimmed from
// persona_retrieve.py PERSONA_CONFIG all_ns to the exec-relevant core.
const PERSONAS = {
  alice: [['alice', 'glowming_general'], ['alice', 'glowming_business'], ['heyu', 'alice_persona']],
  heyu:  [['heyu', 'heyu_methodology'], ['heyu', 'heyu_persona'], ['alice', 'glowming_general']],
  iris:  [['heyu', 'iris_methodology'], ['heyu', 'research'], ['alice', 'glowming_general']],
  zac:   [['heyu', 'zac_methodology'], ['heyu', 'zac_persona']],
};

const TOOLS = [
  {
    name: 'collective_search',
    description: 'Semantic search of one Collective namespace via the retrieval gateway. Returns reranked hits {score, source_file, type, text}. Index is "heyu" or "alice".',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'string', enum: ALLOWED_INDEX },
        namespace: { type: 'string', enum: ALLOWED_NAMESPACES },
        query: { type: 'string', description: 'Natural-language query (max 4000 chars).' },
        topK: { type: 'integer', minimum: 1, maximum: 50, description: 'Candidates to fetch (default 12).' },
        topN: { type: 'integer', minimum: 1, maximum: 50, description: 'Reranked hits to return (default 5).' },
        type: { type: 'string', description: 'Optional metadata type filter (e.g. "persona", "finding").' },
      },
      required: ['index', 'namespace', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_persona',
    description: 'Ask a Collective persona a question: fans the query across that persona\'s core namespaces and returns the merged top hits. Personas: alice (brand canon + Glowming ops), heyu (marketing/copy), iris (research/evidence), zac (design).',
    inputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string', enum: Object.keys(PERSONAS) },
        query: { type: 'string', description: 'What to ask the persona.' },
        topN: { type: 'integer', minimum: 1, maximum: 10, description: 'Hits per namespace (default 3).' },
      },
      required: ['persona', 'query'],
      additionalProperties: false,
    },
  },
];

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function log() { process.stderr.write('[collective-mcp] ' + Array.prototype.join.call(arguments, ' ') + '\n'); }

// In-memory TTL cache (zero-dependency) keyed by the request payload, so repeated
// identical searches from a dashboard don't re-hit the gateway. Only SUCCESSFUL
// responses are cached; errors are never cached so a transient failure self-heals.
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 500; // bound memory; evict oldest when exceeded.
const searchCache = new Map(); // key -> { expires, body }

function cacheGet(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry.body;
}

function cacheSet(key, body) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, { expires: Date.now() + CACHE_TTL_MS, body: body });
}

async function gatewaySearch(index, namespace, query, topK, topN, type) {
  if (!TOKEN) {
    return { error: { code: 'no_token', message: 'COLLECTIVE_GATEWAY_TOKEN is not configured. Set it in the Collective plugin config.' } };
  }
  const payload = { index, namespace, query };
  if (topK != null) payload.topK = topK;
  if (topN != null) payload.topN = topN;
  if (type) payload.type = type;
  // Cache key is a hash of the payload (not the raw query) — identical searches
  // share one gateway hit without retaining query text in the cache's keys.
  const cacheKey = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  let res;
  try {
    res = await fetch(BASE_URL + '/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Collective-Token': TOKEN },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { error: { code: 'network_error', message: String((e && e.message) || e) } };
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
  if (!res.ok) return { error: { code: 'http_' + res.status, message: (body && body.error) || text } };
  cacheSet(cacheKey, body); // only successful responses are cached (60s TTL).
  return body; // { hits: [...] }
}

function asText(obj, isError) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }], isError: !!isError };
}

async function callTool(name, args) {
  args = args || {};
  if (name === 'collective_search') {
    const r = await gatewaySearch(args.index, args.namespace, args.query, args.topK, args.topN, args.type);
    return asText(r, !!r.error);
  }
  if (name === 'ask_persona') {
    const sets = PERSONAS[args.persona];
    if (!sets) return asText({ error: { code: 'bad_request', message: 'Unknown persona "' + args.persona + '". Known: ' + Object.keys(PERSONAS).join(', ') } }, true);
    const topN = args.topN != null ? Math.max(1, Math.min(10, parseInt(args.topN, 10) || 3)) : 3;
    const results = await Promise.all(sets.map(([idx, ns]) =>
      gatewaySearch(idx, ns, args.query, Math.max(8, topN * 2), topN)
        .then((r) => ({ index: idx, namespace: ns, hits: r.hits || [], error: r.error }))));
    const anyOk = results.some((r) => !r.error);
    return asText({ persona: args.persona, query: args.query, results }, !anyOk);
  }
  return asText({ error: { code: 'bad_request', message: 'Unknown tool: ' + name } }, true);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async function (line) {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  const id = msg.id;
  const method = msg.method;
  const params = msg.params || {};
  try {
    if (method === 'initialize') {
      const pv = params.protocolVersion || '2025-06-18';
      send({ jsonrpc: '2.0', id: id, result: { protocolVersion: pv, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'collective', version: SERVER_VERSION } } });
    } else if (method === 'notifications/initialized' || method === 'initialized') {
      // notification: no response
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id: id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const result = await callTool(params.name, params.arguments);
      send({ jsonrpc: '2.0', id: id, result: result });
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id: id, result: {} });
    } else if (id !== undefined && id !== null) {
      send({ jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } });
    }
  } catch (e) {
    if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id: id, error: { code: -32603, message: String((e && e.message) || e) } });
  }
});

log('started; base=' + BASE_URL + '; token=' + (TOKEN ? 'set' : 'MISSING'));
