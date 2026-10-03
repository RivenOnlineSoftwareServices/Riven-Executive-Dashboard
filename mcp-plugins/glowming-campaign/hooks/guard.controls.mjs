// Negative controls for guard.js (developer's checkouts and the two false-positive fixes, 2026-10-03):
// each mutation removes one rule from a COPY of guard.js; guard.test.js runs against the copy
// (GUARD_PATH) and must fail, on the named case. A mutation whose find text is missing (or not unique)
// is NOT-APPLIED, never a pass. Run from the plugin folder: node hooks/guard.controls.mjs
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
  ["D1 nothing is a developer's checkout", "dev: a request to a local server",
    ["function devCheckout(cwd) {\n", "function devCheckout(cwd) {\n  return false;\n"]],
  ["D2 a campaign repository counts as a developer's checkout", "campaign repository: a web request",
    ["if (isProtected(norm(dir)) || CAMPAIGN_REPO.test(norm(dir))) return false;", "if (isProtected(norm(dir))) return false;"]],
  ["D3 a worktree's link to the campaign repository is ignored", "a worktree of the campaign repository living elsewhere",
    ["if (st.isFile()) {", "if (false) {"]],
  ["D4 a checkout inside a company folder counts (both layers)", "a git checkout inside a company folder",
    ["  if (isProtected(norm(where))) return false;\n", ""],
    ["if (isProtected(norm(dir)) || CAMPAIGN_REPO", "if (false || CAMPAIGN_REPO"]],
  ["D5 a developer's checkout may delete company files", "dev: rm a company file",
    ["if ((isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full))", "if (!dev && (isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full))"]],
  ["D6 a developer's checkout takes no copy of the company folders", "dev: a script that overwrites a caption",
    ["if (!(isProtected(nfull) || inFolder)) return null;", "if (dev || !(isProtected(nfull) || inFolder)) return null;"]],
  ["D7 web requests still refused in a developer's checkout", "dev: a request to a local server",
    ["!dev && NET_CALL.test(", "NET_CALL.test("]],
  ["D8 hidden code in the command still refused there", "dev: an inline eval",
    ["if (!dev && HIDDEN_CODE.test(cmd))", "if (HIDDEN_CODE.test(cmd))"]],
  ["D9 the depth limit still applies there", "dev: a chain of scripts five levels deep",
    ["if (!dev && scripts.tooDeep > 0)", "if (scripts.tooDeep > 0)"]],
  ["D10 hidden code in scripts still refused there", "dev: the test-and-build script",
    ["if (!dev && HIDDEN_CODE.test(scripts.text))", "if (HIDDEN_CODE.test(scripts.text))"]],
  ["D11 claim text in shell writes still refused there", "dev: a test fixture that names a banned word",
    ["if (!dev && (redirects || CODE_WRITE", "if ((redirects || CODE_WRITE"]],
  ["F1 a type-only import counts as a web request", "type-only import of node:http is not a web request",
    ["NET_CALL.test(full.replace(TYPE_ONLY_IMPORT, ''))", "NET_CALL.test(full)"]],
  ["F2 the type-only exception also takes real imports", "a real import of node:http still is",
    ["(?:import|export)\\s+type\\s+(?:", "(?:import|export)\\s+(?:type\\s+)?(?:"]],
  ["F3 a regex's .exec( counts as hidden code", "a regex's .exec( is not hidden code",
    ["(?<![.\\w$])exec\\(", "\\bexec\\("]],
  // The suite stops at its first failure: an earlier case already depends on each bare call.
  ["F4 a bare exec( is no longer caught", "a scratch script that runs code from stdin",
    ["(?<![.\\w$])exec\\(", "(?<![\\s\\S])exec\\("]],
  ["F5 a bare eval( is no longer caught", "a worktree of the campaign repository: hidden code",
    ["(?<![.\\w$])eval\\(", "(?<![\\s\\S])eval\\("]],
];

// The table must still carry its backslashes (Dev Rule #30): F2 looks for a literal backslash-s.
if (!M[12][2][0].includes(String.fromCharCode(92) + "s")) throw new Error("backslashes lost in the mutation table");

let bad = 0;
try {
  for (const [name, expect, ...edits] of M) {
    let text = original;
    let applied = true;
    for (const [find, replace] of edits) {
      const n = text.split(find).length - 1;
      if (n !== 1) { applied = false; console.log(`${name}: NOT-APPLIED (${n} matches for ${JSON.stringify(find.slice(0, 50))})`); break; }
      text = text.replace(find, () => replace);
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
