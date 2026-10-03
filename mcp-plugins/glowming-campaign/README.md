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
- **A developer's checkout** (the session was LAUNCHED, read from `CLAUDE_PROJECT_DIR`, inside a git
  checkout under the owner's code folder, `<home drive>\repos` (`C:\repos`, fixed in the guard: nothing
  a session writes can move it), that is neither a company folder nor a campaign repository nor a worktree of
  one, and the shell is still inside it; never a checkout at the home folder or a drive root): the
  blanket shell rules (no web requests, no hidden code, no deep or very large script chains, no claim
  text in shell writes) step aside, because a code repository legitimately runs servers, local
  requests and build scripts. Everything that protects the company files still applies there: file
  tools, connectors, deletes, and the copy post.js checks. A campaign repository is known by its name,
  its git remote, or a `.glowming-campaign` file at its root. The decision is recorded when the
  session starts (a SessionStart hook, before Claude can act) in a folder the guard protects like
  company files, and every later call needs that record too: removing a remote or a marker during a
  session never turns the rules off, and a session with no record never counts. Owners working the campaign launch in
  the synced folders or the campaign repository, which never count (Riaan, 2026-10-03).
- Everywhere: in a TypeScript script, a type-only import (`import type … from "node:http"`) is not a
  web request; a real import still is. Outside a developer's checkout every `eval(` and `exec(` is
  hidden code, a member call included (`b.exec(`, and a regex's `pattern.exec(`: a file's name does
  not say what runs it), and so is decoding a payload (`atob(`, a Buffer from base64 or hex,
  `new Function(`). A campaign repository's remote is read as git itself resolves it.

A second, content-only check (a prompt hook) reads the text AFTER it is written and only warns:
secrets, and health claims Meta, TikTok or the ARB could reject. It never blocks; the owners
decide (Riaan, 2026-10-02: "Your job is to warn, not refuse"). Tests: `node
hooks/guard.test.js`; negative controls (each rule removed must turn a named case red): `node
hooks/guard.controls.mjs`.

**Known limits:** a script that writes a company file it never names (a path built at run time) in a
folder the command does not name either; in a developer's checkout, nothing stops a web request
(adverts, the shop, email), and a company file can be reached unseen through a script more than three
levels down or over 500 KB, or through hidden code, when the command names no company folder (that
mode exists for the owner's own code repositories); a campaign repository that neither its name, its
remote nor a `.glowming-campaign` marker identifies; and the whole guard if Cowork does not run plugin
hooks.
The campaign skill checks that on first use and records it in `anton.md`. SharePoint version history
is the undo for every file.

**Needs on the user's machine:** OneDrive syncing the shared project folder
(`ROSS - Documents/_Riven-Claude/Glowming Summer Campaign`) and the SharePoint folder
`SA Operations/Marketing/2026 Summer Campaign`; the Magnific connector on claude.ai for renders;
optionally the `pulse` and `collective` plugins from this marketplace for results and Glowming facts.

No MCP server and no token in this plugin. Decisions behind it: Riaan, 2026-10-01.
