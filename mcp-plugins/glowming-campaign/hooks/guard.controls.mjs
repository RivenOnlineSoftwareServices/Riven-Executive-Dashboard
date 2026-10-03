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
// post.js mutations (an entry whose first edit is ["@post"]) run a mutated COPY of post.js beside an
// unchanged copy of guard.js and calendar-links.js (post.js requires both from its own folder).
const POST_COPY = join(COPY_DIR, "post.js");
const originalPost = readFileSync(join(HOOKS, "post.js"), "utf8").split("\r\n").join("\n");
writeFileSync(join(COPY_DIR, "calendar-links.js"), readFileSync(join(HOOKS, "calendar-links.js")));

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
  // ---- who is working (operator ruling 2026-10-03: Anton, Etienne and Louis, never Riaan)
  ["I1 off does not return early (Riaan is guarded)", "off: a web request",
    ["if (who.mode === 'off') return null;", "if (false) return null;"]],
  ["I2 an address from any launcher is trusted first", "an inherited address of unknown origin does not override Riaan",
    ["if (email && APP_ENTRYPOINTS.includes(entrypoint)) return byEmail('1.1');", "if (email) return byEmail('1.1');"]],
  ["I3 Riaan's machine by user name alone", "the user name riaan on another machine",
    ["o.user === m.user && o.host === m.host", "o.user === m.user"]],
  // I4/I5 go red at the very first case: the whole suite runs as Anton (in Cowork, on this machine).
  ["I4 the machine is asked before the app-set address", "start-up: a web request from Anton's folder is refused",
    ["  if (email && APP_ENTRYPOINTS.includes(entrypoint)) return byEmail('1.1');\n", ""]],
  ["I5 a non-Riaan address counts as unknown", "start-up: a web request from Anton's folder is refused",
    ["OWNER_EMAILS.includes(email) ? 'off' : 'full'", "OWNER_EMAILS.includes(email) ? 'off' : 'campaign'"]],
  ["I6 the address is compared case-sensitively", "address in capitals",
    ["String(process.env.CLAUDE_CODE_USER_EMAIL || '').trim().toLowerCase()", "String(process.env.CLAUDE_CODE_USER_EMAIL || '').trim()"]],
  ["G1 the hook parses the tool call before asking who is working", "off: even a tool call that cannot be read is let through",
    ["    if (id.mode === 'off') process.exit(0);\n", ""]],
  // ---- campaign mode (no identity)
  ["C1 campaign mode judges everything", "campaign: a web request that touches no company folder",
    ["if (mode === 'campaign' && !(isProtected(nfull) || inFolder)) return null;", ""]],
  ["C2 campaign mode judges nothing", "campaign: rm a company file",
    ["if (mode === 'campaign' && !(isProtected(nfull) || inFolder)) return null;", "if (mode === 'campaign') return null;"]],
  ["C3 campaign mode judges every connector call", "campaign: a send naming no company folder",
    ["if (mode === 'campaign' && !touches()) return null;", ""]],
  ["C4 campaign scope ignores the shell's own folder", "campaign: a command run inside a company folder",
    ["if (mode === 'campaign' && !(isProtected(nfull) || inFolder)) return null;", "if (mode === 'campaign' && !isProtected(nfull)) return null;"]],
  // ---- the tamper list
  ["T1 the identity and setting names are not refused", "tamper: echo the identity variable",
    ["if (full && TAMPER_NAMES.test(all))", "if (false && TAMPER_NAMES.test(all))"]],
  ["T2 campaign mode gets the whole tamper list", "campaign: naming the identity variable is not refused",
    ["shellTamper(cmd, scripts.text, mode !== 'campaign')", "shellTamper(cmd, scripts.text, true)"]],
  ["T3 --bare and --safe-mode are not caught", "tamper: claude --bare",
    ["(settings|setting-sources|plugin-dir|bare|safe-mode)", "(settings|setting-sources|plugin-dir)"]],
  ["T4 switching the plugin off is not caught", "campaign: switching the plugin off",
    ["if (PLUGIN_OFF.test(all) || CLAUDE_LAUNCH_FLAGS.test(all))", "if (CLAUDE_LAUNCH_FLAGS.test(all))"]],
  ["T5 a reset of the .claude folder is not caught", "tamper: renaming the .claude folder",
    ["if (REMOVE_SHELL.test(all) && CLAUDE_DIR.test(all))", "if (false)"]],
  ["T6 a single & counts as a simple read", "tamper: a read and a copy joined by a single &",
    ["if (/[;&|", "if (/[;|"]],
  ["T7 a redirect counts as a simple read", "tamper: a redirect over the settings file",
    [" || REDIRECT.test(c)) return false;", ") return false;"]],
  ["T8 a settings file named in a command is not judged", "tamper: process substitution inside a read",
    ["if (SETTINGS_NAME.test(all) && !singleSimpleRead(cmd))", "if (false)"]],
  // ---- settings files written by the file tools
  ["S1 disableAllHooks may become true", "settings: disableAllHooks set true by Write",
    ["  if (after.disableAllHooks && !before.disableAllHooks) return REFUSE;\n", ""]],
  ["S2 the plugin's entry may be removed", "settings: the plugin entry removed",
    ["  for (const k of Object.keys(pb)) if (", "  if (false) for (const k of Object.keys(pb)) if ("]],
  ["S3 a new entry may switch the plugin off", "settings: a new settings file that switches the plugin off",
    ["  for (const k of Object.keys(pa)) if (", "  if (false) for (const k of Object.keys(pa)) if ("]],
  ["S4 the identity variables may change in settings", "settings: the identity value changed",
    ["  for (const k of SETTINGS_ENV_KEYS) if (", "  if (false) for (const k of SETTINGS_ENV_KEYS) if ("]],
  ["S5 a result that is not JSON passes", "settings: a result that is not JSON",
    ["const after = next === null ? null : parse(next);", "const after = (next === null ? null : parse(next)) || {};"]],
  ["S6 a settings.json in a .claude folder is not a settings file", "settings: disableAllHooks set true by Write",
    ["  if (path.basename(dir).toLowerCase() === '.claude') return true;\n", ""]],
  ["S7 the CLAUDE_CONFIG_DIR folder is not known", "settings: settings.json in the CLAUDE_CONFIG_DIR folder",
    ["return !!cfg && norm(", "return false && norm("]],
  ["S8 .claude.json is not a settings file", "settings: .claude.json anywhere",
    ["if (base === '.claude.json' || base === 'managed-settings.json') return true;", "if (base === 'managed-settings.json') return true;"]],
  ["N1 a command with no call id gets a copy nobody checks", "no call id: a command touching a company folder is refused",
    ["  if (!id) return 'This command touches", "  if (false) return 'This command touches"]],
  // ---- post.js
  ["P1 an expired copy is never cleared", "the expired copy is gone",
    ["@post"], ["    if (stale) { removeSnapshot(manifestPath, manifest); continue; }\n", ""]],
  ["P1b an expired copy is put back when its own call reports late", "an expired copy is cleared when its own call reports late",
    ["@post"], ["    if (stale) { removeSnapshot(", "    if (stale && f !== mine) { removeSnapshot("]],
  ["P2 a check with no id checks every copy", "a check with no id restores nothing",
    ["@post"], ["    if (f === mine) {", "    if (f === mine || !callId) {"]],
  // The overlapping-calls case of section 3 runs first and depends on the same rule.
  ["P3 another call's fresh copy is deleted", "call B is still checked against its own copy",
    ["@post"], ["    if (stale) { removeSnapshot(", "    if (stale || f !== mine) { removeSnapshot("]],
  ["P11 a forbidden new file is removed without being kept", "the report names where the removed file is kept",
    ["@post"], ["      if (!keepDisplaced(p, recovery)) {", "      if (false) {"]],
  ["P12 a new text file is judged without its text", "dev: a script writes a new note with a detox claim",
    ["@post"], ["const reason = guard.checkNewFile(p, cwd, text);", "const reason = guard.checkNewFile(p, cwd);"]],
  ["P13 a short password is not warned about", "a short password written out",
    ["@post"], ["[^\\s\"']+/i;", "[^\\s\"']{6,}/i;"]],
  ["P14 the campaign warning takes the target as written (links not followed)", "campaign: a write through a junction into a company folder is warned about",
    ["@post"], ["guard.realLocation(String(target), event.cwd || process.cwd())", "path.resolve(event.cwd || process.cwd(), String(target))"]],
  ["T9 input redirection and process substitution count as a simple read", "tamper: process substitution inside a read",
    ["if (/[;&|<", "if (/[;&|"]],
  ["T10 a quoted claude executable is not caught", "tamper: a quoted Windows path to claude.exe",
    ["claude(\\.exe)?[\"']?\\s+plugins?", "claude(\\.exe)?\\s+plugins?"]],
  ["T11 a plain read is judged by the scripts it reads", "tamper: one plain read of settings and a script that only mentions",
    ["const all = singleSimpleRead(cmd) ? cmd : cmd + scriptText;", "const all = cmd + scriptText;"]],
  ["X1 a bare existing name in a command is not a path", "campaign: ... with its company folder copied first",
    ["/i.test(piece) || existsFrom(piece, cwd);", "/i.test(piece);"]],
  // The "." case runs first and depends on the same rule.
  ["X3 a connector's bare existing name is not a path", "campaign: a connector delete of \".\" inside a company folder",
    ["/i.test(s) || existsFrom(s, cwd);", "/i.test(s);"]],
  ["M1 the Mac's .local is kept", "the Mac lookup with .local",
    [".toLowerCase().replace(/\\.local$/, ''),", ".toLowerCase(),"]],
  ["M2 the account name is compared in its own capitals", "the Windows lookup in its own capitals",
    ["user: String(sys.userInfo().username || '').toLowerCase(),", "user: String(sys.userInfo().username || ''),"]],
  ["M3 the machine name is compared in its own capitals", "the Windows lookup in its own capitals",
    ["host: String(sys.hostname() || '').toLowerCase()", "host: String(sys.hostname() || '')"]],
  ["M4 a lookup that throws is an error", "the account lookup throwing",
    ["  } catch (e) { return null; }\n}\nlet testOs = null;", "  } catch (e) { throw e; }\n}\nlet testOs = null;"]],
  ["P15 a new file is judged with its text only for the editable extensions", "dev: a script writes a new .py",
    ["@post"], ["if (buf.length <= 5 * 1024 * 1024 && !buf.includes(0)) text = buf.toString('utf8');", "if (guard.isTextFile(guard.norm(p))) text = buf.toString('utf8');"]],
  ["P16 a private key block is not warned about", "a private key block",
    ["@post"], ["-----BEGIN [A-Z ]*PRIVATE KEY-----|", ""]],
  ["P17 a MultiEdit is not read", "a key in a MultiEdit",
    ["@post"], ["if (tool === 'MultiEdit') return", "if (false) return"]],
  ["P18 a NotebookEdit is not read", "a key in a NotebookEdit",
    ["@post"], ["if (tool === 'NotebookEdit') return", "if (false) return"]],
  ["C5 the shell's folder is taken as written (a junction into a company folder is outside)", "campaign: a command run in a junction that leads into a company folder",
    ["const inFolder = isProtected(norm(cwd || '')) || (!!cwd && isProtected(norm(realLocation(cwd, process.cwd()))));", "const inFolder = isProtected(norm(cwd || ''));"]],
  ["P4 the displaced version is not kept", "the report names where the displaced version is kept",
    ["@post"], ["      if (!keepDisplaced(e.path, recovery)) {", "      if (false) {"]],
  ["P5 a version that could not be kept is put back anyway", "the report says it was not put back",
    ["@post"], ["      if (!keepDisplaced(e.path, recovery)) {", "      if (!keepDisplaced(e.path, recovery) && false) {"]],
  ["P6 off still checks and warns", "off: Riaan gets nothing",
    ["@post"], ["  if (id.mode === 'off') return { code: 0, stdout: '', stderr: '' };\n", ""]],
  ["P7 a failed call warns", "a failed call never warns",
    ["@post"], ["const warning = failed ? null : warningFor(event, id.mode);", "const warning = warningFor(event, id.mode);"]],
  ["P8 campaign mode warns about every write", "campaign: a scratch file is not checked",
    ["@post"], ["if (mode === 'campaign' && !guard.isProtected(", "if (false && !guard.isProtected("]],
  ["P9 any 13-19 digit run warns (no Luhn)", "a number that fails Luhn",
    ["@post"], ["digits.length <= 19 && luhn(digits)", "digits.length <= 19"]],
  // Not a control: post.js main returning before it parses is EQUIVALENT to run() returning at
  // once for off (P6), so no output can tell them apart.
];

// The table must still carry its backslashes (Dev Rule #30): F6 looks for a literal backslash-s.
if (!M.find((m) => m[0].startsWith("F6"))[2][0].includes(String.fromCharCode(92) + "s")) throw new Error("backslashes lost in the mutation table");

let bad = 0;
try {
  for (const [name, expect, ...rest] of M) {
    const isPost = rest[0] && rest[0][0] === "@post";
    const edits = isPost ? rest.slice(1) : rest;
    let text = isPost ? originalPost : original;
    let applied = true;
    for (const [find, replace, all] of edits) {
      const n = text.split(find).length - 1;
      if (all ? n < 1 : n !== 1) { applied = false; console.log(`${name}: NOT-APPLIED (${n} matches for ${JSON.stringify(find.slice(0, 60))})`); break; }
      text = all ? text.split(find).join(replace) : text.replace(find, () => replace);
    }
    if (!applied) { bad++; continue; }
    writeFileSync(COPY, isPost ? original : text);
    if (isPost) writeFileSync(POST_COPY, text);
    const env = { ...process.env, GUARD_PATH: COPY };
    if (isPost) env.POST_PATH = POST_COPY;
    const r = spawnSync(process.execPath, [join("hooks", "guard.test.js")], { cwd: PLUGIN, encoding: "utf8", env, timeout: 300000 });
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
