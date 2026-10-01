# glowming-campaign

The Glowming Summer Campaign 2026 for owners who work with their own Claude (built for Cowork).

| Skill | What it does |
|---|---|
| `campaign` | Starts and ends a campaign session from the shared project folder, says where things stand, records approvals and questions for Riaan's side, and makes the few allowed edits through safe, checked steps (`references/edit-pathway.md`). |
| `zac` | Glowming designs: new adverts and posts, feed / story / square sizes, motion videos through Magnific, and brand critique. Renders are saved as new files and logged. |
| `heyu` | Glowming wording: captions, headlines, advert text, the compliance check, and advice from advert results. |

**Guard:** `hooks/guard.js` runs before every file write, shell command and connector call and checks
it against an allow-list using the files on disk: `anton.md` append-only; tracking links never altered
in any editable file; caption title, LINK lines and last line locked, and Approval status only ever set
to "Changed (Anton, <date>)"; no overwrite of existing pictures, videos or plans; nothing deleted, moved
or renamed in the company folders; the calendar saved only by an openpyxl script, and put back by
`hooks/calendar-links.js` if a save lost a tracking link; scripts judged by their text; no web requests
from the shell;
encoded or streamed code refused; connectors limited to reads and drafts on company systems (Magnific,
Pulse and Collective unaffected). A second, content-only check reads the text being written (secrets,
cost data, file paths, weight-loss/detox claims, unsourced new benefit claims). Tests: `node
hooks/guard.test.js`.

**Known limits:** a script that builds company paths at run time with no folder name in its text; a
Python module started with `-m`; and the whole guard if Cowork does not run plugin hooks. The campaign
skill checks that on first use and records the result in `anton.md`. SharePoint version history is
the undo for every file.

**Needs on the user's machine:** OneDrive syncing the shared project folder
(`ROSS - Documents/_Riven-Claude/Glowming Summer Campaign`) and the SharePoint folder
`SA Operations/Marketing/2026 Summer Campaign`; the Magnific connector on claude.ai for renders;
optionally the `pulse` and `collective` plugins from this marketplace for results and Glowming facts.

No MCP server and no token in this plugin. Decisions behind it: Riaan, 2026-10-01.
