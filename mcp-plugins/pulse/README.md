# Glowming Pulse — Cowork MCP plugin

Read-only MCP access to the Glowming Pulse `/v1/*` analytics API for the **Riven Dashboard 2026**.
Internal — Riven OSS only. The plugin runs a tiny local Node process that holds the bearer token and
proxies requests to Pulse, so **no token ever lives inside a dashboard artifact**.

## Tools exposed

Once installed and connected, these appear to Cowork as `mcp__pulse__<tool>`:

| Tool | Route | Scope | Notes |
|------|-------|-------|-------|
| `snapshot_today` | `GET /v1/snapshot/today` | `snapshot.read` | Yesterday's KPIs + narrative |
| `digest_this_week` | `GET /v1/digest/this-week` | `digest.read` | 503 until the weekly cron is switched on |
| `mart` `{name, limit?}` | `GET /v1/marts/<name>` | `marts.read` | One of the nine marts; `limit` default 1000, cap 10000 |
| `mart_meta` `{name}` | `GET /v1/marts/<name>/meta` | `marts.read` | Freshness: `response_age_seconds`, `rows_written`, `data_through_ts` |

The nine marts: `daily_snapshot`, `checkout_funnel`, `customer_clv`, `inventory_health`,
`abandoned_recovery`, `ad_performance`, `product_performance`, `product_quality`, `review_velocity`.

Each tool returns the full Pulse `{data, meta}` envelope as JSON text (errors as `{error:{code,message}, meta}` with `isError`).

## ⚠️ Prerequisite — rotate the dashboard-2026 bearer FIRST

The current `dashboard-2026` plaintext leaked into a chat transcript (per `_Wiki/state/pulse.md`,
only `smoke-test` was rotated in secret v3). **Do not wire the old token in.** Before installing:

1. Generate a fresh `dashboard-2026` bearer and add a new version of secret `pulse-api-bearer-tokens`
   (project `glowming-analytics`) via the Pulse secret-management flow (`seed-secrets.sh` / Secret Manager).
   Keep its scopes: `snapshot.read`, `digest.read`, `marts.read`.
2. Confirm the new token works: `curl -H "Authorization: Bearer <new>" https://pulse-api-txrwzaee2q-ew.a.run.app/v1/marts/daily_snapshot/meta` → expect `200`.
3. Use that **new** value in step 3 below.

## Install (per user, sideload)

Requires **Node 18+** on the machine (uses built-in `fetch`; the server has zero npm dependencies).

```
/plugin marketplace add "C:\Users\riaan\Documents\Borg\Work\Riven OSS\Riven Dashboard 2026\pulse-mcp-plugin"
/plugin install pulse@riven-pulse
```

When prompted by `userConfig`:
- **Pulse API bearer token** → paste the freshly-rotated `dashboard-2026` token (stored in the OS keychain, `sensitive`).
- **Pulse API base URL** → leave as default (`https://pulse-api-txrwzaee2q-ew.a.run.app`).

Then restart/reload Cowork so the `pulse` MCP connects.

## Verify

In a Cowork chat:
- Confirm the tools are listed (look for `mcp__pulse__snapshot_today`, `…__mart`, etc.).
- Ask: *"call mcp__pulse__mart_meta for daily_snapshot"* → expect a `{data:{…response_age_seconds…}, meta:{…}}` payload.
- `mcp__pulse__mart {name:"daily_snapshot", limit:5}` → expect rows.

## Known gotchas

- **Tool-name prefix:** Cowork sometimes surfaces custom MCP tools with a UUID prefix
  (`mcp__<uuid>__snapshot_today`) instead of `mcp__pulse__…` (tracked Claude Code issue #47614).
  If that happens, note the actual names from the tool list and update the dashboards' `callMcpTool`
  names + the artifact's registered `mcp_tools` to match.
- **`${CLAUDE_PLUGIN_ROOT}` expansion** in a plugin-root `.mcp.json` is occasionally flaky
  (issue #9427). If the server won't launch, the fallback is to register the MCP at project root
  with an absolute path to `server.js`.
- The server logs to **stderr** only (`[pulse-mcp] started; …`); stdout is reserved for JSON-RPC.

## Files

```
pulse-mcp-plugin/
  .claude-plugin/marketplace.json     # local marketplace ("riven-pulse")
  pulse/
    .claude-plugin/plugin.json        # manifest + userConfig (token, base_url)
    .mcp.json                         # launches: node server.js, env from PLUGIN_CONFIG
    server.js                         # zero-dep MCP stdio server
    package.json
    README.md                         # this file
```
