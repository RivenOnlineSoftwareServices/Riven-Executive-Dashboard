# Next session: glowming-campaign guard (left by session 3e00d797, 2026-10-03)

Riaan, 2026-10-03: "Leave it for the next session. With a note."

## Do first: make the guard run only for Anton

The guard was running in Riaan's own Claude Code sessions and blocking his work. Riaan turned
the plugin off for himself on 2026-10-03; that is a stopgap, not the fix.

Riaan's answer on HOW to tell them apart: **"Either."**

- Riaan works from: Zenbook (Windows), Mac, iPhone, iPad.
- Anton works from: DELL laptop (Windows, Cowork) and the Claude iPhone app.
- Hooks only run where there are local files and a shell, so in practice the guard matters on
  Anton's DELL. The phone apps run no hooks either way.

Lean: the guard applies only when the Windows user is Anton's (a fact a session cannot change,
per the #19 design lesson). Get Anton's Windows user name first; never guess it. Decide what
happens when the user name cannot be read (fail closed = guard on).

## Then: the parked self-protection work (this branch)

Local commit `d9edeab` on `claude/beautiful-banach-92dbdc`: guard.js protects its own plugin
folder (file tools, connectors, shell deletes/moves including parent folders and globs, any
non-read shell command naming it, hard links, short names); post.js puts the folder back after
every non-read shell command; hooks.json adds PostToolUseFailure so a failing command is still
checked. NOT done yet:

- tests (new section in hooks/guard.test.js; fake plugin folder via setPluginRootsForTests)
- negative controls in hooks/guard.controls.mjs (copy hooks into COPY_DIR/hooks so the
  __dirname root exists; D14 control must follow the changed snapshot line)
- Claude review, then Codex; bump plugin version; PR

Gotcha: in a session where the old guard is still loaded, a shell command that NAMES the guard's
.js files is refused (it reads their text). Commit by folder, not by file name.
