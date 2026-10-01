# glowming-campaign

The Glowming Summer Campaign 2026 for owners who work with their own Claude (built for Cowork).

| Skill | What it does |
|---|---|
| `campaign` | Starts and ends a campaign session from the shared project folder, says where things stand, records approvals and questions for Riaan's side, and makes the few allowed edits through safe, checked steps (`references/edit-pathway.md`). |
| `zac` | Glowming designs: new adverts and posts, feed / story / square sizes, motion videos through Magnific, and brand critique. Renders are saved as new files and logged. |
| `heyu` | Glowming wording: captions, headlines, advert text, the compliance check, and advice from advert results. |

**Guard (two parts):**

- `hooks/guard.js` (before each tool call) checks every file write and connector call against an
  allow-list using the files on disk: `anton.md` append-only; caption title, LINK lines and last line
  locked, Approval status only ever "Changed (Anton, <date>)"; lines carrying tracking links never
  altered; no overwrite of existing pictures, videos or plans; nothing written outside the allowed
  folders; no weight-loss, detox, appetite, craving, cure or "clinically proven" claims; connectors
  limited to reads and drafts on company systems (Magnific, Pulse and Collective unaffected). For a
  shell command it refuses deletes, moves and renames in the company folders, hidden or streamed
  code, and every web request, and it COPIES the files of every company folder the command touches.
- `hooks/post.js` (after each tool call) compares those folders with the copy: a deleted file is put
  back; a changed file is judged by the same rules as the file tools and put back if it fails (the
  posting calendar is compared cell by cell for its tracking links, `hooks/calendar-links.js`); a new
  file where new files are not allowed is removed. So a shell command is judged by what it DID, not
  by guessing from its text.

A second, content-only check (a prompt hook) reads the text being written. Tests: `node
hooks/guard.test.js`.

**Known limits:** a script that writes a company file it never names (a path built at run time) in a
folder the command does not name either; and the whole guard if Cowork does not run plugin hooks.
The campaign skill checks that on first use and records it in `anton.md`. SharePoint version history
is the undo for every file.

**Needs on the user's machine:** OneDrive syncing the shared project folder
(`ROSS - Documents/_Riven-Claude/Glowming Summer Campaign`) and the SharePoint folder
`SA Operations/Marketing/2026 Summer Campaign`; the Magnific connector on claude.ai for renders;
optionally the `pulse` and `collective` plugins from this marketplace for results and Glowming facts.

No MCP server and no token in this plugin. Decisions behind it: Riaan, 2026-10-01.
