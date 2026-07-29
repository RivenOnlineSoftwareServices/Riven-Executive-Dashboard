# Glowming Pulse — MCP plugin + pulse-brief skill

Read-only executive access to the Glowming Pulse API.

Bundles two things in one install:

| Component | What it is |
|-----------|------------|
| `pulse` MCP server (`server.js`) | Tools `snapshot_today`, `digest_this_week`, `mart`, `mart_meta`. The bearer token is held in the local process and never returned to the model. |
| `pulse-brief` skill (`skills/pulse-brief`) | Plain-English executive briefing — "how's business", "how was this week" — mapped to the right tool calls so nobody needs to know a mart name. |

Zero-dependency Node stdio MCP server (Node 18+ for global `fetch`).

## Install

Install the **pulse** plugin from the `riven-exec` marketplace and set
`bearer_token` — the only value you need. Riven OSS issues that token.

**`base_url` needs nothing from you.** It defaults to the production Cloud Run
service in `plugin.json`, and `server.js` falls back to the same URL if the value
never arrives. Only change it to point at a local dev instance.

**In Cowork / Claude Desktop** enabling the plugin prompts for its configuration —
paste the token there. (The exact in-app control is not documented per surface; if
nothing prompts you, ask rather than hunting.) **In Claude Code** the value is set at install
time:

```
claude plugin install pulse@riven-exec --config bearer_token=<your token>
```

To change the token later, use the interactive configure flow inside Claude Code:

```
/plugin configure pulse@riven-exec
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

Reload, and the `mcp__pulse__*` tools attach with the `pulse-brief` skill.

## Maintainers: this is the published copy — change it here

Every plugin in this marketplace must live in this repository, as a local
`./mcp-plugins/*` source.

A marketplace entry that points at a repository the installer's client cannot
read will fail validation, and that failure takes down the **whole marketplace
sync**, not just the offending entry. Do not add an entry that sources a plugin
from anywhere else.
