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
 * Known limits (stated in the README): a script that builds company paths at run
 * time with no folder name in its text; a Python module run with -m; anything if
 * Cowork does not run plugin hooks at all (the skills' own rules then apply, and
 * the campaign skill runs a canary to find out).
 */
'use strict';

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
  // Compare the LINKS themselves, so ticking "- [ ]" on a line with a link is fine.
  const links = (t) => unify(t).match(/[^\s"'<>()]*utm_[^\s"'<>()]*/gi) || [];
  const kept = new Set(links(next));
  return links(current).some((l) => !kept.has(l))
    ? 'Existing tracking links (utm_) never change. Leave those lines exactly as they are.' : null;
}

const UNREADABLE = 'That file exists but could not be read (OneDrive may still be downloading it), so the change cannot be checked. Open the folder in File Explorer, wait for the green tick, and try again.';

/** Decide one file write. Returns null to allow, or a plain-English reason to block. */
function checkWrite(tool, input, cwd) {
  const given = input.file_path || input.notebook_path || '';
  if (!given) return null;
  const raw = realLocation(given, cwd);
  const np = norm(raw);
  if (!isProtected(np)) return null; // a temporary working file outside the company folders
  const exists = fs.existsSync(raw);
  const current = exists ? readText(raw) : null;

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
const REMOVE_SHELL = /(^|[\s;&|(])(rm|del|erase|rmdir|rd|mv|move|ren|rename|unlink|shred|truncate)(\s|$)|remove-item|move-item|rename-item|clear-content|robocopy|xcopy|rsync|shutil\.(rmtree|move)|os\.(remove|unlink|rename|replace|rmdir)|\.unlink\(|\.rename\(|\.rmdir\(|git\s+(clean|checkout|reset|rm|mv)/i;
// Writing file contents from code (command text AND the scripts it runs).
const CODE_WRITE = /set-content|add-content|out-file|copy-item|open\([^)]*['"][wax]b?\+?['"]|write_(text|bytes)\(|\.save\(|\.to_(csv|excel)\(|writefile|appendfile|copyfile|\btee\b|\bsed\s+-i|\bperl\s+-\w*i|\bdd\s+[^|;]*of=|\binstall\s|\bpatch\s|\bcp\s|\bcopy\s/i;
// Shell redirection into a file: > >> 2> 2>> &> &>>, but not 2>&1. Judged on the COMMAND only
// (scripts contain arrows and comparisons that are not redirects).
const REDIRECT = /(^|[^=\-<>])(&|\d)?>{1,2}(?![&>=])/;
// Code that hides what it runs: blocked everywhere, Anton never needs it.
const HIDDEN_CODE = /-e(nc|ncodedcommand)?\s+[a-z0-9+/=]{16,}|-encodedcommand|frombase64string|base64\s+(-d|--decode)|b64decode|\beval\(|\bexec\(|\biex\b|invoke-expression|(^|[\s;&|])(python3?|py|node|ruby|perl)\s+-(\s|$)|(^|[\s;&|])(python3?|py|node)\s*<|\b(bash|sh|zsh)\s+-s\b|-command\s+-(\s|$)/i;
const SCRIPT_FILE = /(?:"([^"]+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))"|'([^']+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))'|([^\s'"]+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php)))(?=$|[\s;&|)])/gi;

/** The text of every script file a command runs, so a script is judged by what it DOES. */
function scriptsRun(cmd, cwd) {
  let text = '';
  let unreadable = 0;
  let m;
  SCRIPT_FILE.lastIndex = 0;
  while ((m = SCRIPT_FILE.exec(cmd)) !== null) {
    const body = readText(realLocation(m[1] || m[2] || m[3], cwd));
    if (body === null) unreadable++;
    else text += NL + body.slice(0, 500000);
  }
  return { text, unreadable };
}

/** Decide one shell command, including the scripts it runs. */
function checkBash(input, cwd) {
  const cmd = String(input.command || '');
  if (HIDDEN_CODE.test(cmd)) {
    return 'Commands that hide or stream the code they run (encoded, eval/exec, stdin) are not allowed from this Claude. Write the script to a file first so it can be checked.';
  }
  const scripts = scriptsRun(cmd, cwd);
  const full = cmd + scripts.text;
  const nfull = norm(full);
  const inFolder = isProtected(norm(cwd || ''));
  if (HIDDEN_CODE.test(scripts.text) && (isProtected(nfull) || inFolder)) {
    return 'That script hides the code it runs (eval/exec/encoded), so it cannot be checked against the campaign folders.';
  }
  if ((isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full)) {
    return 'Deleting, moving or renaming files in the company folders is not allowed, the posting calendar included.';
  }
  // Throwing output away (2>/dev/null, >nul) writes no company file.
  const cmdNoDiscard = cmd.replace(/(&|\d)?>{1,2}\s*(\/dev\/null|nul)\b/gi, '');
  if ((isProtected(norm(cmd)) || inFolder) && REDIRECT.test(cmdNoDiscard)) {
    return 'Shell redirection (> or >>) into the company folders is not allowed. Make the change with the campaign skill\'s checked steps instead.';
  }
  // The posting calendar is the one company file a script may SAVE (SharePoint keeps its versions).
  // Strip each whole path that ends in the calendar (back to its opening quote), so its folder
  // names do not count; any OTHER company path left in the command or script still does.
  const withoutCalendar = nfull.replace(/[^'"]*02 posting calendar\.xlsx/g, '');
  if ((isProtected(withoutCalendar) || inFolder) && CODE_WRITE.test(full)) {
    return 'Shell commands and scripts may not overwrite files in the company folders (only the posting calendar may be saved). Make the change with the campaign skill\'s checked steps instead.';
  }
  if (inFolder && scripts.unreadable > 0) {
    return 'A script was started from a company folder but could not be read, so it was blocked to be safe.';
  }
  return null;
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
function checkMcp(tool, input) {
  // mcp__<server>__<action>: the server says WHOSE system it is, the action says what it does.
  const parts = tool.toLowerCase().split('__');
  const server = parts.length > 2 ? parts.slice(1, -1).join('__') : '';
  const act = parts[parts.length - 1];
  if (/(delete|trash|remove|move|rename|purge|empty)/.test(act)) {
    return 'Deleting, moving or renaming through a connector is not allowed from this Claude. Ask Riaan\'s side if something must go.';
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
  // Any other server: a non-read call that names a company folder is judged like a file write.
  if (stringsIn(input, []).some((s) => isProtected(norm(s)))) {
    return 'That connector call would touch the company folders. Use the campaign skill\'s checked steps instead.';
  }
  return null;
}

function decide(event) {
  const tool = String(event.tool_name || '');
  const input = event.tool_input || {};
  const cwd = event.cwd || process.cwd();
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return checkWrite(tool, input, cwd);
  if (tool.startsWith('mcp__')) return checkMcp(tool, input);
  if (typeof input.command === 'string') return checkBash(input, cwd);
  return null;
}

module.exports = { decide };

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
