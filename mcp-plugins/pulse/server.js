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
 * - The bearer token comes from EITHER the environment (PULSE_BEARER_TOKEN, which
 *   the plugin populates from install-time userConfig) OR a stored credential
 *   written by the `link_account` tool. The token is never logged, never echoed
 *   back, and never returned to the model.
 *
 * WHY link_account EXISTS (2026-07-29). Install-time userConfig is the ONLY
 * chance a host gives an executive to enter a token: once a plugin is installed
 * its config is READ-ONLY (the per-plugin menu offers Uninstall, not Configure,
 * and the values render as display text). An exec who installs without entering
 * the token, or whose host surface shows no config field at all, is then stuck
 * with no way in and a plugin that only says "unauthorized". Three separate
 * onboarding attempts failed on exactly that. So token entry no longer depends
 * on a dialog existing: the exec can hand the token to the plugin in chat, and
 * the plugin validates it against the live API before storing it.
 */

const readline = require('readline');
const fs = require('fs');
const os = require('os');
// Named nodePath, not path: callTool declares a local `path` for the request URL,
// and a same-named module import would be a shadowing trap for the next edit.
const nodePath = require('path');

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
const SERVER_VERSION = '1.1.0';

/*
 * Stored-credential path. Kept OUTSIDE the plugin directory on purpose: a plugin
 * folder is replaced wholesale on upgrade/reinstall, and a token that vanishes
 * when an exec reinstalls would recreate the very dead end this fixes.
 */
const CRED_DIR = nodePath.join(os.homedir(), '.riven');
const CRED_FILE = nodePath.join(CRED_DIR, 'pulse-token.json');

/** Reads the stored bearer token, or '' if there isn't a usable one. */
function readStoredToken() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
    const t = parsed && typeof parsed.bearer_token === 'string' ? parsed.bearer_token.trim() : '';
    return t;
  } catch (e) {
    // Absent, unreadable or malformed all mean the same thing to the caller:
    // there is no stored token. Deliberately silent — this runs at startup on
    // every launch, and the common case (never linked) is not an error.
    return '';
  }
}

/**
 * Persists the bearer token for future sessions.
 *
 * mode 0o600 = owner read/write only. That is enforced on macOS/Linux; on Windows
 * it is largely advisory, but the file sits under the user profile, which already
 * carries a per-user ACL. Callers MUST validate the token before calling this —
 * storing an unvalidated value is how an exec ends up permanently "linked" to a
 * token that never worked.
 */
function writeStoredToken(token) {
  fs.mkdirSync(CRED_DIR, { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify({ bearer_token: token }, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(CRED_FILE, 0o600); } catch (e) { /* Windows: not meaningful, not fatal. */ }
}

/*
 * Mutable: `link_account` can set this mid-session, so an exec who links is
 * working immediately rather than being told to restart the app.
 */
let TOKEN = configValue('PULSE_BEARER_TOKEN', 'bearer_token') || readStoredToken();

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
    name: 'link_account',
    description:
      "Link this Pulse plugin to the executive's account by supplying their Pulse API bearer token. " +
      'Use this whenever a Pulse tool reports that no token is configured, or when the user asks to ' +
      'connect / link / set up / re-link Pulse, or pastes a token. The token comes from the Business ' +
      'App: Riven > Exec Tools > Your access tokens. The token is validated against the live API before ' +
      'being stored, so a wrong value is rejected immediately rather than failing later. Never print the ' +
      'token back to the user.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'The Pulse API bearer token to validate and store.' }
      },
      required: ['token'],
      additionalProperties: false
    }
  },
  {
    name: 'link_status',
    description:
      'Reports whether this Pulse plugin currently has a working token, where that token came from ' +
      '(install-time config or a stored link), and whether the live API accepts it. Reveals no secret ' +
      'values. Use this to diagnose "it is not working" before asking the user for anything.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
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

/*
 * The message an executive actually sees when nothing is configured. It names the
 * ONE action that works on every host surface — hand the token over in chat —
 * rather than pointing at a plugin config field that may be read-only or absent.
 */
const NO_TOKEN_MESSAGE =
  'Glowming Pulse is not linked to your account yet. To link it: open the Business App, ' +
  'go to Riven > Exec Tools > Your access tokens, copy your Pulse API bearer token, and paste ' +
  'it here saying "link my Pulse account with this token". I will validate and store it, and ' +
  'you will not need to do this again. (You do NOT need to reinstall the plugin.)';

async function pulseFetch(path) {
  if (!TOKEN) {
    return { ok: false, status: 0, body: { error: { code: 'no_token', message: NO_TOKEN_MESSAGE } } };
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

/**
 * Probes the live API with a candidate token. Returns 'accepted' | 'rejected' | 'unreachable'.
 *
 * 401 is the ONLY rejection, and that is measured rather than assumed: probed
 * against the live service on 2026-07-29, both an unknown bearer and an absent
 * header return 401 with error.code "unauthorized". A 403 means the token is real
 * but lacks a scope; a 503 means the token is real but the weekly job has not run.
 * Treating either as a bad token would send an executive off to hunt for a
 * replacement they do not need — the exact wild goose chase this feature removes.
 *
 * Deliberately bypasses the response cache and the ambient TOKEN: it is testing a
 * candidate, not serving data.
 */
async function probeToken(candidate) {
  let res;
  try {
    res = await fetch(BASE_URL + '/v1/snapshot/today', {
      headers: { Authorization: 'Bearer ' + candidate, Accept: 'application/json' }
    });
  } catch (e) {
    return { state: 'unreachable', detail: String((e && e.message) || e) };
  }
  if (res.status === 401) return { state: 'rejected', detail: '401 unauthorized' };
  return { state: 'accepted', detail: 'HTTP ' + res.status };
}

/** Where the current token came from. Never includes the value itself. */
function tokenSource() {
  if (!TOKEN) return 'none';
  return configValue('PULSE_BEARER_TOKEN', 'bearer_token') ? 'plugin config (entered at install)' : 'stored link (link_account)';
}

/** Validates a supplied token against the live API, then stores it. */
async function linkAccount(rawToken) {
  const supplied = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!supplied) {
    return toolError(
      'No token supplied. Ask the user to copy their Pulse API bearer token from the Business App: ' +
      'Riven > Exec Tools > Your access tokens.'
    );
  }
  // Execs paste what they see, and what they see is sometimes the whole header.
  const candidate = supplied.replace(/^Bearer\s+/i, '').trim();

  const probe = await probeToken(candidate);
  if (probe.state === 'unreachable') {
    return toolError(
      'Could not reach the Pulse API to check that token, so NOTHING was saved (' + probe.detail + '). ' +
      'Check the internet connection and try again.'
    );
  }
  if (probe.state === 'rejected') {
    return toolError(
      'The Pulse API did not accept that token, so NOTHING was saved. Copy it again from the Business ' +
      'App: Riven > Exec Tools > Your access tokens — and check it is the PULSE token, not the Collective one.'
    );
  }

  TOKEN = candidate;
  // A different token can carry different scope, so the previous account's cached
  // rows must not survive a re-link.
  responseCache.clear();

  let persisted = true;
  let persistError = '';
  try {
    writeStoredToken(candidate);
  } catch (e) {
    persisted = false;
    persistError = String((e && e.message) || e);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: true,
        linked: true,
        persisted: persisted,
        message: persisted
          ? 'Pulse is linked and the API accepted the token. Saved for future sessions — no reinstall needed.'
          : 'Pulse is linked and working for THIS session, but the token could not be saved to disk (' +
            persistError + '), so it will need re-linking next time.'
      })
    }]
  };
}

/** Reports link state without revealing any secret value. */
async function linkStatus() {
  if (!TOKEN) {
    return { content: [{ type: 'text', text: JSON.stringify({ linked: false, token_source: 'none', next_step: NO_TOKEN_MESSAGE }) }] };
  }
  const probe = await probeToken(TOKEN);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        linked: probe.state === 'accepted',
        token_source: tokenSource(),
        api_check: probe.state,
        detail: probe.detail,
        base_url: BASE_URL,
        next_step: probe.state === 'accepted'
          ? null
          : (probe.state === 'rejected'
            ? 'The stored token is no longer valid (it may have been rotated). Get a fresh one from the ' +
              'Business App: Riven > Exec Tools > Your access tokens, and re-link.'
            : 'The Pulse API was unreachable. This looks like a network problem, not a token problem.')
      })
    }]
  };
}

async function callTool(name, args) {
  args = args || {};
  // Link tools are handled first: they must work when no token is configured,
  // which is precisely when every other tool cannot.
  if (name === 'link_account') return linkAccount(args.token);
  if (name === 'link_status') return linkStatus();
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
