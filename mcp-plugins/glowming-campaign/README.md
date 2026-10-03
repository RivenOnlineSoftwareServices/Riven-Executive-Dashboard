# glowming-campaign

The Glowming Summer Campaign 2026 for owners who work with their own Claude (built for Cowork).

| Skill | What it does |
|---|---|
| `campaign` | Starts and ends a campaign session from the shared project folder, says where things stand, records approvals and questions for Riaan's side, and makes the few allowed edits through safe, checked steps (`references/edit-pathway.md`). |
| `zac` | Glowming designs: new adverts and posts, feed / story / square sizes, motion videos through Magnific, and brand critique. Renders are saved as new files and logged. |
| `heyu` | Glowming wording: captions, headlines, advert text, the compliance check, and advice from advert results. |

**Who the guard is for (0.2.0, operator ruling 2026-10-03):** Anton, Etienne and Louis, never Riaan.
Design: `docs/glowming-campaign-guard-identity.md` at the repo root. `guard.js` reads who is working
before anything else:

- the signed-in address the desktop app sets for its Code tab and for Cowork
  (`CLAUDE_CODE_USER_EMAIL`, with `CLAUDE_CODE_ENTRYPOINT` `claude-desktop` / `local-agent`):
  Riaan's address -> **off** (nothing runs, nothing is copied, no warning); any other address -> **full**;
- else Riaan's own account on his own machine (`riaan` on ZENBOOKDUO-RV26, `riaanventer` on the
  Air) -> **off**;
- else an address from another launcher: Riaan's -> off, any other -> full;
- else (no identity) -> **campaign**: only calls that touch the company folders are judged.

A short, closed tamper list (not claimed complete) refuses switching the guard off in passing:
`claude --bare / --safe-mode / --settings / --plugin-dir`, `claude plugin disable`, resetting a
`.claude` folder, any shell command naming a Claude settings file other than one plain read, the
identity and safe-mode variables (full only), and file-tool settings edits that set
`disableAllHooks`, switch this plugin off or change those variables. After installing, each machine
records its verdict in `<temp>/glowming-guard-identity.json` (mode, rule, address domain only).

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
- **A developer's checkout**: the session was LAUNCHED (read from `CLAUDE_PROJECT_DIR`, fixed for the
  session) strictly inside the owner's code folder, `<home drive>\repos` (`C:\repos`, a real folder,
  fixed in the guard), by a path with no link or junction in it that neither says "campaign" nor names
  a company folder, and the shell is still inside that launch folder. There the blanket shell rules (no
  web requests, no hidden code, no deep or very large script chains, no claim text in shell writes)
  step aside, because a code repository legitimately runs servers, local requests and build scripts.
  Everything that protects the company files still applies there: file tools, connectors, deletes, and
  the copy post.js checks. Eligibility is bounded by the launch folder's spelling, which a session
  cannot change: a spelling that says "campaign" or lies outside the code folder never becomes
  eligible, whatever the session does on disk; any other spelling under the code folder is code by
  design. Reading git remotes, marker files or session records was tried and dropped, because a
  session could rewrite each of them (Codex and Claude review, 2026-10-03). Anton launches in the synced folders, which never count;
  the campaign repository and the worktrees made inside it say "campaign" in their path (Riaan,
  2026-10-03).
- Outside a developer's checkout no text is exempted from the rules: every `eval(` and `exec(` is
  hidden code, a member call included (`b.exec(`, a regex's `pattern.exec(`: a file's name does not
  say what runs it), and so is decoding a payload (`atob(`, a Buffer from base64 or hex,
  `new Function(`); a TypeScript `import type … from "node:http"` counts as a web request as on main
  (an exemption for it was tried and dropped: a string can hold the same text).

A content-only check in `post.js` reads the text a file tool just wrote and only warns (a message to
the person and a note to Claude, exit 0): key and token shapes, private keys, a password written out,
a Luhn-valid card or ID number, banned claims. It never blocks; the owners decide (Riaan,
2026-10-02: "Your job is to warn, not refuse"). It replaced the earlier LLM prompt hook, which could
not tell who was working and so ran for Riaan too; it is narrower (no bank account numbers, no "could
Meta or the ARB reject this" judgment). `post.js` also runs after a FAILED call, and before it puts a
file back or removes one it keeps the displaced version in `<home>/.glowming-guard-recovery/`. Only
the copy of the call that took it is ever checked; a copy older than six hours is deleted without
putting anything back. Tests: `node
hooks/guard.test.js`; negative controls (each rule removed must turn a named case red): `node
hooks/guard.controls.mjs`.

**Known limits:** who is working rests on what the app tells the hook (verified in Riaan's desktop
Code tab on the Zenbook; Cowork, the Air and Anton's DELL are owed a live check of the identity file);
a session with no identity (a cloud session, a new machine) gets campaign mode, which can refuse
Riaan's own company-file edits there and does not judge a send or delete by ID only; two people
sharing one OS account with no app-set address; the tamper list is closed, not complete; the guard's
own plugin folder is not protected (parked); a script that writes a company file it never names (a path built at run time) in a
folder the command does not name either; in a developer's checkout, nothing stops a web request
(adverts, the shop, email), and a company file can be reached unseen through a script more than three
levels down or over 500 KB, or through hidden code, when the command names no company folder (that
mode exists for the owner's own code repositories); a campaign checkout under the code folder whose
path does not say "campaign" (keep campaign clones and worktrees named so); and the whole guard if
Cowork does not run plugin hooks.
The campaign skill checks that on first use and records it in `anton.md`. SharePoint version history
is the undo for every file.

**Needs on the user's machine:** OneDrive syncing the shared project folder
(`ROSS - Documents/_Riven-Claude/Glowming Summer Campaign`) and the SharePoint folder
`SA Operations/Marketing/2026 Summer Campaign`; the Magnific connector on claude.ai for renders;
optionally the `pulse` and `collective` plugins from this marketplace for results and Glowming facts.

No MCP server and no token in this plugin. Decisions behind it: Riaan, 2026-10-01.
