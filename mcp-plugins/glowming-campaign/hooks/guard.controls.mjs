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
  ["D2 a folder whose name says campaign counts", "the shell in a folder whose name says campaign",
    ["if (isProtected(norm(where)) || CAMPAIGN_REPO.test(norm(where))) return false;", "if (isProtected(norm(where))) return false;"]],
  ["D3 a company folder counts", "a checkout inside a company folder",
    ["if (isProtected(norm(where)) || CAMPAIGN_REPO.test(norm(where))) return false;", "if (CAMPAIGN_REPO.test(norm(where))) return false;"]],
  ["D4 no launch folder: the shell's folder is used instead", "no launch folder known",
    ["const launched = process.env.CLAUDE_PROJECT_DIR;", "const launched = process.env.CLAUDE_PROJECT_DIR || cwd;"]],
  ["D5 the shell may leave the launch folder", "the shell has left the launch folder",
    ["return (norm(where) + '/').startsWith(norm(written).replace(/\\/?$/, '/'));", "return true;"]],
  ["D6 a launch outside the owner's code folder counts", "launched in Anton's folder (outside the code folder)",
    ["  if (!underDevRoot(written)) return false;\n", ""]],
  ["D7 the shell's folder is taken as written, not resolved (links followed nowhere)", "a junction with a neutral name",
    ["const where = realLocation(cwd || launched, process.cwd());", "const where = path.resolve(cwd || launched);"]],
  ["D8 an environment variable moves the code folder", "a persisted GLOWMING_DEV_ROOTS",
    ["return (testRoots || [", "return (process.env.GLOWMING_DEV_ROOTS ? [process.env.GLOWMING_DEV_ROOTS] : testRoots || ["]],
  ["D9 the code folder itself counts as a launch folder", "launched at the code folder itself",
    ["d.startsWith(r) && d !== r", "d.startsWith(r)"]],
  ["D10 the code folder is followed through a junction", "a junction as the code folder",
    ["return st.isDirectory() && !st.isSymbolicLink();", "return true;"],
    [".map((r) => norm(path.resolve(r)).replace(", ".map((r) => norm(realLocation(r, process.cwd())).replace("]],
  ["D11 the launch folder is taken as resolved (a junction leading in counts)", "a launch folder outside the code folder that is a junction leading in",
    ["const written = path.resolve(launched);", "const written = realLocation(launched, process.cwd());"]],
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
    ["if (!dev && HIDDEN_CODE.test(scripts.text))", "if (HIDDEN_CODE.test(scripts.text))"]],
  ["D19 claim text in shell writes still refused there", "dev: a test fixture that names a banned word",
    ["if (!dev && (redirects || CODE_WRITE", "if ((redirects || CODE_WRITE"]],
  // ---- the type-only import exception
  // ---- no text exempted outside a developer's checkout
  ["F1 a type-only import is exempted again (text stripped before NET_CALL)", "a TypeScript type-only import of node:http counts as on main",
    ["if (!dev && NET_CALL.test(full))", "if (!dev && NET_CALL.test(full.replace(/\\bimport\\s+type\\s*\\{[^}]*\\}\\s*from\\s*['\"][^'\"]+['\"]/g, '')))"]],
  // ---- hidden code
  // The regex case runs first and depends on the same rule (no member call is exempt).
  ["F5 a member exec( is exempt (a file's name or a regex receiver trusted)", "a regex's .exec( still counts",
    ["|\\bexec\\s*\\(|", "|(?<![.\\w$])exec\\s*\\(|"]],
  // The suite stops at its first failure: an earlier case already depends on each bare call.
  ["F6 a bare exec( is no longer caught", "a scratch script that runs code from stdin",
    ["|\\bexec\\s*\\(|", "|(?<![\\s\\S])exec\\s*\\(|"]],
  ["F7 a bare eval( is no longer caught", "a worktree made inside the campaign repository: hidden code",
    ["|\\beval\\s*\\(|", "|(?<![\\s\\S])eval\\s*\\(|"]],
  ["F8 eval through the global object is no longer caught", "eval reached through the global object",
    ["|\\beval\\s*\\(|", "|(?<![.\\w$])eval\\s*\\(|"]],
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
  ["F14 the script-name pattern widened again (a quoted command swallowed whole)", "beside a name the pattern does not know",
    ["|cjs|ts|ps1|", "|cjs|ts|mts|ps1|", "all"]],
];

// The table must still carry its backslashes (Dev Rule #30): F6 looks for a literal backslash-s.
if (!M.find((m) => m[0].startsWith("F6"))[2][0].includes(String.fromCharCode(92) + "s")) throw new Error("backslashes lost in the mutation table");

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
