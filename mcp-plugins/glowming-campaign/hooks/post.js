#!/usr/bin/env node
/**
 * glowming-campaign guard, PART 2 (PostToolUse and PostToolUseFailure): judge what a shell command
 * DID, and warn about what a file tool wrote.
 *
 * WHO: the same identity() as guard.js (design note docs/glowming-campaign-guard-identity.md).
 * For Riaan (mode off) this file returns before reading a copy, putting anything back or warning.
 *
 * 1. The copy check. guard.js (PreToolUse) copies every file, at every depth, of the company folders
 *    a shell command touches, under the id of THAT tool call. After the call, this file compares those
 *    folders with the copy:
 *   - a file that is gone             -> put back
 *   - a file that changed             -> judged by the same rules as the file tools
 *                                        (anton.md append-only, caption lines locked,
 *                                        tracking lines kept, plans never replaced...);
 *                                        the posting calendar may change only if every
 *                                        tracking-link cell and hyperlink is untouched and
 *                                        no new cell carries a banned claim; anything else
 *                                        that fails -> put back
 *   - a new file anywhere in those folders (new sub-folders included) where new files
 *     are not allowed -> removed (this command made it)
 *    Only the copy whose call id matches THIS call is checked; every other copy younger than six hours
 *    is left alone (another call is still running). A copy older than six hours is deleted WITHOUT
 *    putting anything back: its call never reported, and a change since may be someone else's. With no
 *    call id nothing is checked. Before a file is put back or removed, the version being displaced is
 *    copied to <home>/.glowming-guard-recovery/<time>-<call id>/ (outside every synced folder); if that
 *    copy fails, the file and the copy are left as they are and the failure is reported.
 *    Runs on PostToolUseFailure too: a command that changes a file and then fails is still checked.
 * 2. The warning (successful file-tool writes only). The text just written is scanned for a key or
 *    token, a private key, a password assignment, a card or ID number (Luhn-valid, 13-19 digits) or a
 *    banned claim. A finding is a WARNING, never a block (Riaan, 2026-10-02: warn, not refuse): exit-0
 *    JSON with a systemMessage for the person and additionalContext for Claude. The value itself is
 *    never repeated. FULL mode: every file-tool write; CAMPAIGN mode: writes into the company folders.
 *
 * Exit 2 with a plain-English reason when anything had to be put back or removed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const guard = require('./guard.js');
const calendarLinks = require('./calendar-links.js');

const STALE_MS = 6 * 60 * 60 * 1000;
let recoveryRootForTests = null;

/** Where displaced versions are kept: outside every synced company folder. */
function recoveryRoot() {
  return recoveryRootForTests || path.join(os.homedir(), '.glowming-guard-recovery');
}

/**
 * Check the copy of ONE tool call. Copies older than six hours are deleted without restoring.
 * Null = nothing to report, else the report.
 */
function verifyAll(callId) {
  const problems = [];
  const mine = callId ? 'glowming-snap-' + guard.snapId(callId) + '.json' : null;
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (!/^glowming-snap-.+\.json$/.test(f)) continue;
    const manifestPath = path.join(os.tmpdir(), f);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { manifest = null; }
    const stale = !manifest || Date.now() - (manifest.created || 0) > STALE_MS;
    // Expiry first: an expired copy is never put back, even when its own call reports at last
    // (Codex code r1).
    if (stale) { removeSnapshot(manifestPath, manifest); continue; }
    if (f === mine) {
      const recovery = { dir: null, n: 0, map: {}, callId: guard.snapId(callId) };
      let keep = false;
      for (const dir of manifest.dirs) if (checkFolder(dir, manifest.cwd, problems, recovery)) keep = true;
      if (recovery.dir) {
        try { fs.writeFileSync(path.join(recovery.dir, 'map.json'), JSON.stringify(recovery.map, null, 2)); } catch (e) { /* the copies are there; the map is a convenience */ }
        problems.push('The versions that were displaced are kept in ' + recovery.dir + '.');
      }
      if (keep) continue; // a displaced version could not be kept: leave this copy for a person
      removeSnapshot(manifestPath, manifest);
    }
  }
  return problems.length ? problems.join(' ') : null;
}

function removeSnapshot(manifestPath, manifest) {
  fs.rmSync(manifestPath, { force: true });
  if (manifest && manifest.backupDir) fs.rmSync(manifest.backupDir, { recursive: true, force: true });
}

/** Copy the version about to be displaced to the recovery folder. True when the copy is confirmed. */
function keepDisplaced(p, recovery) {
  try {
    if (!recovery.dir) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      recovery.dir = path.join(recoveryRoot(), stamp + '-' + recovery.callId);
      fs.mkdirSync(recovery.dir, { recursive: true });
    }
    const dest = path.join(recovery.dir, (recovery.n++) + '-' + path.basename(p));
    fs.copyFileSync(p, dest);
    if (guard.sha1(fs.readFileSync(dest)) !== guard.sha1(fs.readFileSync(p))) return false;
    recovery.map[path.basename(dest)] = p;
    return true;
  } catch (e) {
    return false;
  }
}

/** Compare one folder with its copy. True when a displaced version could not be kept. */
function checkFolder(dir, cwd, problems, recovery) {
  let failed = false;
  const before = new Map(dir.files.map((e) => [e.path, e]));
  for (const e of dir.files) {
    if (!fs.existsSync(e.path)) {
      fs.mkdirSync(path.dirname(e.path), { recursive: true });
      fs.copyFileSync(e.backup, e.path);
      problems.push(path.basename(e.path) + ' was deleted, so it was put back.');
      continue;
    }
    const now = fs.readFileSync(e.path);
    if (guard.sha1(now) === e.sha1) continue;
    const reason = judgeChange(e, now, cwd);
    if (reason) {
      if (!keepDisplaced(e.path, recovery)) {
        failed = true;
        problems.push(path.basename(e.path) + ': ' + reason + ' It was NOT put back, because the changed version could not be kept first; look at it.');
        continue;
      }
      fs.copyFileSync(e.backup, e.path);
      problems.push(path.basename(e.path) + ': ' + reason + ' The earlier version was put back.');
    }
  }
  let nowFiles = [];
  try { nowFiles = guard.walkFiles(dir.dir, []); } catch (e) { nowFiles = []; }
  for (const p of nowFiles) {
    if (before.has(p)) continue;
    // A new text file is judged with what it actually says (a banned claim written by a script in a
    // developer's checkout, where the shell claim rule steps aside: Codex code r1).
    let text = '';
    if (guard.isTextFile(guard.norm(p))) { try { text = fs.readFileSync(p, 'utf8'); } catch (e) { text = ''; } }
    const reason = guard.checkNewFile(p, cwd, text);
    if (reason) {
      if (!keepDisplaced(p, recovery)) {
        failed = true;
        problems.push(path.basename(p) + ' was created where new files are not allowed (' + reason + '); it was NOT removed, because it could not be kept first; look at it.');
        continue;
      }
      fs.rmSync(p, { force: true });
      problems.push(path.basename(p) + ' was created where new files are not allowed (' + reason + '), so it was removed.');
    }
  }
  return failed;
}

/** May this existing file have changed this way? Null = yes, else the reason. */
function judgeChange(entry, nowBuf, cwd) {
  const np = guard.norm(entry.path);
  if (np.endsWith('/' + guard.CALENDAR)) {
    try {
      if (!calendarLinks.linksKept(calendarLinks.cellTexts(entry.backup), calendarLinks.cellTexts(entry.path))) {
        return 'a tracking link in the posting calendar was changed, moved or removed.';
      }
      // Cell by cell: a claim already in one cell does not license copying it into another (Codex r8).
      const was = calendarLinks.cellTexts(entry.backup);
      for (const [cell, text] of calendarLinks.cellTexts(entry.path)) {
        if (was.get(cell) !== text && guard.BANNED_CLAIMS.test(text)) {
          return 'a calendar cell now carries a weight-loss, detox, appetite, craving or cure claim.';
        }
      }
      return null;
    } catch (e) {
      return 'the posting calendar could not be read as a workbook after the change.';
    }
  }
  if (!guard.isTextFile(np)) return 'an existing picture, video or document may not be overwritten.';
  const oldText = fs.readFileSync(entry.backup, 'utf8');
  return guard.checkWrite('Write', { file_path: entry.path, content: nowBuf.toString('utf8') }, cwd, { exists: true, current: oldText });
}

// ---- The warning --------------------------------------------------------------------------------
const KEY_SHAPES = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|shpat_[a-fA-F0-9]{32}|EAA[A-Za-z0-9]{60,})/;
const ASSIGNED = /\b(?:password|passwd|pwd|secret|api[ _-]?key|access[ _-]?token|auth[ _-]?token|token)\b\s*[:=]\s*["']?[^\s"']+/i;
const DIGIT_RUN = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** What kind of risky text is in `text` (names only, never the value). */
function findings(text) {
  const out = [];
  if (KEY_SHAPES.test(text)) out.push('a key or access token');
  if (ASSIGNED.test(text)) out.push('a password or secret written out');
  for (const m of text.match(DIGIT_RUN) || []) {
    const digits = m.replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) { out.push('a card or ID number'); break; }
  }
  if (guard.BANNED_CLAIMS.test(text)) out.push('a weight-loss, detox, appetite, craving, cure or "clinically proven" claim');
  return out;
}

/** The text a file tool just wrote: only the new-text fields. */
function newText(tool, input) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : '';
  if (tool === 'Edit') return String(input.new_string || '');
  if (tool === 'MultiEdit') return (input.edits || []).map((e) => String((e && e.new_string) || '')).join(String.fromCharCode(10));
  if (tool === 'NotebookEdit') return String(input.new_source || '');
  return '';
}

/** The warning for one successful file-tool write, or null. */
function warningFor(event, mode) {
  const tool = String(event.tool_name || '');
  if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return null;
  const input = event.tool_input || {};
  const target = input.file_path || input.notebook_path || '';
  // Resolved through links and '~', the same way the file checks resolve a target (Codex code r1).
  if (mode === 'campaign' && !guard.isProtected(guard.norm(guard.realLocation(String(target), event.cwd || process.cwd())))) return null;
  const found = findings(newText(tool, input));
  if (!found.length) return null;
  const name = path.basename(String(target)) || 'the file';
  const what = found.join(' and ');
  return {
    systemMessage: 'Glowming campaign guard (a warning, nothing was blocked): the text just written to ' + name + ' looks like it contains ' + what + '.',
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: 'Warning from the Glowming campaign guard, not a block: the text just written to ' + name + ' looks like it contains ' + what
        + '. Tell the person in one plain sentence what the risk is (do not repeat the value), offer the safer option, and let them decide.',
    },
  };
}

/**
 * One hook run. Returns { code, stdout, stderr }. `id` from guard.identity(); off returns at once.
 */
function run(event, id) {
  if (id.mode === 'off') return { code: 0, stdout: '', stderr: '' };
  const callId = event.tool_use_id || null;
  let problem = null;
  try { problem = verifyAll(callId); } catch (e) { problem = 'the after-check failed (' + e.message + '); look at the campaign folders.'; }
  if (problem) return { code: 2, stdout: '', stderr: 'Glowming campaign guard: ' + problem };
  const failed = event.hook_event_name === 'PostToolUseFailure';
  const warning = failed ? null : warningFor(event, id.mode);
  return { code: 0, stdout: warning ? JSON.stringify(warning) : '', stderr: '' };
}

/** Tests only: where displaced versions go. */
function setRecoveryRootForTests(dir) { recoveryRootForTests = dir; }

module.exports = { verifyAll, run, findings, warningFor, setRecoveryRootForTests };

if (require.main === module) {
  const id = guard.identity();
  guard.recordIdentity('post', id);
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    if (id.mode === 'off') process.exit(0);
    let event = {};
    try { event = JSON.parse(buf || '{}') || {}; } catch (e) { event = {}; }
    const r = run(event, id);
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(r.code);
  });
}
