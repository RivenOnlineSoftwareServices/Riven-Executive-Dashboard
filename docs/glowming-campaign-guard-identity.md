# Design note: the campaign guard is for Anton, Etienne and Louis, never for Riaan

Rule #41 (a guard is a risk surface). Plugin `glowming-campaign`, 2026-10-03.

## Why

Operator ruling by pop-up, 2026-10-03: the guard applies to "Anton, Etienne and Louis please", never
to Riaan. The same day the guard ran in Riaan's own Code and Cowork sessions (the plugin is installed
per claude.ai account and synced into the desktop Code tab) and refused email sends, script web
calls, the compliance gate and shell commands that named its own files. Riaan had to disable the
Cowork install by hand. How to tell people apart: "Either" (user name or machine).

## The rule

`identity()` in `hooks/guard.js` returns one of three modes, read once per hook process:

| # | Signal | Mode |
|---|---|---|
| 1 | `CLAUDE_CODE_USER_EMAIL` (the signed-in claude.ai account, set by the Claude desktop app) is one of Riaan's addresses (`riaan@riven.co.za`, `riaan.venter@riven.co.za`) | **off** |
| 2 | that variable holds any other address (the three's known addresses are listed; anyone else counts the same) | **full** |
| 3 | no address, and the operating-system account (`os.userInfo().username`, case-insensitive) is Riaan's (`riaan` on Windows, `riaanventer` on the Mac) | **off** |
| 4 | anything else (no address, unknown account, or the account cannot be read) | **campaign** |

- **off:** `guard.js` allows everything and `post.js` does nothing (no copy, no put-back, no warning).
  Silent.
- **full:** today's guard (0.1.3), unchanged, including #19's step-aside in a developer's checkout.
- **campaign** (unknown person): only the campaign surfaces are guarded. File-tool writes into the
  company folders are judged as today (they only ever applied there); a shell command is judged only
  if it names a company folder or runs inside one, and then by every rule (deletes refused, the
  blanket rules, the copy post.js checks); a connector call only if its arguments name or lead into
  a company folder. Anything else is allowed. #19's code-repository step-aside still applies.

So an unknown identity fails toward protecting the company files (the three's work), never toward
blocking an unknown session's unrelated work, which on Riaan's machines is his.

**Email before machine.** The account says who is working; the machine only says whose laptop it
is. Anton signed in on Riaan's laptop gets the full guard; Riaan signed in on Anton's DELL gets none.

**Tampering.** The address is set by the app when it starts a session; a session cannot change it for
itself. It could reach the NEXT session through `setx` (plain CLI only: the desktop app overrides the
inherited value) or a `settings.json` `env` block, both of which a file write or a shell command can
make. So in full and campaign mode any tool call whose input or scripts name
`CLAUDE_CODE_USER_EMAIL` is refused. A name built at run time is a stated limit.

**The warning check.** The PostToolUse prompt hook (an LLM call after every write, warn-only, #18)
cannot be scoped by identity: hooks.json has no identity condition and a prompt hook runs no code.
It is replaced by a deterministic warning in `post.js`: after a file-tool write, text that looks like
a key, token, private key, password assignment or a Luhn-valid 13-19 digit number (card or SA ID),
or a banned claim, produces a warning (never a block). Full mode checks every write; campaign mode
only writes into the company folders; off checks nothing. Cost: the LLM's broader "could Meta/ARB
reject this" judgment is lost; banned claims in company files are still refused before the write.

## What each surface does now

| Surface | Signal it gives | Mode |
|---|---|---|
| Riaan, Windows, desktop Code tab | email `riaan@riven.co.za` | off |
| Riaan, Windows, plain `claude` CLI | no email; OS `riaan` | off |
| Riaan, Mac (Air) Code or CLI | email, else OS `riaanventer` | off |
| Riaan, Cowork (Windows or Mac VM) | email (set by the app for Cowork) | off |
| Riaan, cloud session | email if present, else OS `root`/other: campaign; no company folders exist there, so silent | off / campaign |
| Anton, Cowork and desktop Code on the DELL | his account's email | full |
| Etienne, Louis | their account's email | full |
| Anyone, CLI with no email, unknown OS account | none | campaign |

## Trust boundaries

What a session controls: every file it may write outside the company folders, its shell, and the
environment of processes it starts. What it does not control: the environment the app gives the
hook process, and the OS account. The guard trusts only those two. Phones run no hooks.

## Failure model

Each signal missing degrades one step: no email -> OS account; unreadable OS account -> campaign.
No case turns the guard off without a positive match on Riaan's address or Riaan's OS account.
`post.js` in off mode leaves earlier snapshots alone (a later full/campaign run clears them; they
expire after six hours).

## Platform facts

| Fact | How verified | Result |
|---|---|---|
| Desktop Code sets `CLAUDE_CODE_USER_EMAIL` | `env` in this session, ZENBOOKDUO-RV26 | `riaan@riven.co.za` (also `CLAUDE_CODE_ACCOUNT_UUID`) |
| Cowork sessions get the same variable | the desktop app's own source (`app.asar` 2.19675.0, the Cowork env builder sets `CLAUDE_CODE_ACCOUNT_UUID`, `CLAUDE_CODE_USER_EMAIL`, `CLAUDE_CODE_ORGANIZATION_UUID` when the account has them) | present by source; live Cowork run NOT measured (no new sessions in this lane). If absent, Riaan's Cowork falls to campaign mode (rule 4), never full |
| Hooks inherit it | Claude Code 2.1.286 binary: the credential-scrub lists name tokens and keys only, not the email | inferred; `node hooks/guard.js --whoami` prints the mode for a check on each machine |
| Windows OS account | `USERNAME` / `os.userInfo()` here | `riaan` |
| Mac OS account | `Borg-Cloud/docs/M1-AIR.md` | `riaanventer` |
| Anton's, Etienne's, Louis's claude.ai sign-in addresses | Borg People & Roles, onboarding packets | NOT recorded (gap). Not needed: any non-Riaan address is full |
| Anton's Windows user name | Borg, onboarding, shared folder | NOT recorded (gap). Not needed: it only matters with no email, and unknown is campaign |

## Not in this change

The guard protecting its own folder (`d9edeab`, parked): irrelevant for Riaan now; for the three it
is hardening that needs its own tests. PR #17 (Anton's recorded claim approvals): separate.
