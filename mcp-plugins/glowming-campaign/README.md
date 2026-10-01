# glowming-campaign

The Glowming Summer Campaign 2026 for owners who work with their own Claude (built for Cowork).

| Skill | What it does |
|---|---|
| `campaign` | Starts and ends a campaign session from the shared project folder, says where things stand, records approvals and questions for Riaan's side, and makes the few allowed edits through safe, checked steps (`references/edit-pathway.md`). |
| `zac` | Glowming designs: new adverts and posts, feed / story / square sizes, motion videos through Magnific, and brand critique. Renders are saved as new files and logged. |
| `heyu` | Glowming wording: captions, headlines, advert text, the compliance check, and advice from advert results. |

**Guard:** `hooks/hooks.json` checks every file write and shell command before it runs: nothing is
deleted, renamed, moved or overwritten; Riaan's files and the tracking links are never changed.

**Needs on the user's machine:** OneDrive syncing the shared project folder
(`ROSS - Documents/_Riven-Claude/Glowming Summer Campaign`) and the SharePoint folder
`SA Operations/Marketing/2026 Summer Campaign`; the Magnific connector on claude.ai for renders;
optionally the `pulse` and `collective` plugins from this marketplace for results and Glowming facts.

No MCP server and no token in this plugin. Decisions behind it: Riaan, 2026-10-01.
