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
const fs = require('fs');
const os = require('os');
// Named nodePath, not path, to stay symmetrical with the pulse plugin, where a
// local `path` variable makes a same-named import a shadowing trap.
const nodePath = require('path');

/**
 * Reads a value the plugin runtime was supposed to substitute.
 *
 * WHY THIS EXISTS (2026-07-28). `.mcp.json` used `${PLUGIN_CONFIG_<key>}`, which
 * is NOT a placeholder Claude Code implements — the documented syntax is
 * `${user_config.<key>}`. Nothing substituted it, so the literal string arrived
 * in the environment. A plain `process.env.X || fallback` does not catch that,
 * because a literal placeholder is a NON-EMPTY string and therefore truthy: the
 * URL fallback was skipped and a garbage token was sent, so an executive saw an
 * auth failure rather than "not configured". The syntax is fixed; this guard
 * means a future drift in it fails LOUDLY at startup instead of silently.
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
   * gateway token, so echoing it to diagnose it would be the worse bug.
   */
  const UNRESOLVED = ['${user_config.' + key + '}', '${PLUGIN_CONFIG_' + key + '}'];
  if (UNRESOLVED.includes(trimmed)) {
    console.error(
      '[collective] ' + name + ' arrived as an UNSUBSTITUTED placeholder — the plugin ' +
      'runtime did not resolve it. Check that .mcp.json uses ${user_config.' + key +
      '} and that a value is set in the plugin config. Treating it as unset. ' +
      '(The value itself is deliberately not logged.)',
    );
    return '';
  }
  return raw;
}

const BASE_URL = (configValue('COLLECTIVE_GATEWAY_URL', 'gateway_url') || 'https://chat.glowming.business').replace(/\/+$/, '');
const SERVER_VERSION = '0.2.0';

/*
 * Stored-credential path. Kept OUTSIDE the plugin directory: a plugin folder is
 * replaced wholesale on upgrade/reinstall, and a token that vanished on reinstall
 * would recreate the dead end link_account exists to remove.
 *
 * WHY link_account EXISTS (2026-07-29). Install-time userConfig is the ONLY chance
 * a host gives an executive to enter a token — once installed, plugin config is
 * READ-ONLY (the per-plugin menu offers Uninstall, not Configure). An exec who
 * installs without entering the token, or whose surface shows no config field at
 * all, is then stuck with a plugin that only says "unauthorized" and no way in.
 * Three onboarding attempts failed on exactly that, so token entry no longer
 * depends on a dialog existing.
 */
const CRED_DIR = nodePath.join(os.homedir(), '.riven');
const CRED_FILE = nodePath.join(CRED_DIR, 'collective-token.json');

/** Reads the stored gateway token, or '' if there isn't a usable one. */
function readStoredToken() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
    return parsed && typeof parsed.gateway_token === 'string' ? parsed.gateway_token.trim() : '';
  } catch (e) {
    // Absent, unreadable and malformed all mean "no stored token" to the caller.
    // Silent by design: this runs at every launch and the common case is not an error.
    return '';
  }
}

/**
 * Persists the gateway token. Callers MUST validate it against the live gateway
 * first — storing an unvalidated value is how an exec ends up permanently "linked"
 * to a token that never worked. mode 0o600 is enforced on macOS/Linux; on Windows
 * it is advisory, but the file sits under the already per-user-ACL'd profile.
 */
function writeStoredToken(token) {
  fs.mkdirSync(CRED_DIR, { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify({ gateway_token: token }, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(CRED_FILE, 0o600); } catch (e) { /* Windows: not meaningful, not fatal. */ }
}

/* Mutable so link_account works mid-session, with no restart asked of the exec. */
let TOKEN = configValue('COLLECTIVE_GATEWAY_TOKEN', 'gateway_token') || readStoredToken();

/*
 * The message an exec actually sees when nothing is configured. It names the one
 * action that works on every host surface rather than pointing at a config field
 * that may be read-only or absent.
 */
const NO_TOKEN_MESSAGE =
  'The Collective is not linked to your account yet. To link it: open the Business App, ' +
  'go to Riven > Exec Tools > Your access tokens, copy your Collective gateway token, and paste ' +
  'it here saying "link my Collective account with this token". I will validate and store it, and ' +
  'you will not need to do this again. (You do NOT need to reinstall the plugin.)';

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
    name: 'link_account',
    description:
      "Link this Collective plugin to the executive's account by supplying their Collective gateway " +
      'token. Use this whenever a Collective tool reports that no token is configured, or when the ' +
      'user asks to connect / link / set up / re-link the Collective, or pastes a token. The token ' +
      'comes from the Business App: Riven > Exec Tools > Your access tokens. It is validated against ' +
      'the live gateway before being stored, so a wrong value is rejected immediately rather than ' +
      'failing later. Never print the token back to the user.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'The Collective gateway token to validate and store.' },
      },
      required: ['token'],
      additionalProperties: false,
    },
  },
  {
    name: 'link_status',
    description:
      'Reports whether this Collective plugin currently has a working token, where it came from ' +
      '(install-time config or a stored link), and whether the live gateway accepts it. Reveals no ' +
      'secret values. Use this to diagnose "it is not working" before asking the user for anything.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
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

/**
 * Probes the live gateway with a candidate token. Returns 'accepted' | 'rejected' | 'unreachable'.
 *
 * 401 is the ONLY rejection, and that is measured rather than assumed: probed
 * against the live gateway on 2026-07-29, an unknown token returns 401
 * {"error":"unauthorized"}. A 403 would mean the token is real but scoped away
 * from the namespace asked for — treating that as a bad token would send an
 * executive hunting for a replacement they do not need.
 *
 * Uses a deliberately cheap, always-permitted namespace so the probe tests
 * AUTHENTICATION rather than a particular scope grant.
 */
async function probeToken(candidate) {
  let res;
  try {
    res = await fetch(BASE_URL + '/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Collective-Token': candidate },
      body: JSON.stringify({ index: 'alice', namespace: 'glowming_general', query: 'link check', topK: 1, topN: 1 }),
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
  return configValue('COLLECTIVE_GATEWAY_TOKEN', 'gateway_token') ? 'plugin config (entered at install)' : 'stored link (link_account)';
}

/** Validates a supplied token against the live gateway, then stores it. */
async function linkAccount(rawToken) {
  const supplied = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!supplied) {
    return asText({ error: { code: 'bad_request', message:
      'No token supplied. Ask the user to copy their Collective gateway token from the Business App: ' +
      'Riven > Exec Tools > Your access tokens.' } }, true);
  }
  // Execs paste what they see, and what they see is sometimes the whole header.
  const candidate = supplied.replace(/^Bearer\s+/i, '').trim();

  const probe = await probeToken(candidate);
  if (probe.state === 'unreachable') {
    return asText({ error: { code: 'gateway_unreachable', message:
      'Could not reach the Collective gateway to check that token, so NOTHING was saved (' + probe.detail +
      '). Check the internet connection and try again.' } }, true);
  }
  if (probe.state === 'rejected') {
    return asText({ error: { code: 'token_rejected', message:
      'The Collective gateway did not accept that token, so NOTHING was saved. Copy it again from the ' +
      'Business App: Riven > Exec Tools > Your access tokens — and check it is the COLLECTIVE token, not the Pulse one.' } }, true);
  }

  TOKEN = candidate;
  // A different token can carry different namespace scope, so the previous
  // account's cached hits must not survive a re-link.
  searchCache.clear();

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
          ? 'The Collective is linked and the gateway accepted the token. Saved for future sessions — no reinstall needed.'
          : 'The Collective is linked and working for THIS session, but the token could not be saved to disk (' +
            persistError + '), so it will need re-linking next time.',
      }),
    }],
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
        gateway_check: probe.state,
        detail: probe.detail,
        base_url: BASE_URL,
        next_step: probe.state === 'accepted'
          ? null
          : (probe.state === 'rejected'
            ? 'The stored token is no longer valid (it may have been rotated). Get a fresh one from the ' +
              'Business App: Riven > Exec Tools > Your access tokens, and re-link.'
            : 'The gateway was unreachable. This looks like a network problem, not a token problem.'),
      }),
    }],
  };
}

async function gatewaySearch(index, namespace, query, topK, topN, type) {
  if (!TOKEN) {
    return { error: { code: 'no_token', message: NO_TOKEN_MESSAGE } };
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
  // Link tools first: they must work when no token is configured, which is exactly
  // when every other tool cannot.
  if (name === 'link_account') return linkAccount(args.token);
  if (name === 'link_status') return linkStatus();
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
