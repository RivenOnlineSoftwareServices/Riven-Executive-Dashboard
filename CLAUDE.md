# Riven Executive Dashboard

Single-file Cowork Live Artifact dashboard for 4 Riven OSS executives (Riaan, Anton, Etienne, Louis). Self-contained HTML — all CSS and JS inline, no build step, no backend.

## What this is

A persistent HTML page registered as a Cowork Live Artifact. Opens via the Anthropic Cowork desktop app. All state is localStorage. No server, no auth system, no npm.

**Live artifact ID:** `exec-dashboard`
**Artifact path:** `C:\Users\riaan\OneDrive\MyFiles\Documents\Claude\Artifacts\exec-dashboard\index.html`
**Working copy (session scratch):** outputs/exec-dashboard.html in the active Cowork session

To push changes to the live artifact, use `mcp__cowork__update_artifact` with id `exec-dashboard`.

## Architecture

- **Grid:** 12-column CSS Grid, `grid-auto-rows: 104px`, gap 10px
- **Widget sizes:** micro (2×1), slim (3×1), square (3×2), wide (6×2), tall (4×3), banner (12×2)
- **Drag-and-drop:** Pointer Events API + `setPointerCapture` on widget header — NOT HTML5 drag events (those fail silently in sandboxed iframes)
- **Drop target detection:** `document.elementsFromPoint()` (plural) without hiding the ghost
- **Resize:** `mousedown` on `.rhandle` → `mousemove`/`mouseup` with grid metric calculation
- **User detection:** `window.cowork.askClaude()` reads the session CLAUDE.md to identify the current exec — no login screen

## Users

| ID | Name | Colour |
|----|------|--------|
| `riaan` | Riaan | #d4900a |
| `anton` | Anton | #3b82f6 |
| `etienne` | Etienne | #10b981 |
| `louis` | Louis | #8b5cf6 |

Each exec needs one line in their own CLAUDE.md: `My dashboard user ID is: [id]`

## localStorage keys

| Key | Purpose |
|-----|---------|
| `edt` | Full tab + widget layout for all users (JSON) |
| `edu` | Current user ID |
| `edm-{uid}` | Dark/light mode per user |
| `edn-{iid}` | Note widget content per instance |
| `edw` | Custom widget library (JSON array) |
| `ebi-{uid}` | Brand icon per user |
| `ebn-{uid}` | Board name per user |

## Widget registry

Seven built-ins: `clock`, `kpi`, `note`, `team`, `welcome`, `activity`, `create-widget`.

Custom widgets from the AI builder are stored in `edw` and appear in the picker under "Team Library". Each definition has `{ id, name, desc, icon, type, author, sizes, code }` where `code` is a JS function body that accepts `(el, widgetInstance)` and mutates `el.innerHTML`.

## Design system

Riaan Design v2.0 — Ultra-High Density Compact Glassmorphism. Dark = `:root` default. Light = `[data-theme="light"]` on body.

Key tokens: `--accent` (#8AA2A9), `--accent-inv` (#FF7111 — CTAs, active tabs), `--accent-tri` (#C5D86D — success/status), `--doc-bg`, `--panel-bg`, `--panel-bg-2`, `--text-p`, `--text-s`, `--text-m`.

Font stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`. Headings and KPI values use `'Manrope','Inter',sans-serif`.

## Glowming Pulse integration

The dashboard is **Phase 4** of the Glowming Pulse roadmap. Live widgets (`kpi`, `team`, `activity`) currently show empty states. Each renderer has a `window.cowork.callMcpTool()` stub — the integration seam.

When Pulse Phase 3 (HTTP API) ships, each stub becomes a `fetch()` call:

| Widget | Pulse endpoint |
|--------|---------------|
| KPI Card | `/v1/kpi/{metric}` |
| Team Pulse | `/v1/team/pulse` |
| Activity Feed | `/v1/activity/feed` |
| Welcome stats | `/v1/activity/feed` |

Auth model for Pulse not yet decided. When it is, add a token input to Edit mode and store per user under `edt-{uid}`.

## Known constraints

- **No nested `<button>` elements** — tab pills are `<div>`, tab close buttons are `<span>`. Nesting buttons is invalid HTML and breaks CSS descendant selectors.
- **No HTML5 drag events** — sandboxed iframe environment. Use Pointer Events only.
- **No `localStorage` for custom widget code** — widget JS eval runs inside a `new Function()` wrapper. Be careful with XSS if accepting user-pasted code.
- **No external requests at render time** — the artifact must be fully self-contained. CDN scripts are not permitted in the Cowork artifact runtime.

## Next session task

Audit working widgets at `http://localhost:5053/#cockpit` and port the best ones into this dashboard as improved versions. Not a straight copy — redesign with Riaan Design v2.0 and wire up Pulse integration hooks.

## More context

Full project overview: `Riven Executive Dashboard - Overview.docx` (in this repo).
Borg reference: `Work/Riven OSS/Riven Dashboard 2026/`
Glowming Pulse architecture: `Work/Riven OSS/Glowming/Glowming Pulse/_OVERVIEW.md`
