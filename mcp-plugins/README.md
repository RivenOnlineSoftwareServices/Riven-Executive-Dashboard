# Riven Exec — MCP plugin marketplace

One durable Cowork marketplace (`riven-exec`) bundling the two internal executive
MCP plugins. Hosting it in this git repo means Cowork can add it **by repo URL**,
so installs survive a Claude Desktop restart (unlike local-folder installs).

| Plugin | Wraps | Tools |
|--------|-------|-------|
| `pulse` | `pulse-api` `/v1/*` (Cloud Run) | `snapshot_today`, `digest_this_week`, `mart`, `mart_meta` |
| `collective` | the retrieval gateway `POST /api/search` | `collective_search`, `ask_persona` |

Both are zero-dependency Node stdio MCP servers (Node 18+ for global `fetch`).

## Install in Cowork

1. Add this repo as a marketplace by URL:
   `RivenOnlineSoftwareServices/Riven-Executive-Dashboard`
2. Install **pulse** → set `bearer_token` (the `dashboard-2026` token from Secret
   Manager `pulse-api-bearer-tokens`, project `glowming-analytics`).
3. Install **collective** → set `gateway_token` (`COLLECTIVE_EXEC_TOKEN` for execs,
   or `COLLECTIVE_GATEWAY_TOKEN` for full access; Secret Manager, project
   `glowming-business`) and leave `gateway_url` as `https://chat.glowming.business`.
4. Reload Cowork → `mcp__pulse__*` and `mcp__collective__*` tools attach.

Tokens are entered at install (never committed). Pull them with `gcloud secrets
versions access` / `firebase apphosting:secrets:access`.

## Canonical home

This is the **source of record** for both plugins. The earlier copies (the Pulse
plugin in the Borg vault, and `The-Collective/mcp-plugin/`) were retired in favour
of this unified marketplace.
