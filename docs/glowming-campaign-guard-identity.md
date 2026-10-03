# Design note: the campaign guard is for Anton, Etienne and Louis, never for Riaan

Rule #41 (a guard is a risk surface). Plugin `glowming-campaign`, 2026-10-03. Round 2 (Codex design
round 1 findings 1-7 answered inline, marked C1-C7).

## Why

Operator ruling by pop-up, 2026-10-03: the guard applies to "Anton, Etienne and Louis please", never
to Riaan. The same day the guard ran in Riaan's own Code and Cowork sessions (the plugin is installed
per claude.ai account and synced into the desktop Code tab) and refused email sends, script web
calls, the compliance gate and shell commands that named its own files. Riaan had to disable the
Cowork install by hand. How to tell people apart: "Either" (user name or machine).

## What kind of guard this is (C3)

An **accidental-misuse guard**: it keeps a well-meaning Claude, working for a non-technical owner,
inside the campaign rules. It is not a boundary against a session set on escaping it: a session can
always write `disableAllHooks` into a settings file, disable the plugin, or build a name at run time.
It refuses the direct, recognisable forms of that (below) so it is not switched off in passing.

## The rule

`identity()` in `hooks/guard.js` returns one of three modes:

| # | Signal | Mode |
|---|---|---|
| 1 | `CLAUDE_CODE_USER_EMAIL` is one of Riaan's addresses (`riaan@riven.co.za`, `riaan.venter@riven.co.za`) **and** `CLAUDE_CODE_ENTRYPOINT` is `claude-desktop` (desktop Code tab) or `local-agent` (Cowork), the two launchers that set the address from the signed-in account | **off** |
| 2 | `CLAUDE_CODE_USER_EMAIL` holds any address that is not Riaan's, whatever the launcher | **full** |
| 3 | otherwise, the operating-system account (`os.userInfo().username`, case-insensitive) is Riaan's (`riaan` on Windows, `riaanventer` on the Mac) | **off** |
| 4 | anything else (no usable address, unknown account, account unreadable) | **campaign** |

- **off:** `guard.js` allows everything; `post.js` returns before any check, put-back or warning.
- **full:** the 0.1.3 guard, unchanged, including #19's step-aside in a developer's checkout, plus
  the tamper rule below.
- **campaign** (no usable identity): only LOCAL company folders are guarded (C4, C6), see below.

**C1, who is "the three".** Their claude.ai sign-in addresses are not recorded anywhere I could find
(gap, reported). The ruling's force is "never Riaan"; so any address that is not Riaan's is treated
like the three (fail toward protection). The three's known addresses are listed in the code for the
diagnostic only. **Email before machine:** Anton signed in on Riaan's laptop gets the full guard.

**C2, provenance.** The address counts toward OFF only when the launcher is one that sets it from the
signed-in account: the desktop app sets `CLAUDE_CODE_USER_EMAIL` together with `CLAUDE_CODE_ACCOUNT_UUID`
for the Code tab (measured) and for Cowork (its own source), and its env merge replaces an inherited
value of the same name (source: `qG`, delete-then-assign). In the plain CLI (`CLAUDE_CODE_ENTRYPOINT`
`cli`) the value can only be inherited, so it never turns the guard off; the OS account decides.
An address that is NOT Riaan's raises protection from any source. Stated limits: two people sharing
one OS account with no app-set address; a launcher that forges both variables.

**Tamper rule (full and campaign).** Refused: a shell command (or a script it runs) that names
`CLAUDE_CODE_USER_EMAIL`, `CLAUDE_CODE_ENTRYPOINT` or `disableAllHooks`, or runs `claude plugin
disable|uninstall`; and a file-tool write to a Claude settings file (`settings.json`,
`settings.local.json`, `managed-settings.json`, `.claude.json`) whose new text names one of those or
switches `glowming-campaign` off in `enabledPlugins`. Writes to other files (a document that mentions
the variable) are not affected (C4).

## Campaign mode, in order (C6)

1. **Scope discovery**, shared by every check: the command text plus every script it runs (three
   levels, as today), every path candidate resolved from the shell's folder, and the shell's folder
   itself (`foldersNamed`, `isProtected`). A call **touches** the company folders if any of these
   names or resolves into one. For a connector call: any string argument names or resolves into one.
   For a file tool: the target path.
2. **Not touching:** allowed, with no copy and no warning. A script the guard cannot read (missing,
   over three levels, over 500 KB) counts as not touching unless the command or the shell's folder
   already does: in campaign mode nothing outside the visible company folders is judged.
3. **Touching:** judged by every full-mode rule (deletes refused, the blanket shell rules, the copy
   that post.js checks, connector rules), with #19's step-aside.

Stated consequences (C4): a remote company resource reached by ID only (a Graph `DELETE` on an item
ID, an email send by message ID) is not judged in campaign mode; a disposable folder whose name is a
company marker (`/tmp/2026 Summer Campaign`) is judged in any mode but off.

## Snapshots (C5)

A snapshot is processed only by the post hook of **the call that took it** (its `tool_use_id`,
now also its `session_id`). It is checked and put back only then. A snapshot older than six hours,
or one whose call never reported back, is **deleted without restoring anything**. `post.js` with no
call id restores nothing. `post.js` now also runs on `PostToolUseFailure`, so a command that changes
a file and then exits with an error is still checked. In off mode `post.js` touches no snapshot.

## The warning check (C7)

The PostToolUse prompt hook (an LLM call after every write, #18) cannot be scoped by identity, so it
is replaced by a deterministic check in `post.js`, delivered as exit-0 JSON
`hookSpecificOutput.additionalContext` (feedback to Claude, never a block, never repeating the
secret). It reads only the newly written fields (`content`, `new_string`, `edits[].new_string`,
`new_source`). It finds: well-known key and token shapes, private-key blocks, `password|secret|api
key|token = <value>` assignments, Luhn-valid 13-19 digit runs (cards, SA ID numbers) and banned
claims. Narrower than the LLM: no bank account numbers, no "could Meta or the ARB reject this"
judgment; a Luhn-valid order number can warn falsely. Full mode checks every write; campaign mode
only writes into the company folders; off none. Banned claims in company files are still refused
before the write, as today.

## What each surface does now

| Surface | Signal | Mode |
|---|---|---|
| Riaan, Windows, desktop Code tab | email + `claude-desktop` | off |
| Riaan, Windows, plain `claude` CLI | OS `riaan` | off |
| Riaan, Mac (Air), desktop Code / CLI | email + launcher, else OS `riaanventer` | off |
| Riaan, Cowork (VM) | email + `local-agent` | off (if Cowork ever lacks the address: campaign) |
| Riaan, cloud session | email from an unknown launcher is ignored; OS `root`/other | campaign (no synced company folders there) |
| Anton, Etienne, Louis: Cowork, desktop Code | their address | full |
| Anyone else with the plugin | their address | full |
| No usable address, unknown OS account | none | campaign |

## Platform facts

| Fact | How verified | Result |
|---|---|---|
| Desktop Code sets `CLAUDE_CODE_USER_EMAIL`, `CLAUDE_CODE_ENTRYPOINT=claude-desktop` | `env` in this session, ZENBOOKDUO-RV26 | `riaan@riven.co.za`, `claude-desktop` |
| Cowork sets the address and `CLAUDE_CODE_ENTRYPOINT=local-agent` | desktop app source `app.asar` 2.19675.0 | by source; live Cowork NOT measured (no new sessions in this lane). If absent: campaign, never full, for Riaan |
| A hook sees those variables | Claude Code 2.1.286 binary: hooks get the process environment; the credential scrub lists name tokens and keys, not these | inferred; **verify in the hook itself** after install: the guard logs nothing, so the check is the behaviour (an email send in Riaan's Code is not refused) |
| Windows OS account | `os.userInfo()` here | `riaan` |
| Mac OS account | `Borg-Cloud/docs/M1-AIR.md` | `riaanventer` |
| The three's claude.ai addresses; Anton's Windows user name | Borg People & Roles, onboarding packets, shared folder | NOT recorded (gap); not needed by the rule |

## Not in this change

The guard protecting its own folder (`d9edeab`, parked): for the three it is hardening that needs its
own tests; with C3's classification it is not a boundary either. PR #17 (Anton's recorded claim
approvals): separate.
