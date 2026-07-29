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

## Linking your account

Two ways to hand the plugin your token. Neither depends on the other.

**1. In chat, after installing (works everywhere — use this if in doubt).** Ask:

> link my Collective account with this token: `<paste token>`

The plugin validates it against the live gateway before saving anything, says
immediately whether it worked, and remembers it for future sessions. No reinstall,
no config screen, no restart. Ask *"is the Collective linked?"* any time to check.

**2. At install time**, by setting `gateway_token`. Optional, and only possible
during install.

> **Why chat is the reliable path.** A plugin's configuration is **read-only once
> installed** — the per-plugin menu offers Uninstall, not Configure. If you install
> without entering the token, or your app shows no field for it, install-time config
> gives you no second chance. `link_account` exists so token entry never depends on
> a dialog being there.

Get the token from the Business App: **Riven → Exec Tools → Your access tokens.**

## Config fields

| Field | Value |
|-------|-------|
| `gateway_token` | Your Collective gateway token, issued by Riven OSS. Exec tokens are scoped to Glowming knowledge only. **Optional** — leave blank and link in chat instead. |
| `gateway_url` | **Leave alone.** Defaults to `https://chat.glowming.business` in `plugin.json`, and `server.js` falls back to the same URL independently. |

**In Cowork / Claude Desktop** enabling the plugin prompts for its configuration —
paste the token there. (The exact in-app control is not documented per surface; if
nothing prompts you, ask rather than hunting.) **In Claude Code** the value is set at install
time:

```
claude plugin install collective@riven-exec --config gateway_token=<your token>
```

To change the token later, use the interactive configure flow inside Claude Code:

```
/plugin configure collective@riven-exec
```

(`claude plugin config` as a shell command does NOT exist, but `/plugin configure`
inside a session DOES — verified against the CLI's own `claude plugin install
--help`, which describes `--config` as storing "via the same path as the
interactive /plugin configure flow".)

⚠️ **The installer prints a misleading line.** After a successful install with
`--config bearer_token=...` it still says *"1 userConfig option not yet set"*.
That is counting `base_url`, which has a default and needs nothing. Verified
2026-07-28: the token WAS stored. Do not re-run the install because of that
message.

The token is injected via env (`COLLECTIVE_GATEWAY_TOKEN`) and sent on the
`X-Collective-Token` header — never logged, never returned to the model.

## Security

Scope is enforced **gateway-side** (a token maps to an allowed namespace set; the
gateway already excludes `personal` / `titan_property` / `randa_property`). The
enums in `server.js` are UX guard-rails, not the security boundary. The exec
token additionally excludes `business` (Riven-strategy) and `methodology`.
