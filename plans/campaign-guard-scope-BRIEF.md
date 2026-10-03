# Brief: the campaign guard guards campaign work only

For a cloud session (the guard doesn't run there, so it can't block this fix). Written by
the M1 Air Desktop session on 2026-10-03, with Riaan's ruling: **"Guard only campaign work"**,
and the earlier ruling (PR #18, 2026-10-02): **"Your job is to warn, not refuse. Our rules must
work. Just never refuse me or Anton."**

## The problem, measured

`mcp-plugins/glowming-campaign` (v0.1.2) is published to the Riven org through claude.ai, and
the Claude Desktop app loads org plugins into **every** session. Its `hooks/hooks.json` runs
`hooks/guard.js` on PreToolUse for `Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell|mcp__.*`
in every session. That includes Riaan's development and assistant sessions on both machines,
which have nothing to do with the campaign.

On 2026-10-02/03 it refused, in non-campaign sessions:
- `curl` and any shell web request ("Web requests from the shell or a script are not allowed").
- Any Bash command naming a file whose contents mention eval/exec/stdin, including plain
  `wc -l`, `grep` and `git` on hook scripts, and `base64 -D`, and `cmd | bash`, and inline `node -e`.
  This stopped work on the borg plugin hooks (riven-claude-state #84) on both machines.
- Microsoft 365 writes ("Only reading from Microsoft 365 is allowed"), which stopped Robbie's
  email draft to Anton, and every shop change, which stopped creating the WELCOME50 code.

PR #18 made the **content check** warn-only, but stated that **guard.js was left unchanged**.
So Riaan's "never refuse me or Anton" was never applied to guard.js.

## What to build

1. **Scope:** guard.js (and calendar-links.js, if it can act outside the campaign) acts ONLY
   when the session is doing campaign work. Decide the signal from what the hook actually
   receives (PreToolUse stdin: `cwd`, `transcript_path`, `tool_input`, and so on). For example:
   - the session's cwd or the target path is inside the shared campaign folder / the synced
     SharePoint campaign folder that the plugin's README names; or
   - the tool call is a campaign skill's own operation (Heyu, Zac, campaign).
   Outside that scope: exit 0, silently. Prefer a positive test ("this IS campaign work") over a
   negative one ("this is not Riaan"), so an unrecognised session is NOT guarded, because it isn't
   campaign work. Inside campaign scope, keep Anton's file allow-list exactly as it is.
2. **"Never refuse Riaan or Anton"** (PR #18's ruling), inside campaign scope too: decide with Riaan
   whether that means warn-only for both owners, as PR #18 did for the content check, or keeping
   the file allow-list hard for Anton's Cowork, as in Riaan's 2026-10-01 ruling. Don't guess; put
   the question to Riaan with both options.
3. **Tests:** `hooks/guard.test.js` gains cases for (a) the scope, with each refusal listed above
   now passing outside campaign scope, and (b) every existing Anton protection still holding
   inside campaign scope. Don't weaken any existing case without saying so in the PR.
4. **Version bump** to 0.1.3, and say plainly in the PR that the plugin must be **re-published
   to the org in claude.ai** for the change to reach anyone. The Desktop copy on the Air was
   still 0.1.2 with the old guard.js.
5. **Review:** Codex under Rule #20, and a check on the M1 Air (the Desktop session there will
   test the published plugin in a real non-campaign session and in a campaign session).

## Not in scope

The content check (already warn-only), pulse, collective and exec-workspace.
