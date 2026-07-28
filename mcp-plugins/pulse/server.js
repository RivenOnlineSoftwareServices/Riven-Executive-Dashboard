#!/usr/bin/env node
'use strict';

/*
 * Glowming Pulse MCP server (zero-dependency).
 *
 * Wraps the Pulse /v1/* HTTP API and exposes it to Cowork as MCP tools so
 * Live Artifacts can call window.cowork.callMcpTool('mcp__pulse__<tool>', ...).
 *
 * - Speaks MCP over stdio (newline-delimited JSON-RPC 2.0).
 * - Uses only Node built-ins + global fetch (Node 18+). No npm install needed.
 * - The bearer token is injected from the environment (PULSE_BEARER_TOKEN),
 *   which the plugin populates from the install-time userConfig. The token is
 *   NEVER written to disk or returned to the model.
 */

const readline = require('readline');

/**
 * Reads a value the plugin runtime was supposed to substitute.
 *
 * WHY THIS EXISTS (2026-07-28). `.mcp.json` used `${PLUGIN_CONFIG_<key>}`, which
 * is NOT a placeholder Claude Code implements — the documented syntax is
 * `${user_config.<key>}`. Nothing substituted it, so the literal string
 * `"${PLUGIN_CONFIG_bearer_token}"` arrived in the environment. A plain
 * `process.env.X || fallback` does not catch that, because a literal placeholder
 * is a NON-EMPTY string and therefore truthy: the URL fallback was skipped and a
 * garbage bearer was sent, so an executive saw an auth failure rather than
 * "not configured". The syntax is fixed; this guard means a future drift in it
 * fails LOUDLY at startup instead of silently for weeks.
 */
function configValue(name, key) {
  const raw = process.env[name];
  if (!raw) return '';
  const trimmed = raw.trim();
  /*
   * Matched against the two EXACT placeholder spellings this plugin has ever
   * used, not a general `${...}` shape (Codex review, findings 1 and 2). A broad
   * pattern would treat a legitimate token that merely happened to be brace-
   * wrapped as unset, and the value is NEVER logged: one of these fields is a
   * bearer token, so echoing it to diagnose it would be the worse bug.
   */
  const UNRESOLVED = ['${user_config.' + key + '}', '${PLUGIN_CONFIG_' + key + '}'];
  if (UNRESOLVED.includes(trimmed)) {
    console.error(
      '[pulse] ' + name + ' arrived as an UNSUBSTITUTED placeholder — the plugin ' +
      'runtime did not resolve it. Check that .mcp.json uses ${user_config.' + key +
      '} and that a value is set in the plugin config. Treating it as unset. ' +
      '(The value itself is deliberately not logged.)',
    );
    return '';
  }
  return raw;
}

const BASE_URL = (configValue('PULSE_API_BASE_URL', 'base_url') || 'https://pulse-api-txrwzaee2q-ew.a.run.app').replace(/\/+$/, '');
const TOKEN = configValue('PULSE_BEARER_TOKEN', 'bearer_token');
const SERVER_VERSION = '1.0.0';

// Short-TTL in-memory response cache. The underlying Pulse data changes at most
// daily, but dashboard tiles re-render and re-call constantly, so we serve a
// cached body for repeated calls within the window. Keyed by request path.
// Only ok:true responses are cached (errors are never cached). Zero-dependency.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// Hard cap so a long-lived MCP process can't grow unbounded — mart.limit varies
// 1..10000, so distinct paths (and thus keys) are effectively unbounded.
const CACHE_MAX = 256;
const responseCache = new Map(); // path -> { expires: <ms epoch>, result: <pulseGet return> }

// The 9 canonical marts (lower_snake_case, as the route expects).
const KNOWN_MARTS = [
  'daily_snapshot',
  'checkout_funnel',
  'customer_clv',
  'inventory_health',
  'abandoned_recovery',
  'ad_performance',
  'product_performance',
  'product_quality',
  'review_velocity'
];

const TOOLS = [
  {
    name: 'snapshot_today',
    description: "Glowming exec daily snapshot: yesterday's KPIs + narrative. GET /v1/snapshot/today (scope snapshot.read). Returns the full {data, meta} envelope as JSON.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'digest_this_week',
    description: 'Glowming weekly executive digest (Mon-Sun): iso_week + markdown. GET /v1/digest/this-week (scope digest.read). May return 503 until the weekly job has run. Returns the full {data, meta} envelope as JSON.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'mart',
    description: 'Rows of a materialised Pulse mart. GET /v1/marts/<name> (scope marts.read). Returns the full {data, meta} envelope as JSON. The nine marts: ' + KNOWN_MARTS.join(', ') + '.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: KNOWN_MARTS, description: 'Mart name (one of the nine).' },
        limit: { type: 'integer', minimum: 1, maximum: 10000, description: 'Max rows (default 1000, cap 10000).' }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'mart_meta',
    description: 'Freshness metadata for a mart (latest successful refresh: status, response_age_seconds, rows_written, data_through_ts). GET /v1/marts/<name>/meta (scope marts.read). Returns the full {data, meta} envelope as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: KNOWN_MARTS, description: 'Mart name (one of the nine).' }
      },
      required: ['name'],
      additionalProperties: false
    }
  }
];

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function log() { process.stderr.write('[pulse-mcp] ' + Array.prototype.join.call(arguments, ' ') + '\n'); }

async function pulseFetch(path) {
  if (!TOKEN) {
    return { ok: false, status: 0, body: { error: { code: 'no_token', message: 'PULSE_BEARER_TOKEN is not configured. Set the bearer token in the Pulse plugin config.' } } };
  }
  let res;
  try {
    res = await fetch(BASE_URL + path, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' } });
  } catch (e) {
    return { ok: false, status: 0, body: { error: { code: 'network_error', message: String((e && e.message) || e) } } };
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

// Cache-wrapped GET. Returns the cached body for repeated calls to the same path
// within CACHE_TTL_MS. Only successful (ok:true) responses are cached; errors
// always hit the network so transient failures aren't pinned for the TTL.
async function pulseGet(path) {
  const now = Date.now();
  const hit = responseCache.get(path);
  if (hit && hit.expires > now) return hit.result;
  if (hit) responseCache.delete(path); // expired — drop it
  const result = await pulseFetch(path);
  if (result.ok) {
    // Bound the cache: sweep expired entries under pressure, then evict
    // oldest-first (Map preserves insertion order) until under the cap.
    if (responseCache.size >= CACHE_MAX) {
      for (const [k, v] of responseCache) if (v.expires <= now) responseCache.delete(k);
      while (responseCache.size >= CACHE_MAX) {
        const oldest = responseCache.keys().next().value;
        if (oldest === undefined) break;
        responseCache.delete(oldest);
      }
    }
    responseCache.set(path, { expires: now + CACHE_TTL_MS, result: result });
  }
  return result;
}

function toolError(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: { code: 'bad_request', message: message } }) }], isError: true };
}

async function callTool(name, args) {
  args = args || {};
  let path;
  if (name === 'snapshot_today') {
    path = '/v1/snapshot/today';
  } else if (name === 'digest_this_week') {
    path = '/v1/digest/this-week';
  } else if (name === 'mart') {
    if (!KNOWN_MARTS.includes(args.name)) return toolError('Unknown mart "' + args.name + '". Known: ' + KNOWN_MARTS.join(', '));
    let q = '';
    if (args.limit != null) {
      const lim = Math.max(1, Math.min(10000, parseInt(args.limit, 10) || 1000));
      q = '?limit=' + lim;
    }
    path = '/v1/marts/' + args.name + q;
  } else if (name === 'mart_meta') {
    if (!KNOWN_MARTS.includes(args.name)) return toolError('Unknown mart "' + args.name + '". Known: ' + KNOWN_MARTS.join(', '));
    path = '/v1/marts/' + args.name + '/meta';
  } else {
    return toolError('Unknown tool: ' + name);
  }
  const r = await pulseGet(path);
  const payload = JSON.stringify(r.body);
  return r.ok ? { content: [{ type: 'text', text: payload }] } : { content: [{ type: 'text', text: payload }], isError: true };
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
      send({ jsonrpc: '2.0', id: id, result: { protocolVersion: pv, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'pulse', version: SERVER_VERSION } } });
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
