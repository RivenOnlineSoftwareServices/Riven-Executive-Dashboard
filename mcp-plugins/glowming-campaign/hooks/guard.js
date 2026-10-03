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
 * A developer's checkout (devCheckout: the session was LAUNCHED strictly inside the owner's code
 * folder, <home drive>\repos, by a path with no link in it that neither says campaign nor names a
 * company folder, and the shell is still inside that launch folder): the blanket
 * shell rules (no web requests, no hidden code, no deep or very large script chains, no claim text
 * in shell writes) step aside there; everything that protects the company files still applies.
 *
 * WHO it guards (operator ruling 2026-10-03: "Anton, Etienne and Louis please", never Riaan; design
 * note docs/glowming-campaign-guard-identity.md): identity() picks one of three modes. OFF for Riaan
 * (his signed-in address from the desktop app or Cowork, else his own account on his own machine):
 * nothing here runs. FULL for any other signed-in address: everything below. CAMPAIGN when no
 * identity can be read: only calls that touch the company folders are judged. A short tamper list
 * (switching the guard off through settings, launch flags or the identity variables) applies in
 * FULL and, in part, in CAMPAIGN. It is an accidental-misuse guard: the tamper list is closed and
 * not claimed complete.
 *
 * Known limits (stated in the README): a script that builds company paths at run
 * time with no folder name in its text; a Python module run with -m; in a
 * developer's checkout, nothing stops a web request (adverts, the shop, email), and a
 * company file can be reached unseen through a script more than three levels down or
 * over 500 KB, or through hidden code, when the command names no company folder;
 * a campaign checkout under the code folder whose path does not say campaign counts as
 * a developer's checkout; anything if Cowork does not run
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
// ---- Who is working (design note, "The rule, in order") -------------------------------------------
// Riaan's addresses. Only these turn the guard OFF; every other address gets the FULL guard.
const OWNER_EMAILS = ['riaan@riven.co.za', 'riaan.venter@riven.co.za'];
// Riaan's provisioned machines: his OS account AND the machine name, as a pair (a user name alone is
// reusable on another machine or image). Machine names compared without ".local", case-insensitive.
const OWNER_MACHINES = [
  { user: 'riaan', host: 'zenbookduo-rv26' }, // Windows, measured 2026-10-03
  { user: 'riaanventer', host: 'riaans-macbook-air' }, // the M1 Air, Borg-Cloud/docs/M1-AIR.md
];
// The launchers that set CLAUDE_CODE_USER_EMAIL from the signed-in account, replacing any inherited
// value: the desktop app's Code tab and Cowork. From any other launcher the address may be inherited.
const APP_ENTRYPOINTS = ['claude-desktop', 'local-agent'];
// The three the ruling names (their known work addresses; their claude.ai sign-in addresses are not
// recorded). Used only to name the person in the identity record; any non-Riaan address is FULL.
const THE_THREE = {
  'anton@riven.global': 'Anton', 'anton@titaninternational.co.za': 'Anton',
  'etienne@riven.global': 'Etienne', 'etienne@glowming.co.za': 'Etienne',
  'louis@glowming.co.za': 'Louis', 'louis@riven.global': 'Louis',
};
let testMachine = null;

/** This machine's OS account and name, or null when either cannot be read (never an error). */
function machine() {
  if (testMachine === false) return null; // tests: the lookup failed
  if (testMachine) return testMachine;
  try {
    return {
      user: String(os.userInfo().username || '').toLowerCase(),
      host: String(os.hostname() || '').toLowerCase().replace(/\.local$/, ''),
    };
  } catch (e) { return null; }
}

/**
 * Which guard applies to this session: { mode: 'off' | 'full' | 'campaign', rule, entrypoint, domain }.
 * 1.1 an app-set address (desktop Code tab, Cowork): Riaan's -> off, any other -> full;
 * 1.2 Riaan's own account on his own machine -> off (beats an address of unknown origin);
 * 1.3 an address from any other launcher: Riaan's -> off, any other -> full;
 * 1.4 nothing usable -> campaign.
 */
function identity() {
  const email = String(process.env.CLAUDE_CODE_USER_EMAIL || '').trim().toLowerCase();
  const entrypoint = String(process.env.CLAUDE_CODE_ENTRYPOINT || '').trim().toLowerCase();
  const domain = email.includes('@') ? email.slice(email.indexOf('@') + 1) : '';
  const byEmail = (rule) => ({ mode: OWNER_EMAILS.includes(email) ? 'off' : 'full', rule, entrypoint, domain, who: OWNER_EMAILS.includes(email) ? 'Riaan' : (THE_THREE[email] || 'other') });
  if (email && APP_ENTRYPOINTS.includes(entrypoint)) return byEmail('1.1');
  const m = machine();
  if (m && OWNER_MACHINES.some((o) => o.user === m.user && o.host === m.host)) return { mode: 'off', rule: '1.2', entrypoint, domain, who: 'Riaan' };
  if (email) return byEmail('1.3');
  return { mode: 'campaign', rule: '1.4', entrypoint, domain, who: 'unknown' };
}

/** One non-secret line per hook run, for checking each surface after install. Best effort, silent. */
function recordIdentity(hook, id) {
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'glowming-guard-identity.json'), JSON.stringify({
      hook, mode: id.mode, rule: id.rule, who: id.who, entrypoint: id.entrypoint, domain: id.domain, time: new Date().toISOString(),
    }) + NL);
  } catch (e) { /* the record is for people checking; it never affects the decision */ }
}

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

// ---- Tamper list (design note, "Tamper rule"): CLOSED, not claimed complete ------------------------
const SETTINGS_ENV_KEYS = ['CLAUDE_CODE_USER_EMAIL', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_SAFE_MODE'];
const TAMPER_NAMES = /claude_code_user_email|claude_code_entrypoint|claude_config_dir|claude_code_simple|claude_code_safe_mode|disableallhooks|enabledplugins/i;
const CLAUDE_LAUNCH_FLAGS = /\bclaude(\.exe)?\b[^\n;&|]*?\s--(settings|setting-sources|plugin-dir|bare|safe-mode)\b/i;
const PLUGIN_OFF = /\bclaude(\.exe)?\s+plugins?\s+(disable|uninstall|remove|rm)\b/i;
// A settings file NAME anywhere in the command text (not resolved: `cd ~/.claude && cp x settings.json`).
const SETTINGS_NAME = /(^|[^\w.-])(settings(\.local)?\.json|\.claude\.json|managed-settings\.json)(?![\w.-])/i;
// A folder called .claude named in the text (a reset of the settings folder).
const CLAUDE_DIR = /(^|[\\/\s"'=])\.claude([\\/\s"']|$)/i;
const SIMPLE_READ = /^\s*(cat|type|head|tail|less|more|get-content|gc|wc|stat|ls|dir|test-path|get-item)(\s|$)/i;

/** One read command and nothing else: no chain, pipe, background, newline, redirect, substitution. */
function singleSimpleRead(cmd) {
  const c = cmd.replace(/(&|\d)?>{1,2}\s*(\/dev\/null|nul)\b/gi, '');
  if (/[;&|\n\r`]|\$\(/.test(c) || REDIRECT.test(c)) return false;
  return SIMPLE_READ.test(c);
}

/** Shell tamper check. Null = fine, else the reason. `full` adds the identity and setting names. */
function shellTamper(cmd, scriptText, full) {
  const all = cmd + scriptText;
  if (PLUGIN_OFF.test(all) || CLAUDE_LAUNCH_FLAGS.test(all)) {
    return 'Starting Claude without its settings or plugins, or switching a plugin off, is not allowed from this Claude. Ask Riaan\'s side.';
  }
  if (REMOVE_SHELL.test(all) && CLAUDE_DIR.test(all)) {
    return 'Deleting, moving or renaming Claude\'s own settings folder (.claude) is not allowed from this Claude. Ask Riaan\'s side.';
  }
  if (SETTINGS_NAME.test(all) && !singleSimpleRead(cmd)) {
    return 'Claude\'s settings files may only be read from the shell, one plain read at a time (cat, type, Get-Content). Ask Riaan\'s side to change them.';
  }
  if (full && TAMPER_NAMES.test(all)) {
    return 'That command names one of the settings that decide whether the campaign guard runs. Ask Riaan\'s side.';
  }
  return null;
}

/** Is this (absolute) path one of Claude's settings files? */
function isSettingsFile(abs) {
  const base = path.basename(abs).toLowerCase();
  if (base === '.claude.json' || base === 'managed-settings.json') return true;
  if (base !== 'settings.json' && base !== 'settings.local.json') return false;
  const dir = path.dirname(abs);
  if (path.basename(dir).toLowerCase() === '.claude') return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return !!cfg && norm(realLocation(cfg, process.cwd())).replace(/\/+$/, '') === norm(dir).replace(/\/+$/, '');
}

/** A file-tool write to a settings file, judged on the parsed current and resulting JSON. */
function checkSettingsWrite(tool, input, raw) {
  const REFUSE = 'That change to Claude\'s settings would switch the campaign guard off or change who it thinks is working. Ask Riaan\'s side.';
  // A notebook tool has no resulting text to check, so it lands in the "could not be checked" refusal.
  const current = fs.existsSync(raw) ? readText(raw) : null;
  if (fs.existsSync(raw) && current === null) return REFUSE;
  const next = resultingText(tool, input, current);
  const parse = (t) => { try { const v = JSON.parse(String(t).replace(/^﻿/, '')); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
  const after = next === null ? null : parse(next);
  if (after === null) return 'That settings file change could not be checked (the result is not plain JSON). Ask Riaan\'s side.';
  const before = (current === null ? {} : parse(current)) || {};
  if (after.disableAllHooks && !before.disableAllHooks) return REFUSE;
  const plugins = (o) => (o && typeof o.enabledPlugins === 'object' && o.enabledPlugins) || {};
  const pb = plugins(before);
  const pa = plugins(after);
  for (const k of Object.keys(pb)) if (/^glowming-campaign@/i.test(k) && pb[k] !== false && (!(k in pa) || pa[k] === false)) return REFUSE;
  for (const k of Object.keys(pa)) if (/^glowming-campaign@/i.test(k) && pa[k] === false && pb[k] !== false) return REFUSE;
  const env = (o) => (o && typeof o.env === 'object' && o.env) || {};
  for (const k of SETTINGS_ENV_KEYS) if (JSON.stringify(env(before)[k]) !== JSON.stringify(env(after)[k])) return REFUSE;
  return null;
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
// Code that hides what it runs: blocked everywhere outside a developer's checkout, Anton never needs
// it. Every `eval(` and every `exec(` counts, bare or as a member, a regex's `pattern.exec(` included:
// a file's name says nothing about what runs it (`python x.js` runs Python, where `b.exec(` runs
// code), so no member call is exempt (Codex and Claude review, 2026-10-03; the code repositories that
// needed regex .exec( are developer's checkouts). Decoding a payload (atob, a Buffer from base64 or
// hex, a new Function) counts too, whatever then runs it.
const HIDDEN_CODE = /-e(nc|ncodedcommand)?\s+[a-z0-9+/=]{16,}|-encodedcommand|frombase64string|base64\s+(-d|--decode)|b64decode|\beval\s*\(|\bexec\s*\(|\batob\(|\bfrom\s*\([^)]*,\s*['"](?:base64(?:url)?|hex)['"]|\bnew\s+Function\s*\(|\biex\b|invoke-expression|(^|[\s;&|])(python3?|py|node|ruby|perl)\s+-(\s|$)|(^|[\s;&|])(python3?|py|node)\s*<|\b(bash|sh|zsh)\s+-s\b|-command\s+-(\s|$)|(^|[\s;&|(])(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)(\.exe)?\s*<|\|\s*(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd|python3?|py|node|ruby|perl|php)(\.exe)?(\s|$)/i;
const SCRIPT_FILE = /(?:"([^"]+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))"|'([^']+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))'|([^\s'"]+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php)))(?=$|[\s;&|)\],}])/gi;

/**
 * The text of every script file a command runs, and of every script THOSE scripts name (three
 * levels deep, Codex round 8), so a script is judged by what it does. A script named deeper than
 * that counts as unreadable.
 */
function scriptsRun(cmd, cwd) {
  let text = '';
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
        if (SHELL_SCRIPT.test(file)) shellText += NL + part;
        next.push(part);
      }
    }
    frontier = next;
  }
  return { text, shellText, unreadable, tooDeep };
}

// Campaign work under the code folder is known by its path (the campaign repository, and the worktrees
// made inside it). Only the path: it is the one thing a session cannot change (see devCheckout).
const CAMPAIGN_REPO = /campaign/i;

/**
 * The folder that holds the owner's code repositories: `<home drive>\repos` (C:\repos on the owner's
 * machine), fixed in this file. Nothing a session can write moves it: not an environment variable
 * (`setx` would carry one into the next session), not a file. Anton launches in the synced folders,
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

/**
 * Whether the session works in a developer's checkout. Eligibility is bounded by the SPELLING of the
 * folder the session was launched in (CLAUDE_PROJECT_DIR, set by Claude Code and fixed for the
 * session; the hook's `cwd` follows every `cd`): it must be strictly inside the owner's code folder
 * (devRoots, compared as written); then, on every call, the shell's folder RESOLVED through links must
 * be inside that spelling and must neither say campaign nor be a company folder. A launch spelling
 * that says campaign, or lies outside the code folder, can never become eligible, whatever the session
 * changes on disk; a neutral spelling under the code folder is code by design (Codex rung 2: replacing
 * a junction at such a spelling with a real folder makes it eligible, inside the accepted cost below). Earlier versions also read git remotes, a marker file, a worktree's .git link and a record
 * written at session start: each was something a session could rewrite to turn the rules off
 * (Codex and Claude review, 2026-10-03), so none is read. The cost, stated in the README: a campaign
 * checkout under the code folder whose path does not say campaign counts as code.
 *
 * There the blanket shell rules below step aside: a code repository legitimately starts servers,
 * makes local requests, and runs test and build scripts that use eval/exec and chain many files
 * (measured 2026-10-03: they refused routine gates in a ROSS Suite session). The company files stay
 * protected everywhere: file tools, connectors, deletes and the copy that post.js checks do not
 * depend on this. Anton launches in the synced company folders, never under the code folder
 * (Riaan, 2026-10-03: "make it work like we need it to without relying on me").
 */
function devCheckout(cwd) {
  const launched = process.env.CLAUDE_PROJECT_DIR;
  if (!launched) return false; // without the launch folder, nothing shows the session is a code repository's
  const written = path.resolve(launched);
  if (!underDevRoot(written)) return false;
  // The shell's folder RESOLVED, inside the launch folder AS WRITTEN: a link anywhere on the way (in
  // the launch path, or one the shell went through) leaves it outside. A campaign or company name on
  // the launch path is on the shell's path too.
  const where = realLocation(cwd || launched, process.cwd());
  if (isProtected(norm(where)) || CAMPAIGN_REPO.test(norm(where))) return false;
  return (norm(where) + '/').startsWith(norm(written).replace(/\/?$/, '/'));
}

/** Decide one shell command, including the scripts it runs. */
function checkBash(input, cwd, callId, mode) {
  const cmd = String(input.command || '');
  // In a developer's checkout only the company-folder protection applies (devCheckout).
  const dev = devCheckout(cwd);
  // Scope discovery first (design note, campaign mode step 1): the command, every script it runs,
  // every path that names or resolves into a company folder, and the shell's own folder.
  const scripts = scriptsRun(cmd, cwd);
  const full = cmd + scripts.text;
  // Paths that only RESOLVE into a company folder (a symlink, "../..") count as naming it (Codex r9).
  const named = foldersNamed(full, cwd, false);
  const nfull = norm(full) + (named.length ? NL + named.map(norm).join(NL) : '');
  const inFolder = isProtected(norm(cwd || ''));
  // The tamper list, before scope (FULL: all of it; CAMPAIGN: settings files and plugin switches).
  const tamper = shellTamper(cmd, scripts.text, mode !== 'campaign');
  if (tamper) return tamper;
  // CAMPAIGN (no identity): a command that does not touch the company folders is not judged.
  if (mode === 'campaign' && !(isProtected(nfull) || inFolder)) return null;
  if (!dev && HIDDEN_CODE.test(cmd)) {
    return 'Commands that hide or stream the code they run (encoded, eval/exec, stdin) are not allowed from this Claude. Write the script to a file first so it can be checked.';
  }
  if (!dev && scripts.tooDeep > 0) {
    return 'That chain of scripts is too deep or too large to check (more than three levels, or a script over 500 KB). Run the script directly.';
  }
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
  if (!dev && NET_CALL.test(full)) {
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

/** The snapshot file name for one tool call: its id from the hook input, cleaned; '' when there is none. */
function snapId(callId) {
  return String(callId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
}
// The session of the call being decided (recorded with its copy, for people reading it).
let sessionIdNow = null;

/**
 * Copy every file under every named company folder (all depths), for post.js to compare after
 * THIS tool call. Null = ok, else a reason to block.
 */
function snapshotFolders(full, cwd, inFolder, callId) {
  let dirs = foldersNamed(full, cwd, inFolder);
  if (!dirs.length) return null;
  // A folder inside another named folder is already covered by it.
  dirs = dirs.filter((d) => !dirs.some((o) => o !== d && norm(d).startsWith(norm(o).replace(/\/?$/, '/'))));
  // Only the post hook of THIS call processes a copy, so a call without an id would leave a copy
  // nobody checks: refused before it runs (design note, I1).
  const id = snapId(callId);
  if (!id) return 'This command touches the company files but arrived without a call id, so what it does could not be checked afterwards. Try again.';
  const backupDir = path.join(os.tmpdir(), 'glowming-snap-' + id + '.d');
  const manifest = { callId: id, sessionId: sessionIdNow, cwd: path.resolve(cwd || process.cwd()), backupDir, created: Date.now(), dirs: [] };
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
function checkMcp(tool, input, cwd, mode) {
  // mcp__<server>__<action>: the server says WHOSE system it is, the action says what it does.
  const parts = tool.toLowerCase().split('__');
  const server = parts.length > 2 ? parts.slice(1, -1).join('__') : '';
  const act = parts[parts.length - 1];
  const strings = stringsIn(input, []);
  const looksLikePath = (s) => /[\\/]/.test(s) || /\.[a-z0-9]{1,5}$/i.test(s);
  const touches = () => strings.some((s) => isProtected(norm(s)) || (looksLikePath(s) && s.length < 1024 && isProtected(norm(realLocation(s, cwd)))));
  // CAMPAIGN (no identity): only a call whose arguments name or lead into a company folder is judged.
  if (mode === 'campaign' && !touches()) return null;
  if (/(delete|trash|remove|move|rename|purge|empty)/.test(act)) {
    return 'Deleting, moving or renaming through a connector is not allowed from this Claude. Ask Riaan\'s side if something must go.';
  }
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
  if (touches()) {
    return 'That connector call would touch the company folders. Use the campaign skill\'s checked steps instead.';
  }
  return null;
}

/** Decide one tool call. `id` (from identity()) may be passed in; it is read here otherwise. */
function decide(event, id) {
  const who = id || identity();
  if (who.mode === 'off') return null; // Riaan: nothing here runs
  const tool = String(event.tool_name || '');
  const input = event.tool_input || {};
  const cwd = event.cwd || process.cwd();
  sessionIdNow = event.session_id || null;
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) {
    const given = input.file_path || input.notebook_path || '';
    if (given) {
      const raw = realLocation(given, cwd);
      if (isSettingsFile(raw)) { const t = checkSettingsWrite(tool, input, raw); if (t) return t; }
    }
    return checkWrite(tool, input, cwd);
  }
  if (tool.startsWith('mcp__')) return checkMcp(tool, input, cwd, who.mode);
  if (typeof input.command === 'string') return checkBash(input, cwd, event.tool_use_id, who.mode);
  return null;
}

/** Tests only (their own process): stand in for the owner's code folder. */
function setDevRootsForTests(roots) { testRoots = roots; }
/** Tests only: stand in for this machine's OS account and name ({ user, host }, lower-case); false = unreadable; null = the real one. */
function setMachineForTests(m) { testMachine = m; }

module.exports = { decide, identity, recordIdentity, checkWrite, checkNewFile, isTextFile, isProtected, norm, sha1, walkFiles, snapId, CALENDAR, BANNED_CLAIMS, setDevRootsForTests, setMachineForTests };

if (require.main === module) {
  // Who is working is read BEFORE the tool call is parsed, so Riaan never meets even the
  // "could not read the tool call" refusal (design note round 8, finding 5).
  const id = identity();
  recordIdentity('guard', id);
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    if (id.mode === 'off') process.exit(0);
    let event;
    try { event = JSON.parse(buf || '{}'); } catch (e) {
      process.stderr.write('glowming-campaign guard: could not read the tool call, so it was blocked to be safe.');
      process.exit(2);
    }
    const reason = decide(event, id);
    if (reason) { process.stderr.write('Blocked by the Glowming campaign guard: ' + reason); process.exit(2); }
    process.exit(0);
  });
}
