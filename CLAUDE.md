# Claude Code — Riven Executive Dashboard

## What this repo is now (2026-07-25)

This repo is the **`riven-exec` Cowork / Claude Code plugin marketplace** — the
single, durable install surface for the Riven executive tools. Executives add it
by repo URL and get the plugins + guided skills below.

| Plugin | Home | What it gives |
|--------|------|---------------|
| `pulse` | authored in **`Glowming-Pulse`** (`integrations/pulse-mcp`), referenced here via `git-subdir` | Pulse MCP tools (`snapshot_today` / `digest_this_week` / `mart` / `mart_meta`) + the **pulse-brief** skill (plain-English business briefing) |
| `collective` | this repo (`mcp-plugins/collective`) | Collective retrieval MCP (`collective_search` / `ask_persona`) + the **ask-collective** skill (consult Heyu / Iris / Zac / Alice) |
| `exec-workspace` | this repo (`mcp-plugins/exec-workspace`) | Skills-only, no token: **exec-setup** (guided install), **exec-guide** (how to use the tools + the start/end-session habit), **exec-optimize** ("clean up my Claude" — efficiency, skills/MCP, security sweep, without removing their work) |

Marketplace manifest: `.claude-plugin/marketplace.json`. Install flow + per-plugin
detail: `mcp-plugins/README.md`.

The web front door to all of this is the **Business App → Riven → Exec Tools**
page (`/admin/exec-tools`), a Q&A install wizard that also dispenses the scoped
Collective token to permitted execs.

## RETIRED — the Cowork Live Artifact dashboard

This repo used to hold (and this file used to describe) a single-file Cowork Live
Artifact dashboard (`exec-dashboard`, localStorage, no auth). **That is retired
(2026-07-25), superseded by the Business App's native executive dashboard**
(`/dashboard`, behind the BA's real Supabase auth + CEO/CGOO/Executive roles, with
live server-side Pulse data). The reasons it was replaced:

- No auth / no roles — it identified the exec by reading a CLAUDE.md line.
- Cowork-runtime-only — depended on `window.cowork.*`; its widgets never got real
  data (empty stubs).
- A second, parallel exec surface to maintain alongside the BA's The Weekly +
  Scoreboard + (now) dashboard.

The old artifact file (if it still exists in the operator's Cowork artifacts) can
be removed at leisure; nothing references it. Do not rebuild it — the BA dashboard
is the executive dashboard.

## Rules & Standards

Riven OSS Dev Rules: `C:\Users\riaan\Documents\Borg\Work\Dev Rules\Dev Rules.md`.
Two-brain SHIP before merge; conventional commits; `main` protected (PRs only).

## GitHub Repo

`https://github.com/RivenOnlineSoftwareServices/Riven-Executive-Dashboard`
