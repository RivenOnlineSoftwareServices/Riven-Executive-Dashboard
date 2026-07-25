# Glowming Pulse — MCP plugin + pulse-brief skill

Read-only executive access to the Glowming Pulse API.

Bundles two things in one install:

| Component | What it is |
|-----------|------------|
| `pulse` MCP server (`server.js`) | Tools `snapshot_today`, `digest_this_week`, `mart`, `mart_meta`. The bearer token is held in the local process and never returned to the model. |
| `pulse-brief` skill (`skills/pulse-brief`) | Plain-English executive briefing — "how's business", "how was this week" — mapped to the right tool calls so nobody needs to know a mart name. |

Zero-dependency Node stdio MCP server (Node 18+ for global `fetch`).

## Install

Install the **pulse** plugin from the `riven-exec` marketplace, then set
`bearer_token`. Riven OSS issues that token. Leave `base_url` at its default
unless you have been given a different one.

Reload, and the `mcp__pulse__*` tools attach with the `pulse-brief` skill.

## Maintainers: this is the published copy — change it here

Every plugin in this marketplace must live in this repository, as a local
`./mcp-plugins/*` source.

A marketplace entry that points at a repository the installer's client cannot
read will fail validation, and that failure takes down the **whole marketplace
sync**, not just the offending entry. Do not add an entry that sources a plugin
from anywhere else.
