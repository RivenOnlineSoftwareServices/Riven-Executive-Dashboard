# Riven Exec — MCP plugin marketplace

One durable Cowork marketplace (`riven-exec`) bundling the internal executive
plugins. Hosting it in this git repo means Cowork can add it **by repo URL**, so
installs survive a Claude Desktop restart (unlike local-folder installs).

| Plugin | Home | Wraps | Ships |
|--------|------|-------|-------|
| `pulse` | bundled here (`mcp-plugins/pulse`) | Glowming Pulse analytics API | `snapshot_today` / `digest_this_week` / `mart` / `mart_meta` + the **pulse-brief** skill |
| `collective` | this repo (`mcp-plugins/collective`) | the retrieval gateway `POST /api/search` | `collective_search` / `ask_persona` + the **ask-collective** skill |

Both are zero-dependency Node stdio MCP servers (Node 18+ for global `fetch`).

The `pulse` plugin was **moved out of this repo** (2026-07-25) to live next to the
`/v1/*` API it wraps, so a mart/route change updates the wrapper in the same PR.
This marketplace still references it by `git-subdir`, so execs add ONE marketplace
(`riven-exec`) and get both plugins.

## Install in Cowork

1. Add this repo as a marketplace by URL:
   `RivenOnlineSoftwareServices/Riven-Executive-Dashboard`
2. Install **pulse** → set `bearer_token`. Riven OSS issues this token.
3. Install **collective** → set `gateway_token` (`COLLECTIVE_EXEC_TOKEN` for execs,
   or `COLLECTIVE_GATEWAY_TOKEN` for full access. Riven OSS issues these.
   `glowming-business`) and leave `gateway_url` as `https://chat.glowming.business`.
4. Reload Cowork → `mcp__pulse__*` + `mcp__collective__*` tools attach, and the
   `pulse-brief` + `ask-collective` skills are available.

Tokens are entered at install and are never committed. Ask Riven OSS for yours.

## Skills

- **pulse-brief** (in the `pulse` plugin) — plain-English business briefing over
  the Pulse tools; an exec never needs a mart name.
- **ask-collective** (in the `collective` plugin) — consult a persona
  (Heyu / Iris / Zac / Alice) in plain language; routes through `ask_persona` and
  answers from the returned evidence.
