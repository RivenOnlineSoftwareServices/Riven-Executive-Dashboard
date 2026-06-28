# Collective MCP plugin

Zero-dependency stdio MCP server that wraps The Collective retrieval gateway
(`POST /api/search`) so a Cowork Live Artifact (or any MCP client) can search
Alice and ask the personas **without holding any Pinecone keys**.

Mirrors the sibling `pulse-mcp-plugin`: Node built-ins + global `fetch` only, no
`npm install`.

## Tools

| Tool | Does |
|------|------|
| `collective_search {index, namespace, query, topK?, topN?, type?}` | Reranked search of one namespace. Returns `{hits:[{score, source_file, type, text}]}`. |
| `ask_persona {persona, query, topN?}` | Fans a question across a persona's core namespaces (`alice` / `heyu` / `iris` / `zac`) and returns merged hits. |

## Config (set at install)

| Field | Value |
|-------|-------|
| `gateway_token` | A gateway token. Use `COLLECTIVE_EXEC_TOKEN` for exec installs (Louis / Anton / Etienne — Glowming knowledge only) or `COLLECTIVE_GATEWAY_TOKEN` for full access. Pulled from Secret Manager (`glowming-business`). |
| `gateway_url` | `https://chat.glowming.business` |

The token is injected via env (`COLLECTIVE_GATEWAY_TOKEN`) and sent on the
`X-Collective-Token` header — never logged, never returned to the model.

## Security

Scope is enforced **gateway-side** (a token maps to an allowed namespace set; the
gateway already excludes `personal` / `titan_property` / `randa_property`). The
enums in `server.js` are UX guard-rails, not the security boundary. The exec
token additionally excludes `business` (Riven-strategy) and `methodology`.
