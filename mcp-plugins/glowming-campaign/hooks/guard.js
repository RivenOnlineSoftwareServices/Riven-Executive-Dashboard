#!/usr/bin/env node
/**
 * glowming-campaign guard: a PreToolUse hook that checks every file write, shell
 * command and destructive connector call against an ALLOW-LIST, using the files
 * as they are on disk. Riaan's ruling 2026-10-01: Anton may edit captions, the
 * posting calendar, plans and approvals and his own files, through a narrow path,
 * and nothing may break.
 *
 * Exit 0 = allow. Exit 2 = block (the stderr text is shown to Claude, which tells
 * Anton in plain words). Zero dependencies (Node 18+, already needed by the pulse
 * and collective plugins).
 *
 * The allow-list, inside the protected folders (anything synced from OneDrive or
 * SharePoint):
 *   shared project folder  _Riven-Claude/Glowming Summer Campaign/
 *     anton.md             append only (existing text must stay exactly as it is)
 *     todo-anton.md        any edit
 *     work/anton/...       new files; existing text files may change; an existing
 *                          picture or video is never overwritten
 *   campaign folder        Marketing/2026 Summer Campaign/
 *     01 Ready to post/.../caption.txt   only if the title, LINK and tracking
 *                          (utm_ / http) lines and the last line stay identical
 *     01 Ready to post/...  any other file: NEW files only
 *     02 Posting calendar.xlsx           may be saved (SharePoint keeps versions)
 *     05 Plans and approvals/...         NEW files only
 * Everything else inside the protected folders is blocked. Files outside them
 * (temporary working files) are allowed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SHARED = '_riven-claude/glowming summer campaign/';
const CAMPAIGN = 'marketing/2026 summer campaign/';
// Any path containing one of these is inside a synced company folder.
const PROTECTED_MARKERS = [
  'riven online software services',
  'onedrive',
  'sharepoint',
  'titan international',
  '_riven-claude',
  '2026 summer campaign',
  'gsa all assets',
  'sa operations',
];
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|mov|m4v|psd|ai|pdf)$/i;
// Existing files in work/anton/ may change only if they are plain text; anything else gets a new version.
const EDITABLE_TEXT = /\.(md|txt|csv|json|html?)$/i;

/**
 * The real absolute location of a path: relative paths against the session folder,
 * '..' segments resolved, and the nearest existing folder's links followed, so
 * 'work/anton/../../riaan.md' is judged as riaan.md.
 */
function realLocation(p, cwd) {
  let abs = path.resolve(cwd || process.cwd(), String(p || ''));
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
  return String(s).replace(/\r\n/g, '\n');
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
  const lines = unify(text).split('\n');
  const locked = [];
  lines.forEach((l, i) => {
    if (i < 2 || /^LINK\b/.test(l) || /utm_|https?:\/\//i.test(l)) locked.push(l);
  });
  const last = lines.filter((l) => l.trim()).pop();
  if (last !== undefined) locked.push('LAST:' + last);
  return locked.join('\n');
}

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
      const next = resultingText(tool, input, current);
      if (next === null) return 'anton.md is append-only and this change could not be checked. Add the new lines at the end instead.';
      return unify(next).startsWith(unify(current)) ? null
        : 'anton.md is append-only: earlier lines may not change. Add the new lines at the end instead.';
    }
    if (shared === 'todo-anton.md') return null;
    if (shared.startsWith('work/anton/')) {
      if (exists && !EDITABLE_TEXT.test(np)) return 'That file already exists. Save the new one under a new name (next version number) instead.';
      return null;
    }
    return 'Only anton.md, todo-anton.md and work/anton/ may be changed in the shared project folder. To change anything else, ask Riaan\'s side in anton.md under ## Questions.';
  }

  const camp = after(np, CAMPAIGN);
  if (camp !== null) {
    if (camp.startsWith('01 ready to post/')) {
      if (/\/caption\.txt$/.test(camp)) {
        if (!exists) return 'A new caption.txt needs a tracking code from Riaan\'s side. Ask in anton.md under ## Questions.';
        const next = resultingText(tool, input, current);
        if (next === null) return 'This caption change could not be checked. Re-read caption.txt and change only the post text, Headline, Short line, Button or Approval status.';
        return lockedCaptionLines(next) === lockedCaptionLines(current) ? null
          : 'The title, the LINK lines, the tracking links and the last line of caption.txt never change. Change only the post text, Headline, Short line, Button or Approval status.';
      }
      return exists ? 'That file already exists in Ready to post. Save it as a NEW file with the next version number instead.' : null;
    }
    if (camp === '02 posting calendar.xlsx') return null;
    if (camp.startsWith('05 plans and approvals/')) {
      return exists ? 'Files in Plans and approvals are never replaced. Save it as a new file ("<name> v2") instead.' : null;
    }
    return 'That campaign folder is read-only from here. Ask Riaan\'s side in anton.md under ## Questions.';
  }

  return 'That folder is outside the campaign files this Claude may change. Ask Riaan\'s side in anton.md under ## Questions.';
}

const DESTRUCTIVE_SHELL = /(^|[\s;&|(])(rm|del|erase|rmdir|rd|mv|move|ren|rename|unlink|shred|truncate)(\s|$)|remove-item|move-item|rename-item|clear-content|set-content|out-file|copy-item|robocopy|xcopy|shutil\.(rmtree|move)|os\.(remove|unlink|rename|replace|rmdir)|\.unlink\(|\.rename\(|\.rmdir\(|git\s+(clean|checkout|reset|rm|mv)|(^|[^>0-9])>(?![>&])|open\([^)]*['"][wax]b?\+?['"]|write_(text|bytes)\(|\.save\(|\.to_(csv|excel)\(|writefile|appendfile|copyfile|\btee\b|\bsed\s+-i|\bcp\s|\bcopy\s/i;

/** Decide one shell command. Commands that touch a company folder AND could delete, move or overwrite are blocked. */
function checkBash(input, cwd) {
  const cmd = String(input.command || '');
  // The posting calendar is the one company file a script may save (SharePoint keeps its versions).
  // Strip each whole path that ends in the calendar (back to its opening quote), so its folder
  // names do not count; any OTHER company path left in the command still does.
  const withoutCalendar = norm(cmd).replace(/[^'"]*02 posting calendar\.xlsx/g, '');
  const touches = isProtected(withoutCalendar) || isProtected(norm(cwd || ''));
  if (!touches) return null;
  if (DESTRUCTIVE_SHELL.test(cmd)) {
    return 'Shell commands may not delete, move, rename or overwrite files in the company folders. Make the change with the campaign skill\'s checked steps instead.';
  }
  return null;
}

/** Connector calls that delete, trash, move or rename are blocked outright. */
function checkMcp(tool, input) {
  // mcp__<server>__<action>: the server says WHOSE system it is, the action says what it does.
  // Judging them apart stops 'sharepoint_search' reading as 'share' and 'downloads' as 'ads'.
  const parts = tool.toLowerCase().split('__');
  const server = parts.length > 2 ? parts.slice(1, -1).join('__') : '';
  const act = parts[parts.length - 1];
  if (/(delete|trash|remove|move|rename|purge|empty)/.test(act)) {
    return 'Deleting, moving or renaming through a connector is not allowed from this Claude. Ask Riaan\'s side if something must go.';
  }
  const company = /(sharepoint|onedrive|outlook|mail|gmail|teams|calendar|graph|lokka|microsoft|m365|meta|facebook|instagram|shopify)/.test(server + ' ' + act)
    || /(^|[_-])ads?($|[_-])/.test(server);
  // A generic Graph caller names no verb: anything but a read is a change.
  if (/lokka|graph/.test(server) && String((input && input.method) || 'get').toLowerCase() !== 'get') {
    return 'Changing anything in Microsoft 365 through a connector is not allowed from this Claude; it may only read.';
  }
  if (company && /(send|forward|reply|respond)/.test(act) && !/draft/.test(act)) {
    return 'This Claude writes emails and messages as drafts only; Anton presses Send himself.';
  }
  if (company && /(upload|update|create|copy|write|edit|patch|post|publish|(^|_)share(_|$)|(^|_)set_)/.test(act) && !/draft/.test(act)) {
    return 'Changing files, adverts or settings through a connector is not allowed from this Claude. Save files in the synced folders through the checked steps, or ask Riaan\'s side.';
  }
  return null;
}

function decide(event) {
  const tool = String(event.tool_name || '');
  const input = event.tool_input || {};
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return checkWrite(tool, input, event.cwd);
  if (tool === 'Bash' || tool === 'PowerShell') return checkBash(input, event.cwd);
  if (tool.startsWith('mcp__')) return checkMcp(tool, input);
  return null;
}

module.exports = { decide, norm, lockedCaptionLines };

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
