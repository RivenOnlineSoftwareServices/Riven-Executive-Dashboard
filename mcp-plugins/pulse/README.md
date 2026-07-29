# Glowming Pulse — MCP plugin + pulse-brief skill

Read-only executive access to the Glowming Pulse API.

Bundles two things in one install:

| Component | What it is |
|-----------|------------|
| `pulse` MCP server (`server.js`) | Tools `snapshot_today`, `digest_this_week`, `mart`, `mart_meta`. The bearer token is held in the local process and never returned to the model. |
| `pulse-brief` skill (`skills/pulse-brief`) | Plain-English executive briefing — "how's business", "how was this week" — mapped to the right tool calls so nobody needs to know a mart name. |

Zero-dependency Node stdio MCP server (Node 18+ for global `fetch`).

## Install

Install the **pulse** plugin from the `riven-exec` marketplace. Then hand it your
token **whichever way is easiest** — there are two, and neither is a prerequisite
of the other:

**1. In chat, after installing (works everywhere — use this if in doubt).** Ask:

> link my Pulse account with this token: `<paste token>`

The plugin validates it against the live API before saving anything, tells you
straight away whether it worked, and remembers it for future sessions. No reinstall,
no config screen, no restart. Ask *"is Pulse linked?"* any time to check.

**2. At install time**, by setting `bearer_token`. Optional, and only possible
during install.

> **Why chat is the reliable path.** A plugin's configuration is **read-only once
> installed** — the per-plugin menu offers Uninstall, not Configure, and the values
> render as plain text. So if you install without entering the token, or your app
> shows no field for it at all, install-time config gives you no second chance.
> Three onboarding attempts died on exactly that. `link_account` exists so token
> entry never depends on a dialog being there.

Get the token from the Business App: **Riven → Exec Tools → Your access tokens.**

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
