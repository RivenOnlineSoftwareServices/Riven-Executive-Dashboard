# Design note: the campaign guard is for Anton, Etienne and Louis, never for Riaan

Rule #41 (a guard is a risk surface). Plugin `glowming-campaign`, 2026-10-03. Round 6: Codex design
rounds 1 (C1-C7), 2 (D1-D7), 3 (E1-E6), 4 (F1-F6) and 5 (G1-G5) answered inline.

## Why

Operator ruling by pop-up, 2026-10-03: the guard applies to "Anton, Etienne and Louis please", never
to Riaan. The same day the guard ran in Riaan's own Code and Cowork sessions (the plugin is installed
per claude.ai account and synced into the desktop Code tab) and refused email sends, script web
calls, the compliance gate and shell commands that named its own files. Riaan had to disable the
Cowork install by hand. How to tell people apart: "Either" (user name or machine).

## What kind of guard this is (C3)

An **accidental-misuse guard**: it keeps a well-meaning Claude, working for a non-technical owner,
inside the campaign rules. It is not a boundary against a session set on escaping it (a session can
always build a setting name at run time, or a person can switch the plugin off). It refuses the
direct, recognisable forms of switching itself off (tamper rule) so that does not happen in passing.
Forging an identity variable is deliberate, so it is in the same class as disabling the plugin.

## The rule, in order (D2, D4)

1. **Identity.** `identity()` returns the first match:
   1. An **app-set** address: `CLAUDE_CODE_ENTRYPOINT` is `claude-desktop` (desktop Code tab) or
      `local-agent` (Cowork), the launchers that set `CLAUDE_CODE_USER_EMAIL` from the signed-in
      account and replace any inherited value. Riaan's address -> **off**; any other -> **full**.
   2. Riaan's **provisioned machine**: the operating-system account AND the machine name, as a pair
      (`os.userInfo().username`, `os.hostname()` without `.local`, case-insensitive): `riaan` on
      `ZENBOOKDUO-RV26`, `riaanventer` on `Riaans-MacBook-Air` -> **off** (E2: a user name alone is
      reusable on another machine or image). A recognised Riaan machine beats an address of unknown
      origin (D2).
   3. An address from any other launcher (plain CLI, cloud): Riaan's -> **off**; any other -> **full**.
   4. Nothing usable -> **campaign**.
2. **off:** `guard.js` allows; `post.js` returns before any check, put-back or warning.
3. **Tamper rule** (full: all of it; campaign: settings files and plugin-disable commands, G4), before scope.
4. **full:** the 0.1.3 guard unchanged, with #19's step-aside in a developer's checkout.
5. **campaign:** scope discovery, then out-of-scope calls are allowed, in-scope calls judged by every
   full-mode rule (below).

Riaan's addresses: `riaan@riven.co.za` (measured), `riaan.venter@riven.co.za`. Riaan's address is
the only thing that matters for "never Riaan"; Anton's / Etienne's / Louis's known addresses
(`anton@riven.global`, `anton@titaninternational.co.za`, `etienne@riven.global`,
`etienne@glowming.co.za`, `louis@glowming.co.za`, `louis@riven.global`) are named in the code for
the diagnostic.

**C1/D1/E1, scope of "the three".** Their claude.ai sign-in addresses are not recorded (gap, reported;
the lane may not ask Riaan). Any non-Riaan address is treated like the three: the marketplace repo is
public, so a stranger could install the plugin; today they get the full guard, and still do. That is
a deliberate fail-toward-protection for non-Riaan people, not a claim that they are "the three".
Campaign mode is explicitly LIMITED local protection for sessions with no usable identity; it is
neither full protection nor guaranteed silence. **Authority (E1):** the lane brief from Riaan's
session for this work names this exact trade: "unknown -> on but only for the campaign surfaces,
never for code repos (keep #19's code-repo step-aside)", and says an unknown identity on Riaan's
machines must not block him; Riaan's provisioned machines are never unknown (1.1 or 1.2). An
operator-provisioned mapping for other surfaces (cloud, a new machine) is a follow-up, reported.

## Tamper rule (C3, D3, E3, E4)

A shell command, or a script it runs (the same three-level read as today), is refused:
- full and campaign mode: if its text runs `claude plugin disable|uninstall|remove` or passes
  `--settings` / `--setting-sources` / `--plugin-dir` to a `claude` launch; or if its text contains a
  Claude settings file NAME (`settings.json`, `settings.local.json`, `.claude.json`,
  `managed-settings.json`, matched as a word in the text, NOT resolved to a folder: G2, so `cd ~/.claude
  && cp x settings.json` and any `CLAUDE_CONFIG_DIR` location are caught) and the command is not a
  **single simple read** (G1): one command, no `;`, `&`, `|`, newline, redirect (other than to
  `/dev/null` / `nul`), `$(` or backtick, whose first word is one of `cat`, `type`, `head`, `tail`,
  `less`, `more`, `get-content`, `gc`, `wc`, `stat`, `ls`, `dir`, `test-path`, `get-item`, and no
  scripts run. A read through `grep`/`rg`/`jq` naming a settings file is refused (options such as
  `rg --pre` run programs); Anton never needs it.
- full mode only: if its text names `CLAUDE_CODE_USER_EMAIL`, `CLAUDE_CODE_ENTRYPOINT`,
  `CLAUDE_CONFIG_DIR`, `disableAllHooks` or `enabledPlugins` (campaign mode leaves these out, so an
  unidentified Riaan can still mention them).

Full and campaign mode, a file-tool write to a Claude settings file (the target path, resolved:
`settings.json` / `settings.local.json` inside a folder named `.claude` or the `CLAUDE_CONFIG_DIR`
folder, or `.claude.json` / `managed-settings.json` anywhere; a project's own or VS Code's
`settings.json` elsewhere is not one) is judged on the **parsed** current and
resulting JSON (E3): refused if `disableAllHooks` becomes true, any `enabledPlugins` key starting
`glowming-campaign@` is set false or removed, or `env.CLAUDE_CODE_USER_EMAIL`,
`env.CLAUDE_CODE_ENTRYPOINT` or `env.CLAUDE_CONFIG_DIR` is added, changed or removed. If the resulting
text cannot be worked out or does not parse as JSON, the write is refused (a settings file that does
not parse is not a settings file Claude Code reads either, but the edit cannot be checked). Other
files (a document that mentions the variable) are not affected.

## Campaign mode (C6, D4)

1. **Scope discovery**, shared by every check: the command text plus every script it runs, every path
   candidate resolved from the shell's folder, and the shell's folder (`foldersNamed`, `isProtected`).
   A shell call **touches** the company folders if any of these names or resolves into one; a
   connector call if any string argument does; a file tool if its target does.
2. **Not touching:** allowed, no copy, no warning. A script the guard cannot read counts as not
   touching unless the command or the shell's folder already does.
3. **Touching:** every full-mode rule (deletes refused, blanket shell rules, the copy post.js checks,
   connector rules), with #19's step-aside.

Stated consequences (C4, G3, G4): this is approval of the documented scope, with provisioning for
cloud sessions and new machines outstanding; campaign mode does not stop a runtime-built name or a
setting changed by a script that names neither a settings file nor a plugin command; a remote company resource reached only by ID (a Graph `DELETE` on an item
ID, an email send by message ID) is not judged in campaign mode; a disposable folder named with a
company marker (`/tmp/2026 Summer Campaign`) is judged in every mode but off.

## Snapshots (C5, D5, E5)

A snapshot is processed (compared, put back where the rules say) only by the post hook whose
`tool_use_id` matches the one recorded with it (F3). Every other snapshot younger than six hours is
left untouched, whatever its session. A snapshot older than six hours is deleted without restoring
anything. A post hook with no `tool_use_id` processes nothing and only deletes expired snapshots: the
current "no id, check every snapshot" fallback (`post.js` `verifyAll` with no id) is removed.
`post.js` also runs on `PostToolUseFailure`. In off mode `post.js` touches no snapshot.

**D5, concurrent writers.** Riaan never runs the guard, so his own sessions never restore anything.
A guarded session on ANOTHER machine compares a folder before and after one shell command; a change
OneDrive syncs in during that command (seconds) is indistinguishable from the command's own, and is
put back. The same holds for another local session writing during the window (snapshot to
post-check, not only the command). That is pre-existing, not introduced here. **Displaced bytes are
kept (E5):** before `post.js` puts a file back or removes a new file, it copies the version it is
displacing to `<home>/.glowming-guard-recovery/<date-time>/` (outside every synced folder) and the
message names that path. The promise is therefore "never refuses, blocks or changes anything in
Riaan's own sessions; a guarded session elsewhere that reverts a concurrent change keeps a copy of
it", not "nothing anywhere ever reverts a change of his".

## The warning check (C7, D7)

The PostToolUse prompt hook (an LLM call after every write, #18) cannot be scoped by identity, so it
is replaced by a deterministic check in `post.js` for successful writes, emitting exit-0 JSON with a
redacted `systemMessage` (shown to the person) and `hookSpecificOutput` (`hookEventName:
"PostToolUse"`, `additionalContext` asking Claude to explain the risk). It reads only the newly
written fields. It finds: well-known key and token shapes, private-key blocks, `password|secret|api
key|token = <value>` assignments, Luhn-valid 13-19 digit runs (cards, SA ID numbers) and banned
claims. Narrower than the LLM (no bank account numbers, no "could Meta or the ARB reject this"); a
Luhn-valid order number can warn falsely. "Every write" means the file tools (Write, Edit,
MultiEdit, NotebookEdit) on a successful `PostToolUse`; shell and connector writes are not inspected
for warnings. Full mode: every such write; campaign: those into company folders; off: none.
`PostToolUseFailure` runs snapshot recovery only, never a warning. Restore messages (exit 2) stay
separate from warnings.

## Validation (D6)

`guard.js` and `post.js` record, on every run in every mode, one non-secret line to
`<tmp>/glowming-guard-identity.json`: hook name, mode, which rule decided (1.1 / 1.2 / 1.3 / 1.4),
the entrypoint, the address's domain only, time. Checks owed after install, per surface: Riaan's
desktop Code, plain CLI and Cowork on the Zenbook, the Mac (desktop Code and CLI), Anton's DELL
(Cowork, desktop Code), a cloud session: run any harmless tool call, read the file (in Cowork:
inside the VM's temp folder). Expected: off on every Riaan surface, full on Anton's. Plus a
warning-delivery check (F5): in Anton's Cowork and desktop Code, write a scratch file holding a fake
`sk-...` key outside the company folders; expected: a warning line shown, Claude explains it; the
same in Riaan's sessions: nothing. This lane cannot run them (no new sessions); they are owed.

**"Never Riaan" holds on verified surfaces only (F4).** Verified here: the Zenbook desktop Code tab
(1.1, measured environment) and the Zenbook plain CLI (1.2, measured user and machine). By source or
record, live check owed: Cowork (1.1), the Mac (1.1 or 1.2). Not covered: a cloud session or new
machine with no Riaan address and an unprovisioned account (1.4, campaign); provisioning those is a
follow-up.

## What each surface does now

| Surface | Decided by | Mode |
|---|---|---|
| Riaan, Windows, desktop Code tab | 1.1 email + `claude-desktop` | off |
| Riaan, Windows, plain `claude` CLI | 1.2 `riaan` on `ZENBOOKDUO-RV26` | off |
| Riaan, Mac, desktop Code / CLI | 1.1, else 1.2 `riaanventer` on `Riaans-MacBook-Air` | off |
| Riaan, Cowork (VM) | 1.1 email + `local-agent` (by source) | off; if the VM lacks it: 1.3/1.4 |
| Riaan, cloud session | 1.3 his address if present, else 1.4 | off, else campaign |
| Anton, Etienne, Louis: Cowork, desktop Code | 1.1 their address | full |
| Anyone else with the plugin | 1.1 / 1.3 their address | full |
| No usable address, unknown OS account | 1.4 | campaign |

## Platform facts

| Fact | How verified | Result |
|---|---|---|
| Desktop Code sets `CLAUDE_CODE_USER_EMAIL`, `CLAUDE_CODE_ENTRYPOINT=claude-desktop` | `env` in this session, ZENBOOKDUO-RV26 | `riaan@riven.co.za`, `claude-desktop` |
| Cowork sets the address and `CLAUDE_CODE_ENTRYPOINT=local-agent` | desktop app source `app.asar` 2.19675.0 | by source; live NOT measured: owed via the identity file |
| A hook sees those variables | Claude Code 2.1.286 binary: hooks get the process env; the credential scrub names tokens and keys only | inferred; owed via the identity file |
| Windows OS account | `os.userInfo()` here | `riaan` |
| Windows machine name | `os.hostname()` here | `ZENBOOKDUO-RV26` |
| Mac OS account and machine name | `Borg-Cloud/docs/M1-AIR.md` (User, LAN name) | `riaanventer`, `Riaans-MacBook-Air.local`; `os.hostname()` on the Air NOT measured here: if it differs, the Mac's plain CLI falls to 1.3/1.4 (its desktop Code tab is 1.1) |
| The three's claude.ai addresses; Anton's Windows user name | Borg People & Roles, onboarding packets, shared folder | NOT recorded (gap); not needed by the rule |

## Not in this change

The guard protecting its own folder (`d9edeab`, parked; with C3's classification it is hardening,
not a boundary). PR #17 (Anton's recorded claim approvals).
