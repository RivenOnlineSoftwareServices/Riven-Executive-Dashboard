// Negative controls for guard.js (developer's checkouts, the two false-positive fixes, and the Claude
// review's findings, 2026-10-03): each mutation removes one rule (every layer of it) from a COPY of
// guard.js; guard.test.js runs against the copy (GUARD_PATH) and must fail, on the named case. A
// mutation whose find text is missing (or not unique) is NOT-APPLIED, never a pass.
// Run from the plugin folder: node hooks/guard.controls.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HOOKS, "..");
const COPY_DIR = mkdtempSync(join(tmpdir(), "gc-controls-"));
const COPY = join(COPY_DIR, "guard.js");
const original = readFileSync(join(HOOKS, "guard.js"), "utf8").split("\r\n").join("\n");

// [name, expected failing case (substring of its assertion message), [find, replace]...]
const M = [
  // ---- who counts as a developer's checkout
  ["D1 nothing is a developer's checkout", "dev: a request to a local server",
    ["function devCheckout(cwd) {\n", "function devCheckout(cwd) {\n  return false;\n"]],
  ["D2 a campaign repository is judged by nothing (name, main repository, remote)", "campaign repository: a web request",
    ["isProtected(norm(root)) || CAMPAIGN_REPO.test(norm(root)) ||", "isProtected(norm(root)) ||"],
    ["isProtected(norm(gitDir)) || CAMPAIGN_REPO.test(norm(gitDir)) ||", "isProtected(norm(gitDir)) ||"],
    ["return settings !== null && !CAMPAIGN_REPO.test(settings);", "return settings !== null;"]],
  ["D3 a campaign clone under another name (the remote is ignored)", "a clone of the campaign repository under another name",
    ["return settings !== null && !CAMPAIGN_REPO.test(settings);", "return settings !== null;"]],
  ["D26 the config is read as text, not as git resolves it", "a campaign remote continued across two lines",
    ["const settings = ownGitSettings(root);", "const settings = readText(path.join(gitDir, 'config'));"]],
  ["D27 a config git refuses is accepted", "a .git/config git refuses",
    ["!== norm(realLocation(root, root))) return null;", "!== norm(realLocation(root, root))) return '';"],
    ["if (list.status !== 0) return null;", "if (list.status !== 0) return '';"]],
  ["D28 a .git folder that is not a repository is accepted", "a .git folder that is not a repository",
    ["  if (top.status !== 0 || norm(realLocation(String(top.stdout).trim(), root)) !== norm(realLocation(root, root))) return null;\n", ""]],
  ["D29 included config files are not followed", "a campaign remote in an included config file",
    ["'--show-scope', '--includes'", "'--show-scope', '--no-includes'"]],
  ["D30 URL rewrites are ignored", "a campaign remote reached through a URL rewrite",
    ["\\t(remote\\.|url\\.|include)/i", "\\t(remote\\.|include)/i"]],
  ["D4 the marker file is ignored (both places)", "named otherwise, with the marker file",
    [" || fs.existsSync(path.join(root, CAMPAIGN_MARKER))) return false;", ") return false;"],
    [" || fs.existsSync(path.join(mainRoot, CAMPAIGN_MARKER))) return false;", ") return false;"]],
  ["D5 a worktree is judged by its own folder only", "a worktree of the campaign repository living elsewhere",
    ["  if (st.isFile()) {\n", "  if (st.isFile()) return true;\n  if (false) {\n"]],
  ["D6 a checkout inside a company folder counts (every layer)", "a git checkout inside a company folder",
    ["if (isProtected(norm(project)) || !underDevRoot", "if (!underDevRoot"],
    ["if (isProtected(norm(root)) || CAMPAIGN_REPO", "if (CAMPAIGN_REPO"],
    ["if (isProtected(norm(gitDir)) || CAMPAIGN_REPO", "if (CAMPAIGN_REPO"],
    ["  if (isProtected(norm(where))) return false;\n", ""]],
  ["D7 no launch folder: the shell's folder is used instead", "no launch folder known",
    ["const launched = process.env.CLAUDE_PROJECT_DIR;", "const launched = process.env.CLAUDE_PROJECT_DIR || cwd;"]],
  ["D8 the shell's folder decides, not the launch folder", "the shell has gone into a fresh git init folder",
    ["const project = realLocation(launched, process.cwd());", "const project = realLocation(cwd || launched, process.cwd());"]],
  ["D9 the shell may leave the checkout", "the shell has left the checkout",
    ["return (norm(where) + '/').startsWith(norm(root).replace(/\\/?$/, '/'));", "return true;"]],
  ["D10 a .git at the home folder counts", "a dotfiles .git at the home folder",
    [" || norm(root) === norm(realLocation(os.homedir(), process.cwd()))", ""]],
  ["D11 a junction is not followed (every place)", "a junction with a neutral name",
    ["const project = realLocation(launched, process.cwd());", "const project = path.resolve(launched);"],
    ["  gitDir = realLocation(gitDir, root);\n", ""],
    ["const where = realLocation(cwd || launched, process.cwd());", "const where = path.resolve(cwd || launched);"]],
  ["D12 a .git file that is not a worktree link counts", "a .git file that is not a worktree link",
    ["if (!link) return false;", "if (!link) return true;"]],
  ["D20 a checkout outside the owner's code folder counts (launch folder as written and resolved, checkout root)", "a .git written in Anton's own launch folder",
    [" || !underDevRoot(path.resolve(launched))", ""],
    [" || !underDevRoot(project)) return false;", ") return false;"],
    ["if (!root || !underDevRoot(root) ||", "if (!root ||"]],
  ["D21 an environment variable moves the code folder", "a persisted GLOWMING_DEV_ROOTS",
    ["return (testRoots || [", "return (process.env.GLOWMING_DEV_ROOTS ? [process.env.GLOWMING_DEV_ROOTS] : testRoots || ["]],
  ["D22 the code folder itself may be the checkout", "a .git at the code folder itself",
    ["if (!root || !underDevRoot(root) ||", "if (!root ||"]],
  ["D23 the code folder is followed through a junction", "a junction as the code folder",
    ["return st.isDirectory() && !st.isSymbolicLink();", "return true;"],
    [".map((r) => norm(path.resolve(r)).replace(", ".map((r) => norm(realLocation(r, process.cwd())).replace("]],
  ["D24 the launch folder is judged only as resolved", "a launch folder outside the code folder that is a junction leading in",
    [" || !underDevRoot(path.resolve(launched))", ""]],
  ["D25 the launch folder is judged only as written", "a launch folder in the code folder that is a junction leading out",
    [" || !underDevRoot(project)) return false;", ") return false;"],
    ["if (!root || !underDevRoot(root) ||", "if (!root ||"]],
  // ---- what still holds in a developer's checkout
  ["D13 a developer's checkout may delete company files", "dev: rm a company file",
    ["if ((isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full))", "if (!dev && (isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full))"]],
  ["D14 a developer's checkout takes no copy of the company folders", "dev: a script that overwrites a caption",
    ["if (!(isProtected(nfull) || inFolder)) return null;", "if (dev || !(isProtected(nfull) || inFolder)) return null;"]],
  // ---- what steps aside there (each rule on its own)
  ["D15 web requests still refused in a developer's checkout", "dev: a request to a local server",
    ["!dev && NET_CALL.test(", "NET_CALL.test("]],
  ["D16 hidden code in the command still refused there", "dev: an inline eval",
    ["if (!dev && HIDDEN_CODE.test(cmd))", "if (HIDDEN_CODE.test(cmd))"]],
  ["D17 the depth limit still applies there", "dev: a chain of scripts five levels deep",
    ["if (!dev && scripts.tooDeep > 0)", "if (scripts.tooDeep > 0)"]],
  ["D18 hidden code in scripts still refused there", "dev: the test-and-build script",
    ["if (!dev && HIDDEN_CODE.test(scripts.hiddenText))", "if (HIDDEN_CODE.test(scripts.hiddenText))"]],
  ["D19 claim text in shell writes still refused there", "dev: a test fixture that names a banned word",
    ["if (!dev && (redirects || CODE_WRITE", "if ((redirects || CODE_WRITE"]],
  // ---- the type-only import exception
  ["F1 a type-only import counts as a web request", "type-only import of node:http is not a web request",
    ["NET_CALL.test(cmd + scripts.netText)", "NET_CALL.test(cmd + scripts.text)"]],
  ["F2 the exception also takes real imports", "a real import of node:http still is",
    ["(?:import|export)\\s+type\\s+(?:", "(?:import|export)\\s+(?:type\\s+)?(?:"]],
  ["F3 the exception swallows anything between braces, everywhere (both layers)", "echoed \"import type {\"",
    ["\\{[\\s\\w$,]*\\}", "\\{[^}]*\\}"],
    ["NET_CALL.test(cmd + scripts.netText)", "NET_CALL.test((cmd + scripts.netText).replace(TYPE_ONLY_IMPORT, ''))"]],
  ["F4 the exception reaches scripts that are not TypeScript", "a type-only import line inside a Python script",
    ["(TS_SCRIPT.test(file) ? part.replace(TYPE_ONLY_IMPORT, '') : part)", "part.replace(TYPE_ONLY_IMPORT, '')"]],
  // ---- hidden code
  ["F5 a regex's .exec( in a JavaScript script counts as hidden code", "a regex's .exec( is not hidden code",
    ["(JS_SCRIPT.test(file) ? part.replace(JS_MEMBER_EXEC, '.call_(') : part)", "part"]],
  // The suite stops at its first failure: an earlier case already depends on each bare call.
  ["F6 a bare exec( is no longer caught", "a scratch script that runs code from stdin",
    ["|\\bexec\\s*\\(|", "|(?<![\\s\\S])exec\\s*\\(|"]],
  ["F7 a bare eval( is no longer caught", "a worktree of the campaign repository: hidden code",
    ["|\\beval\\s*\\(|", "|(?<![\\s\\S])eval\\s*\\(|"]],
  ["F8 eval through the global object is no longer caught", "eval reached through the global object",
    ["|\\beval\\s*\\(|", "|(?<![.\\w$])eval\\s*\\(|"]],
  ["F9 a member exec( is exempt in every script, Python included", "Python exec through an alias of builtins, in a script",
    ["(JS_SCRIPT.test(file) ? part.replace(JS_MEMBER_EXEC, '.call_(') : part)", "part.replace(JS_MEMBER_EXEC, '.call_(')"]],
  ["F15 a member exec( is exempt in the command", "Python exec through an alias of builtins, in the command",
    ["if (!dev && HIDDEN_CODE.test(cmd))", "if (!dev && HIDDEN_CODE.test(cmd.replace(JS_MEMBER_EXEC, '.call_(')))"]],
  ["F16 exec with a space before the bracket is not caught", "Python exec with a space before the bracket",
    ["|\\bexec\\s*\\(|", "|\\bexec\\(|"]],
  ["F10 atob is no longer caught", "a payload decoded with atob",
    ["\\batob\\(|", ""]],
  // The hex case runs first and depends on the same pattern.
  ["F11 a decoding Buffer is no longer caught", "a child process given a command decoded from hex",
    ["\\bfrom\\s*\\([^)]*,\\s*['\"](?:base64(?:url)?|hex)['\"]|", ""]],
  ["F12 new Function is no longer caught", "code built with new Function",
    ["\\bnew\\s+Function\\s*\\(|", ""]],
  ["F13 a base64url Buffer is no longer caught", "a payload decoded from a base64url Buffer",
    ["(?:base64(?:url)?|hex)", "(?:base64|hex)"]],
  ["F17 a hex Buffer is no longer caught", "a child process given a command decoded from hex",
    ["(?:base64(?:url)?|hex)", "(?:base64(?:url)?)"]],
  // A third element "all": every occurrence (the extension list appears three times in SCRIPT_FILE).
  ["F14 .mts scripts are not read", "a web request inside a .mts script",
    ["|ts|mts|cts|tsx|", "|ts|cts|tsx|", "all"]],
];

// The table must still carry its backslashes (Dev Rule #30): F2 looks for a literal backslash-s.
if (!M.find((m) => m[0].startsWith("F2"))[2][0].includes(String.fromCharCode(92) + "s")) throw new Error("backslashes lost in the mutation table");

let bad = 0;
try {
  for (const [name, expect, ...edits] of M) {
    let text = original;
    let applied = true;
    for (const [find, replace, all] of edits) {
      const n = text.split(find).length - 1;
      if (all ? n < 1 : n !== 1) { applied = false; console.log(`${name}: NOT-APPLIED (${n} matches for ${JSON.stringify(find.slice(0, 60))})`); break; }
      text = all ? text.split(find).join(replace) : text.replace(find, () => replace);
    }
    if (!applied) { bad++; continue; }
    writeFileSync(COPY, text);
    const r = spawnSync(process.execPath, [join("hooks", "guard.test.js")], { cwd: PLUGIN, encoding: "utf8", env: { ...process.env, GUARD_PATH: COPY }, timeout: 300000 });
    const out = (r.stdout || "") + (r.stderr || "");
    if (r.status === 0) { bad++; console.log(`${name}: SURVIVED`); continue; }
    const m = out.match(/AssertionError[^:]*:\s*([^\n]+)/);
    const msg = m ? m[1] : out.split("\n").slice(0, 3).join(" | ");
    if (!msg.includes(expect)) { bad++; console.log(`${name}: WRONG-TEST (failed on: ${msg})`); continue; }
    console.log(`${name}: RED (${expect})`);
  }
} finally {
  rmSync(COPY_DIR, { recursive: true, force: true });
}
console.log(`\n${M.length - bad}/${M.length} controls RED for the right case`);
process.exit(bad ? 1 : 0);
