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
  /*
   * Directory 0o700, file 0o600, written to a temp path then RENAMED (Codex review,
   * finding 3). Rename matters twice over: an existing credential file with broader
   * permissions would otherwise be written into before chmod could tighten it, and
   * rename is atomic so a crash mid-write cannot leave a truncated credential.
   */
  fs.mkdirSync(CRED_DIR, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(CRED_DIR, 0o700); } catch (e) { /* Windows: not meaningful, not fatal. */ }
  const tmp = CRED_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ gateway_token: token }, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows: not meaningful, not fatal. */ }
  fs.renameSync(tmp, CRED_FILE);
}

/* Mutable so link_account works mid-session, with no restart asked of the exec. */
let TOKEN = configValue('COLLECTIVE_GATEWAY_TOKEN', 'gateway_token') || readStoredToken();

/*
 * Bumped on every successful link. Requests capture it before their fetch and
 * refuse to populate the cache if it changed while in flight (Codex review,
 * finding 1): the stdio loop handles lines concurrently, so an old-token request
 * can land AFTER a re-link cleared the cache and would otherwise seed the new
 * identity with the previous one's hits.
 */
let tokenGeneration = 0;

/*
 * Tracked alongside TOKEN rather than re-derived from the environment, which
 * reported "plugin config" forever once an env value existed — even after a link
 * replaced it mid-session (Codex review, non-blocking note).
 */
let tokenSourceLabel = configValue('COLLECTIVE_GATEWAY_TOKEN', 'gateway_token')
  ? 'plugin config (entered at install)'
  : (TOKEN ? 'stored link (link_account)' : 'none');

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
 * Probes the live gateway with a candidate token.
 *
 * Returns 'accepted' | 'rejected' | 'indeterminate' | 'unreachable'. Only
 * 'accepted' may be persisted.
 *
 * The accept rule is an ALLOW-LIST, not "anything but 401" (Codex review,
 * finding 2). Measured on 2026-07-29: an unknown token returns 401
 * {"error":"unauthorized"}, a valid one returns 200. So:
 *
 *   200 -> authenticated and authorised.
 *   403 -> authenticated, scoped away from this namespace. Still a REAL token.
 *   401 -> rejected. The one definitive negative.
 *   everything else (404, 405, 5xx, proxy HTML, App Hosting maintenance) -> INDETERMINATE.
 *
 * A 404 from a mistyped gateway_url, or a 502 from a proxy that never reached the
 * auth layer, says nothing about the token. Storing on those would persist a token
 * that never works and fail later at every call — the silent-failure mode this
 * feature exists to remove.
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
      /*
       * MANUAL redirect handling, and this is the whole reason the status check is
       * not enough. A wrong gateway_url makes the app's auth middleware answer
       * 307 -> /login; fetch follows redirects by default, lands on the login PAGE,
       * and returns 200 text/html. A status-only rule reads that as success and
       * stores a token against an address that can never serve the API. Caught by
       * testing a VALID token against a wrong URL, which passed before this.
       */
      redirect: 'manual',
    });
  } catch (e) {
    return { state: 'unreachable', detail: String((e && e.message) || e) };
  }
  if (res.status === 401) return { state: 'rejected', detail: '401 unauthorized' };
  // Authenticated but scoped away from this namespace: a real token.
  if (res.status === 403) return { state: 'accepted', detail: 'HTTP 403 (authenticated, scope-limited)' };
  if (res.status !== 200) return { state: 'indeterminate', detail: 'HTTP ' + res.status };
  /*
   * A 200 must also LOOK like this API. Belt and braces on top of redirect:manual:
   * any intermediary that returns a courtesy 200 page would otherwise qualify.
   */
  let body = null;
  try { body = JSON.parse(await res.text()); } catch (e) { body = null; }
  if (body && Array.isArray(body.hits)) return { state: 'accepted', detail: 'HTTP 200' };
  return { state: 'indeterminate', detail: 'HTTP 200 but the response was not a Collective search result' };
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
  if (probe.state === 'indeterminate') {
    return asText({ error: { code: 'token_unconfirmed', message:
      'Could not confirm that token: the gateway answered ' + probe.detail + ', which says nothing about ' +
      'whether the token is valid. NOTHING was saved — storing it now would just fail later on every ' +
      'request. Try again in a minute; if it keeps happening the gateway or its address is wrong, not ' +
      'your token.' } }, true);
  }

  TOKEN = candidate;
  tokenSourceLabel = 'stored link (link_account)';
  // A different token can carry different namespace scope, so the previous
  // account's cached hits must not survive a re-link. The generation bump
  // additionally stops an in-flight old-token request re-seeding after this clear.
  tokenGeneration += 1;
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
        token_source: tokenSourceLabel,
        gateway_check: probe.state,
        detail: probe.detail,
        base_url: BASE_URL,
        next_step: probe.state === 'accepted'
          ? null
          : (probe.state === 'rejected'
            ? 'The stored token is no longer valid (it may have been rotated). Get a fresh one from the ' +
              'Business App: Riven > Exec Tools > Your access tokens, and re-link.'
            : 'The gateway could not be reached or answered oddly (' + probe.detail + '). This looks like ' +
              'a service or network problem, not a token problem — the stored token is untouched.'),
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
  // Captured BEFORE the await: if a link lands while this request is in flight,
  // these hits belong to the previous identity and must not be cached.
  const gen = tokenGeneration;
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
  if (gen === tokenGeneration) cacheSet(cacheKey, body); // successful AND still the same identity (60s TTL).
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
