# Glowming Pulse — MCP plugin + pulse-brief skill

Read-only executive access to Glowming Pulse `/v1/*`.

Bundles two things in one install:

| Component | What it is |
|-----------|------------|
| `pulse` MCP server (`server.js`) | Tools `snapshot_today`, `digest_this_week`, `mart`, `mart_meta` over `pulse-api` `/v1/*`. The bearer token is held in the local process and never returned to the model. |
| `pulse-brief` skill (`skills/pulse-brief`) | Plain-English executive briefing — "how's business", "what's leaking in the funnel", "how was this week" — mapped to the right tool calls so a non-technical exec never needs a mart name. |

Zero-dependency Node stdio MCP server (Node 18+ for global `fetch`).

## Install

Install the **pulse** plugin from the `riven-exec` marketplace, then set
`bearer_token`. Riven OSS issues that token — ask Riaan if you do not have one.
Leave `base_url` at its default unless pointing at a local dev instance.

Reload, and the `mcp__pulse__*` tools attach with the `pulse-brief` skill.

## This is the published copy — change it HERE

The plugin source is bundled into this marketplace repo deliberately, and it has
to stay here.

Cowork and Claude Desktop validate a marketplace **server-side, with no user
credentials**. A marketplace entry pointing at a private repository gets a 404
from that validator and **the entire marketplace fails to sync** — not just the
offending entry. Between 2026-07-25 and 2026-07-26 `pulse` was referenced by
`git-subdir` from the private `Glowming-Pulse` repo, and every executive on
Cowork or Desktop was blocked from installing anything at all, behind a generic
"check the repository URL" error that named no cause. See
`anthropics/claude-code#61271`, closed as a duplicate of #28125, unfixed.

**So: every plugin in this marketplace must be publicly fetchable.** Do not move
this back out, and do not add an entry pointing at a private repo — it breaks the
marketplace for everyone, not only for that plugin.

### The cost, stated plainly

A reference copy remains at `Glowming-Pulse/integrations/pulse-mcp`, beside the
API this wrapper calls. Co-locating it there was the right instinct — a route or
mart change would have updated the wrapper in the same PR — and that protection
is now gone. If a `/v1/*` route or one of the nine mart names changes, **nothing
tells this copy.** There is no automated check for that today.
