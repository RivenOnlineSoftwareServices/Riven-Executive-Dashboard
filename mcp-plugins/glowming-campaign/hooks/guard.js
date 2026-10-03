#!/usr/bin/env node
/**
 * glowming-campaign guard: a PreToolUse hook that checks every file write, shell
 * command and connector call against an ALLOW-LIST, using the files as they are
 * on disk. Riaan's ruling 2026-10-01: Anton may edit captions, the posting
 * calendar, plans and approvals and his own files, through a narrow path, and
 * nothing may break.
 *
 * Exit 0 = allow. Exit 2 = block (the stderr text is shown to Claude, which tells
 * Anton in plain words). Zero dependencies (Node 18+, already needed by the pulse
 * and collective plugins).
 *
 * The allow-list, inside the company folders:
 *   shared project folder  _Riven-Claude/Glowming Summer Campaign/
 *     anton.md             append only (existing text must stay exactly as it is)
 *     todo-anton.md        items added or ticked; tracking links never change
 *     work/anton/...       new files; existing plain-text files may change (tracking
 *                          links kept); any other existing file is never overwritten
 *   campaign folder        Marketing/2026 Summer Campaign/
 *     01 Ready to post/.../caption.txt   only if the title, LINK and tracking lines
 *                          and the last line stay identical, and Approval status
 *                          only ever becomes "Changed (Anton, <D Mon YYYY>)"
 *     01 Ready to post/...  any other file: NEW files only
 *     02 Posting calendar.xlsx           saved only by a script (openpyxl); never
 *                          written, deleted, moved or renamed by a file tool or shell
 *     05 Plans and approvals/...         NEW files only
 * Everything else inside the company folders is read-only. Files outside them
 * (temporary working files) are allowed.
 *
 * A developer's checkout (devCheckout: the session was LAUNCHED inside a git working tree under the
 * owner's code folder, <home drive>\repos, that is neither a company folder nor a
 * campaign repository, and the shell is still inside it): the blanket
 * shell rules (no web requests, no hidden code, no deep or very large script chains, no claim text
 * in shell writes) step aside there; everything that protects the company files still applies.
 *
 * Known limits (stated in the README): a script that builds company paths at run
 * time with no folder name in its text; a Python module run with -m; in a
 * developer's checkout, nothing stops a web request (adverts, the shop, email), and a
 * company file can be reached unseen through a script more than three levels down or
 * over 500 KB, or through hidden code, when the command names no company folder;
 * a campaign repository that neither its name, its remote nor a .glowming-campaign
 * marker identifies counts as a developer's checkout; anything if Cowork does not run
 * plugin hooks at all (the skills' own rules then apply, and the campaign skill runs
 * a canary to find out).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NL = String.fromCharCode(10);
const SHARED = '_riven-claude/glowming summer campaign/';
const CAMPAIGN = 'marketing/2026 summer campaign/';
// Any path containing one of these is inside a synced company folder. Bare "onedrive" is
// deliberately NOT here: with Known Folder Move, Documents and Desktop live under OneDrive,
// and scratch files there must stay writable (Kimi, 2026-10-01).
const PROTECTED_MARKERS = [
  'riven online software services',
  'titan international',
  '_riven-claude',
  '2026 summer campaign',
  'gsa all assets',
  'sa operations',
];
// Existing files in work/anton/ may change only if they are plain text; anything else gets a new version.
const EDITABLE_TEXT = /\.(md|txt|csv|json|html?)$/i;
const CALENDAR = '02 posting calendar.xlsx';

/**
 * The real absolute location of a path: '~' expanded, relative paths against the
 * session folder, '..' resolved, and the nearest existing folder's links followed,
 * so 'work/anton/../../riaan.md' is judged as riaan.md.
 */
function realLocation(p, cwd) {
  let s = String(p || '');
  if (s === '~' || s.startsWith('~/') || s.startsWith('~' + path.sep)) s = path.join(os.homedir(), s.slice(1));
  let abs = path.resolve(cwd || process.cwd(), s);
  let probe = abs;
  const tail = [];
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return abs;
    tail.unshift(path.basename(probe));
    probe = parent;
  }
  try { abs = path.join(fs.realpathSync(probe), ...tail); } catch (e) { /* keep the resolved path */ }
  return abs;
}

/** Lower-case, forward slashes, collapsed doubles: the form every check uses. */
function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function isProtected(np) {
  return PROTECTED_MARKERS.some((m) => np.includes(m));
}

/** The part of the path after a folder marker, or null. */
function after(np, marker) {
  const i = np.indexOf(marker);
  return i < 0 ? null : np.slice(i + marker.length);
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function unify(s) {
  return String(s).split(String.fromCharCode(13) + NL).join(NL);
}

/** The new file text a Write / Edit / MultiEdit would produce, or null if it cannot be worked out. */
function resultingText(tool, input, current) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null;
  const edits = tool === 'MultiEdit' ? input.edits : tool === 'Edit' ? [input] : null;
  if (!Array.isArray(edits) || current === null) return null;
  let text = unify(current);
  for (const e of edits) {
    const oldS = unify(e.old_string || '');
    const newS = unify(e.new_string || '');
    if (!oldS || !text.includes(oldS)) return null;
    text = e.replace_all ? text.split(oldS).join(newS) : text.replace(oldS, () => newS);
  }
  return text;
}

/** Lines of a caption.txt that must never change: title, rule, LINK block, tracking links, last line. */
function lockedCaptionLines(text) {
  const lines = unify(text).split(NL);
  const locked = [];
  lines.forEach((l, i) => {
    if (i < 2 || /^LINK\b/.test(l) || /utm_|https?:\/\//i.test(l)) locked.push(l);
  });
  const last = lines.filter((l) => l.trim()).pop();
  if (last !== undefined) locked.push('LAST:' + last);
  return locked.join(NL);
}

function approvalLine(text) {
  return (unify(text).split(NL).find((l) => /^Approval status:/.test(l)) || '').trim();
}

/** Tracking links may be added, never altered or removed. Null = fine, else a reason. */
function keepsTracking(tool, input, current) {
  const next = resultingText(tool, input, current);
  if (next === null) return 'This change could not be checked against the tracking links. Re-read the file and try a smaller change.';
  // Every line that carries a link must survive, the only allowed change being a ticked box or an
  // added "(done <date>)". Comparing whole lines (as a multiset) means a link cannot be altered while a
  // copy of the old one is kept somewhere else, and a duplicate cannot quietly disappear (Codex r6).
  const shape = (l) => l.replace(/^(\s*)- \[[ xX]\]/, '$1- [ ]').replace(/\s*\(done \d{4}-\d{2}-\d{2}\)\s*$/, '').trimEnd();
  const linkLines = (t) => unify(t).split(NL).filter((l) => /utm_/i.test(l)).map(shape);
  const pool = new Map();
  for (const l of linkLines(next)) pool.set(l, (pool.get(l) || 0) + 1);
  for (const l of linkLines(current)) {
    if (!pool.get(l)) return 'Existing tracking links (utm_) never change. Leave those lines exactly as they are.';
    pool.set(l, pool.get(l) - 1);
  }
  return null;
}

const UNREADABLE = 'That file exists but could not be read (OneDrive may still be downloading it), so the change cannot be checked. Open the folder in File Explorer, wait for the green tick, and try again.';

/** Decide one file write. Returns null to allow, or a plain-English reason to block. */
function checkWrite(tool, input, cwd, before) {
  const given = input.file_path || input.notebook_path || '';
  if (!given) return null;
  const raw = realLocation(given, cwd);
  const np = norm(raw);
  if (!isProtected(np)) return null; // a temporary working file outside the company folders
  // A company file never GAINS a banned claim (owner rulings 2026-10-01). The RESULTING text is
  // judged, not the edit fragment: replacing "tx" with "tox" in "detx" makes "detox" (Codex r9).
  {
    const curNow = before ? before.current : (fs.existsSync(raw) ? readText(raw) : null);
    const after = resultingText(tool, input, curNow);
    const fragment = tool === 'Write' ? input.content
      : tool === 'MultiEdit' ? (input.edits || []).map((e) => e.new_string || '').join(NL)
        : (input.new_string || input.new_source || '');
    const gained = (t) => {
      if (typeof t !== 'string') return false;
      const was = curNow ? (unify(curNow).match(new RegExp(BANNED_CLAIMS.source, 'gi')) || []).length : 0;
      return (unify(t).match(new RegExp(BANNED_CLAIMS.source, 'gi')) || []).length > was;
    };
    if (gained(after) || (after === null && typeof fragment === 'string' && BANNED_CLAIMS.test(fragment))) {
      return 'That text contains a weight-loss, slimming, detox, appetite, craving, cure or "clinically proven" claim, which is never allowed. Remove it.';
    }
  }
  // `before` lets post.js judge a change a shell command already made, against the copy taken first.
  const exists = before ? before.exists : fs.existsSync(raw);
  const current = before ? before.current : (exists ? readText(raw) : null);

  const shared = after(np, SHARED);
  if (shared !== null) {
    if (shared === 'anton.md') {
      if (!exists) return null;
      if (current === null) return UNREADABLE;
      const next = resultingText(tool, input, current);
      if (next === null) return 'anton.md is append-only and this change could not be checked. Add the new lines at the end instead.';
      return unify(next).startsWith(unify(current)) ? null
        : 'anton.md is append-only: earlier lines may not change. Add the new lines at the end instead.';
    }
    if (shared === 'todo-anton.md') {
      if (!exists) return null;
      return current === null ? UNREADABLE : keepsTracking(tool, input, current);
    }
    if (shared.startsWith('work/anton/')) {
      if (!exists) return null;
      if (!EDITABLE_TEXT.test(np)) return 'That file already exists. Save the new one under a new name (next version number) instead.';
      return current === null ? UNREADABLE : keepsTracking(tool, input, current);
    }
    return 'Only anton.md, todo-anton.md and work/anton/ may be changed in the shared project folder. To change anything else, ask Riaan\'s side in anton.md under ## Questions.';
  }

  const camp = after(np, CAMPAIGN);
  if (camp !== null) {
    if (camp.startsWith('01 ready to post/')) {
      if (/\/caption\.txt$/.test(camp)) {
        if (!exists) return 'A new caption.txt needs a tracking code from Riaan\'s side. Ask in anton.md under ## Questions.';
        if (current === null) return UNREADABLE;
        const next = resultingText(tool, input, current);
        if (next === null) return 'This caption change could not be checked. Re-read caption.txt and change only the post text, Headline, Short line, Button or Approval status.';
        if (lockedCaptionLines(next) !== lockedCaptionLines(current)) {
          return 'The title, the LINK lines, the tracking links and the last line of caption.txt never change. Change only the post text, Headline, Short line, Button or Approval status.';
        }
        const was = approvalLine(current);
        const now = approvalLine(next);
        if (now !== was && !/^Approval status:\s*Changed \(Anton, \d{1,2} [A-Z][a-z]{2} \d{4}\)$/.test(now)) {
          return 'Approval status may only become "Changed (Anton, <D Mon YYYY>)". Approving is Anton\'s word, recorded in anton.md.';
        }
        return null;
      }
      return exists ? 'That file already exists in Ready to post. Save it as a NEW file with the next version number instead.' : null;
    }
    if (camp === CALENDAR) return 'The posting calendar is changed cell by cell through the campaign skill\'s calendar steps, never replaced as a whole file.';
    if (camp.startsWith('05 plans and approvals/')) {
      return exists ? 'Files in Plans and approvals are never replaced. Save it as a new file ("<name> v2") instead.' : null;
    }
    return 'That campaign folder is read-only from here. Ask Riaan\'s side in anton.md under ## Questions.';
  }

  return 'That folder is outside the campaign files this Claude may change. Ask Riaan\'s side in anton.md under ## Questions.';
}

// Deleting, moving or renaming: never in a company folder, the posting calendar included.
const REMOVE_SHELL = /(^|[\s;&|(])(rm|del|erase|rmdir|rd|mv|move|ren|rename|unlink|shred|truncate)(\s|$)|remove-item|move-item|rename-item|clear-content|robocopy|xcopy|rsync|shutil\.(rmtree|move)|os\.(remove|unlink|rename|replace|rmdir)|\.unlink\(|\.rename\(|\.rmdir\(|\b(rmsync|unlinksync|rmdirsync|renamesync)\b|\bfs\.(rm|unlink|rmdir|rename)\b|\bfs\.promises\.(rm|unlink|rmdir|rename)\b|git\s+(clean|checkout|reset|rm|mv)/i;
// Writing file contents from code (command text AND the scripts it runs).
const CODE_WRITE = /set-content|add-content|out-file|copy-item|open\([^)]*['"][wax]b?\+?['"]|write_(text|bytes)\(|\.save\(|\.to_(csv|excel)\(|writefile|appendfile|copyfile|createwritestream|\bfs\.(write|append|copy|cp)\w*|\btee\b|\bsed\s+-i|\bperl\s+-\w*i|\bdd\s+[^|;]*of=|\binstall\s|\bpatch\s|\bcp\s|\bcopy\s/i;
// Any web request from the shell or a script. Anton never needs one (connectors and web reading
// cover him), and every way of changing adverts, the shop or sending email would go through one,
// so the whole class is refused rather than guessing which methods write (Codex round 5).
const NET_CALL = /\b(curl|wget|iwr|irm|invoke-restmethod|invoke-webrequest)\b|\b(requests|httpx|aiohttp|urllib3?)\b|urlopen|http\.client|\bfetch\s*\(|\bwebsocket|\baxios\b|xmlhttprequest|\bsmtplib\b|\bsendmail\b|send_mail\(|net\.webclient|\bsocket\.|require\(\s*['"](node:)?(https?|http2|net|tls|dgram)['"]\s*\)|from\s+['"](node:)?(https?|http2|net|tls|dgram)['"]|\bhttps?\.(request|get)\(|graph\.facebook\.com|graph\.microsoft\.com|myshopify\.com|api\.resend\.com|api\.sendgrid\.com/i;
// Claims that are never allowed in anything this Claude writes or generates (owner rulings, 2026-10-01).
const BANNED_CLAIMS = /weight[\s-]?(loss|control|management)|\bslimming|\bslim\s+down|fat[\s-]?(loss|burn)|(lose|losing|burn|burns|burning|melt)\s+(the\s+)?(fat|kg|kilos?|weight)|belly\s+fat|\d+\s*kg\b|\bdetox|appetite|craving|\bmetaboli|\bcures?\b|\bheals?\b|clinically\s+proven/i;
// Shell scripts are judged for redirects too (Python and JS are not: ">" there is not a redirect).
const SHELL_SCRIPT = /\.(sh|bash|ps1|psm1|bat|cmd)$/i;
// Shell redirection into a file: > >> 2> 2>> &> &>>, but not 2>&1. Judged on the COMMAND only
// (scripts contain arrows and comparisons that are not redirects).
const REDIRECT = /(^|[^=\-<>])(&|\d)?>{1,2}(?![&>=])/;
// Code that hides what it runs: blocked everywhere, Anton never needs it. Every `eval(` counts. A
// bare `exec(` counts, and so does one reached through the builtins or the global object; a member
// call on a name of its own (a regex's `pattern.exec(text)`) runs no code. Decoding a payload
// (atob, a Buffer from base64, a new Function) counts too, whatever then runs it (Claude review
// 2026-10-03).
const HIDDEN_CODE = /-e(nc|ncodedcommand)?\s+[a-z0-9+/=]{16,}|-encodedcommand|frombase64string|base64\s+(-d|--decode)|b64decode|\beval\(|(?<![.\w$])exec\(|\b(?:builtins|__builtins__|globalThis|window|self|global)\s*\.\s*exec\(|\batob\(|\bfrom\s*\([^)]*,\s*['"]base64(?:url)?['"]|\bnew\s+Function\s*\(|\biex\b|invoke-expression|(^|[\s;&|])(python3?|py|node|ruby|perl)\s+-(\s|$)|(^|[\s;&|])(python3?|py|node)\s*<|\b(bash|sh|zsh)\s+-s\b|-command\s+-(\s|$)|(^|[\s;&|(])(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)(\.exe)?\s*<|\|\s*(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd|python3?|py|node|ruby|perl|php)(\.exe)?(\s|$)/i;
// A TypeScript type-only import or re-export (`import type { IncomingMessage } from "node:http"`) is
// erased before the code runs: it names a module's types and makes no request, so NET_CALL ignores it
// in a TypeScript script's text (never in the command). The braces hold names and commas only, so the
// pattern can never swallow a command or a call (Claude review 2026-10-03).
const TYPE_ONLY_IMPORT = /\b(?:import|export)\s+type\s+(?:\{[\s\w$,]*\}\s*|\*\s+as\s+[\w$]+\s+|[\w$]+\s+)from\s*(['"])[^'"\s]+\1/g;
const TS_SCRIPT = /\.(ts|mts|cts|tsx)$/i;
const SCRIPT_FILE = /(?:"([^"]+\.(?:py|js|mjs|cjs|jsx|ts|mts|cts|tsx|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))"|'([^']+\.(?:py|js|mjs|cjs|jsx|ts|mts|cts|tsx|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))'|([^\s'"]+\.(?:py|js|mjs|cjs|jsx|ts|mts|cts|tsx|ps1|psm1|sh|bash|bat|cmd|pl|rb|php)))(?=$|[\s;&|)\],}])/gi;

/**
 * The text of every script file a command runs, and of every script THOSE scripts name (three
 * levels deep, Codex round 8), so a script is judged by what it does. A script named deeper than
 * that counts as unreadable.
 */
function scriptsRun(cmd, cwd) {
  let text = '';
  let netText = ''; // the same, with a TypeScript script's type-only imports taken out (for NET_CALL)
  let shellText = '';
  let unreadable = 0;
  let tooDeep = 0; // scripts the guard cannot fully read: more than three levels down, or over 500 KB
  const seen = new Set();
  let frontier = [cmd];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next = [];
    for (const src of frontier) {
      const re = new RegExp(SCRIPT_FILE.source, 'gi');
      let m;
      while ((m = re.exec(src)) !== null) {
        const file = m[1] || m[2] || m[3];
        const where = realLocation(file, cwd);
        if (seen.has(where)) continue;
        seen.add(where);
        if (depth === 3) { tooDeep++; continue; }
        const body = readText(where);
        if (body === null) { unreadable++; continue; }
        if (body.length > 500000) { tooDeep++; continue; }
        const part = body;
        text += NL + part;
        netText += NL + (TS_SCRIPT.test(file) ? part.replace(TYPE_ONLY_IMPORT, '') : part);
        if (SHELL_SCRIPT.test(file)) shellText += NL + part;
        next.push(part);
      }
    }
    frontier = next;
  }
  return { text, netText, shellText, unreadable, tooDeep };
}

// Campaign work: a repository whose path, main repository's path or remote says so, or one that
// carries the marker file at its root (for a campaign repository named otherwise).
const CAMPAIGN_REPO = /campaign/i;
const CAMPAIGN_REMOTE = /^\s*url\s*=.*campaign/im;
const CAMPAIGN_MARKER = '.glowming-campaign';

/**
 * The folder that holds the owner's code repositories: `<home drive>\repos` (C:\repos on the owner's
 * machine), fixed in this file. Nothing a session can write moves it: not an environment variable
 * (`setx` would carry one into the next session), not a file. With the launch folder fixed too, no
 * `git init` or `.git` written during a session (in the launch folder, above it or elsewhere) can
 * make a folder outside it count (Claude review 2026-10-03). Anton launches in the synced folders,
 * never there. It must be a real folder, never a link or junction (a junction made during a session
 * at an absent C:\repos would otherwise lead it anywhere), and it is compared as written, never
 * through links. `testRoots` is set only by the tests, in their own process.
 */
let testRoots = null;
function devRoots() {
  return (testRoots || [path.join(path.parse(os.homedir()).root, 'repos')]).filter((r) => {
    try { const st = fs.lstatSync(r); return st.isDirectory() && !st.isSymbolicLink(); } catch (e) { return false; }
  }).map((r) => norm(path.resolve(r)).replace(/\/?$/, '/'));
}

/** Whether `dir` is inside one of the dev roots (never the dev root itself). */
function underDevRoot(dir) {
  const d = norm(dir).replace(/\/?$/, '/');
  return devRoots().some((r) => d.startsWith(r) && d !== r);
}

/** The nearest folder at or above `dir` that holds a .git (a folder, or a linked worktree's file), or null. */
function checkoutRoot(dir) {
  let d = dir;
  for (let i = 0; i < 64; i++) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
  return null;
}

/**
 * Whether the git checkout at `root` is a developer's code repository: not a company folder, not a
 * campaign repository, and readable as git. A linked worktree is judged by the repository it belongs
 * to, wherever it lives. Anything that cannot be read as git fails closed (not a developer's checkout).
 */
function devRepository(root) {
  if (isProtected(norm(root)) || CAMPAIGN_REPO.test(norm(root)) || fs.existsSync(path.join(root, CAMPAIGN_MARKER))) return false;
  const dotGit = path.join(root, '.git');
  let gitDir = dotGit;
  let st = null;
  try { st = fs.statSync(dotGit); } catch (e) { return false; }
  if (st.isFile()) {
    // A linked worktree: "gitdir: <main>/.git/worktrees/<name>", whose commondir names the main .git.
    const link = /^gitdir:\s*(.+?)\s*$/m.exec(readText(dotGit) || '');
    if (!link) return false;
    gitDir = path.resolve(root, link[1]);
    const common = readText(path.join(gitDir, 'commondir'));
    if (common === null) return false;
    gitDir = path.resolve(gitDir, common.trim());
  } else if (!st.isDirectory()) {
    return false;
  }
  gitDir = realLocation(gitDir, root);
  const mainRoot = path.dirname(gitDir);
  if (isProtected(norm(gitDir)) || CAMPAIGN_REPO.test(norm(gitDir)) || fs.existsSync(path.join(mainRoot, CAMPAIGN_MARKER))) return false;
  const config = readText(path.join(gitDir, 'config'));
  return config !== null && !CAMPAIGN_REMOTE.test(config);
}

/**
 * Whether the session works in a developer's checkout. Decided from the folder the session was
 * launched in (CLAUDE_PROJECT_DIR, set by Claude Code and fixed for the session; the hook's `cwd`
 * follows every `cd`, so it alone could be steered into a fresh `git init`): that folder must be
 * under a dev root (devRoots), inside a developer's code repository (devRepository; never a checkout
 * at the home folder or a drive root), and the shell must still be inside that same checkout. There the blanket shell rules
 * below step aside: a code repository legitimately starts servers, makes local requests, and runs
 * test and build scripts that use eval/exec and chain many files (measured 2026-10-03: they refused
 * routine gates in a ROSS Suite session). The company files stay protected everywhere: file tools,
 * connectors, deletes and the copy that post.js checks do not depend on this. Owners working the
 * campaign launch in the synced company folders or the campaign repository, neither of which
 * counts (Riaan, 2026-10-03: "make it work like we need it to without relying on me").
 */
function devCheckout(cwd) {
  const launched = process.env.CLAUDE_PROJECT_DIR;
  if (!launched) return false; // without the launch folder, nothing shows the session is a code repository's
  const project = realLocation(launched, process.cwd());
  // Under the code folder both as written and as resolved: a junction at either end leads nowhere.
  if (isProtected(norm(project)) || !underDevRoot(path.resolve(launched)) || !underDevRoot(project)) return false;
  const root = checkoutRoot(project);
  if (!root || !underDevRoot(root) || path.dirname(root) === root || norm(root) === norm(realLocation(os.homedir(), process.cwd()))) return false;
  if (!devRepository(root)) return false;
  const where = realLocation(cwd || launched, process.cwd());
  if (isProtected(norm(where))) return false;
  return (norm(where) + '/').startsWith(norm(root).replace(/\/?$/, '/'));
}

/** Decide one shell command, including the scripts it runs. */
function checkBash(input, cwd, callId) {
  const cmd = String(input.command || '');
  // In a developer's checkout only the company-folder protection applies (devCheckout).
  const dev = devCheckout(cwd);
  if (!dev && HIDDEN_CODE.test(cmd)) {
    return 'Commands that hide or stream the code they run (encoded, eval/exec, stdin) are not allowed from this Claude. Write the script to a file first so it can be checked.';
  }
  const scripts = scriptsRun(cmd, cwd);
  if (!dev && scripts.tooDeep > 0) {
    return 'That chain of scripts is too deep or too large to check (more than three levels, or a script over 500 KB). Run the script directly.';
  }
  const full = cmd + scripts.text;
  // Paths that only RESOLVE into a company folder (a symlink, "../..") count as naming it (Codex r9).
  const named = foldersNamed(full, cwd, false);
  const nfull = norm(full) + (named.length ? NL + named.map(norm).join(NL) : '');
  const inFolder = isProtected(norm(cwd || ''));
  // Anywhere, not only near company folders: hidden code could make a web request or reach a
  // company file the guard never sees (Codex round 7).
  if (!dev && HIDDEN_CODE.test(scripts.text)) {
    return 'That script hides or streams the code it runs (eval/exec/encoded/stdin), so it cannot be checked. Write the code itself into the script.';
  }
  if ((isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full)) {
    return 'Deleting, moving or renaming files in the company folders is not allowed, the posting calendar included.';
  }
  // Throwing output away (2>/dev/null, >nul) writes no company file.
  const discard = /(&|\d)?>{1,2}\s*(\/dev\/null|nul)\b/gi;
  const cmdNoDiscard = cmd.replace(discard, '');
  const shellNoDiscard = scripts.shellText.replace(discard, '');
  const redirects = REDIRECT.test(cmdNoDiscard) || REDIRECT.test(shellNoDiscard);
  if (!dev && NET_CALL.test(cmd + scripts.netText)) {
    return 'Web requests from the shell or a script are not allowed from this Claude (adverts, the shop and email are never changed this way). Use a connector to read, or ask Riaan\'s side.';
  }
  // In a developer's checkout, claims are judged where they land: a company file (checkWrite, and
  // post.js after a shell command), not in code and fixtures that name the banned words.
  if (!dev && (redirects || CODE_WRITE.test(full)) && BANNED_CLAIMS.test(full)) {
    return 'That text contains a weight-loss, slimming, detox, appetite, craving, cure or "clinically proven" claim, which is never allowed. Remove it.';
  }
  if (inFolder && scripts.unreadable > 0) {
    return 'A script was started from a company folder but could not be read, so it was blocked to be safe.';
  }
  // Writes are not guessed from the text (there is always one more way to write a file).
  // Instead every company folder the command names, and the folder it runs in, is copied
  // now; post.js compares afterwards and puts back or removes whatever the rules forbid.
  // A plain read (ls, cat, grep ... with no redirect and no script) needs no copy.
  if (!(isProtected(nfull) || inFolder)) return null;
  if (!scripts.text && !redirects && isReadOnly(cmdNoDiscard)) return null;
  return snapshotFolders(full, cwd, inFolder, callId);
}

// Commands that only read. Every part of a pipeline or chain must be one of these.
const READ_ONLY_PART = /^\s*(ls|dir|cat|type|head|tail|less|more|grep|egrep|rg|findstr|wc|stat|file|du|pwd|echo|printf|cut|tr|basename|dirname|realpath|readlink|test|true|get-childitem|gci|get-content|gc|select-string|test-path|get-item|measure-object|select-object|format-list|format-table|find(?![^|;&]*-(delete|exec|execdir|ok|fprint)))(\s|$)/i;
function isReadOnly(cmd) {
  const parts = cmd.split(/&&|\|\||[;|\n]/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => READ_ONLY_PART.test(p));
}

/** Every company folder a command or its scripts name (plus the folder it runs in). */
function foldersNamed(full, cwd, inFolder) {
  const dirs = new Set();
  if (inFolder) dirs.add(path.resolve(cwd));
  // Candidates: every piece between quotes and line breaks, and every whitespace token. A path
  // inside a quoted one-liner (python -c "open(r'...')") is its own piece once split on quotes.
  const pieces = new Set();
  for (const seg of full.split(/["'\n\r`]/)) {
    pieces.add(seg.trim());
    for (const t of seg.split(/[\s<>|;&(),]+/)) pieces.add(t);
  }
  for (const piece of pieces) {
    if (!piece) continue;
    // A relative path is judged by where it LEADS from the session folder ("../../riaan.md"),
    // not by whether its own text names a company folder (Codex round 8).
    const looksLikePath = /[\\/]/.test(piece) || /^\.\.?$/.test(piece) || /\.[a-z0-9]{1,5}$/i.test(piece);
    if (!isProtected(norm(piece)) && !(looksLikePath && piece.length < 1024 && isProtected(norm(realLocation(piece, cwd))))) continue;
    // Walk up from the named path to the nearest folder that exists: a file's folder, a glob's
    // folder, or the folder of a path followed by code.
    let p = realLocation(piece, cwd);
    let st = null;
    for (let i = 0; i < 40; i++) {
      try { st = fs.statSync(p); break; } catch (e) { st = null; }
      const parent = path.dirname(p);
      if (parent === p) break;
      p = parent;
    }
    if (!st) continue;
    if (!st.isDirectory()) p = path.dirname(p);
    if (isProtected(norm(p))) dirs.add(p);
  }
  return [...dirs];
}

const SNAP_LIMIT_BYTES = 400 * 1024 * 1024;
const SNAP_LIMIT_FILES = 5000;

/** Every file under a folder, at any depth. */
function walkFiles(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

/** The snapshot file names for one tool call (its id from the hook input, else a random one). */
function snapId(callId) {
  const clean = String(callId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return clean || crypto.randomBytes(8).toString('hex');
}

/**
 * Copy every file under every named company folder (all depths), for post.js to compare after
 * THIS tool call. Null = ok, else a reason to block.
 */
function snapshotFolders(full, cwd, inFolder, callId) {
  let dirs = foldersNamed(full, cwd, inFolder);
  if (!dirs.length) return null;
  // A folder inside another named folder is already covered by it.
  dirs = dirs.filter((d) => !dirs.some((o) => o !== d && norm(d).startsWith(norm(o).replace(/\/?$/, '/'))));
  const id = snapId(callId);
  const backupDir = path.join(os.tmpdir(), 'glowming-snap-' + id + '.d');
  const manifest = { cwd: path.resolve(cwd || process.cwd()), backupDir, created: Date.now(), dirs: [] };
  let total = 0;
  let n = 0;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const dir of dirs) {
      const entry = { dir, files: [] };
      for (const p of walkFiles(dir, [])) {
        const size = fs.statSync(p).size;
        total += size;
        if (total > SNAP_LIMIT_BYTES || n >= SNAP_LIMIT_FILES) {
          throw new Error('too much to protect at once (over 400 MB or 5000 files); run it from the advert\'s own folder');
        }
        const buf = fs.readFileSync(p);
        const backup = path.join(backupDir, String(n++));
        fs.writeFileSync(backup, buf);
        entry.files.push({ path: p, sha1: sha1(buf), backup });
      }
      manifest.dirs.push(entry);
    }
    fs.writeFileSync(path.join(os.tmpdir(), 'glowming-snap-' + id + '.json'), JSON.stringify(manifest));
  } catch (e) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    return 'The company files this command touches could not be copied first (' + e.message + '), so it was blocked. Check OneDrive has finished syncing.';
  }
  return null;
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function isTextFile(np) {
  return EDITABLE_TEXT.test(np) || /\/caption\.txt$/.test(np);
}

/** May a NEW file appear at p? Null = yes, else the reason (the same rules as the file tools). */
function checkNewFile(p, cwd) {
  return checkWrite('Write', { file_path: p, content: '' }, cwd, { exists: false, current: null });
}

// Servers whose actions change nothing in Glowming's own systems (owner ruling: Anton renders on Magnific).
const SAFE_SERVERS = /^(magnific|pulse|collective)|[_-](magnific|pulse|collective)($|[_-])/;
const READ_ACTION = /(^|_)(get|list|search|read|fetch|retrieve|download|query|insights?|describe|show|find|view|status|stats|lookup|preview|count|check)($|_)|_info$/;

/** Every string value in a connector call, for spotting company paths in its arguments. */
function stringsIn(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) stringsIn(v[k], out);
  return out;
}

/** Decide one connector (MCP) call. */
function checkMcp(tool, input, cwd) {
  // mcp__<server>__<action>: the server says WHOSE system it is, the action says what it does.
  const parts = tool.toLowerCase().split('__');
  const server = parts.length > 2 ? parts.slice(1, -1).join('__') : '';
  const act = parts[parts.length - 1];
  if (/(delete|trash|remove|move|rename|purge|empty)/.test(act)) {
    return 'Deleting, moving or renaming through a connector is not allowed from this Claude. Ask Riaan\'s side if something must go.';
  }
  const strings = stringsIn(input, []);
  if (!READ_ACTION.test(act) && BANNED_CLAIMS.test(strings.join(NL))) {
    return 'That request contains a weight-loss, detox, appetite, cure or "clinically proven" claim, which is never allowed. Remove it.';
  }
  if (SAFE_SERVERS.test(server)) return null;
  // A generic Graph caller names no verb: only an explicit GET is a read.
  if (/lokka|graph/.test(server) || /lokka/.test(act)) {
    return String((input && input.method) || '').toLowerCase() === 'get' ? null
      : 'Only reading from Microsoft 365 is allowed from this Claude (could not confirm this call is a read).';
  }
  if (READ_ACTION.test(act)) return null;
  if (/draft/.test(act) && !/send/.test(act)) return null;
  const company = /(sharepoint|onedrive|outlook|mail|gmail|teams|calendar|microsoft|m365|meta|facebook|instagram|shopify|ads?($|[_-]))/.test(server + ' ' + act);
  if (company) {
    if (/(send|forward|reply|respond)/.test(act)) return 'This Claude writes emails and messages as drafts only; Anton presses Send himself.';
    return 'Changing files, adverts, the shop or settings through a connector is not allowed from this Claude. Use the checked steps, or ask Riaan\'s side.';
  }
  // Any other server: a non-read call whose arguments name a company folder, or a path that
  // RESOLVES into one from the session folder, is judged like a file write and refused.
  const looksLikePath = (s) => /[\\/]/.test(s) || /\.[a-z0-9]{1,5}$/i.test(s);
  if (strings.some((s) => isProtected(norm(s)) || (looksLikePath(s) && s.length < 1024 && isProtected(norm(realLocation(s, cwd)))))) {
    return 'That connector call would touch the company folders. Use the campaign skill\'s checked steps instead.';
  }
  return null;
}

function decide(event) {
  const tool = String(event.tool_name || '');
  const input = event.tool_input || {};
  const cwd = event.cwd || process.cwd();
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return checkWrite(tool, input, cwd);
  if (tool.startsWith('mcp__')) return checkMcp(tool, input, cwd);
  if (typeof input.command === 'string') return checkBash(input, cwd, event.tool_use_id);
  return null;
}

/** Tests only (their own process): stand in for the owner's code folder. */
function setDevRootsForTests(roots) { testRoots = roots; }

module.exports = { decide, checkWrite, checkNewFile, isTextFile, norm, sha1, walkFiles, snapId, CALENDAR, BANNED_CLAIMS, setDevRootsForTests };

if (require.main === module) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    let event;
    try { event = JSON.parse(buf || '{}'); } catch (e) {
      process.stderr.write('glowming-campaign guard: could not read the tool call, so it was blocked to be safe.');
      process.exit(2);
    }
    const reason = decide(event);
    if (reason) { process.stderr.write('Blocked by the Glowming campaign guard: ' + reason); process.exit(2); }
    process.exit(0);
  });
}
