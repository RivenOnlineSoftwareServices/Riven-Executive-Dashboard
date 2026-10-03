#!/usr/bin/env node
/**
 * glowming-campaign guard, PART 2 (PostToolUse): judge what a shell command DID.
 *
 * guard.js (PreToolUse) copies every file, at every depth, of the company folders a
 * shell command touches, under the id of THAT tool call. After the call, this file
 * compares those folders with the copy:
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
 *   - the guard's own plugin folder (copied before every shell command but a plain read):
 *     any change is put back, any new file removed
 * It runs after a tool call that FAILED too (PostToolUseFailure): a command that changes a file
 * and then exits with an error is checked like any other.
 * Only the snapshot of the call that just finished is checked, so overlapping calls never
 * consume each other's before-state (Codex round 7). A snapshot older than six hours, whose
 * call never reported back, is checked and cleared by the next run.
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

/** Check the snapshot of one tool call (or every snapshot when no id is given). */
function verifyAll(callId) {
  const problems = [];
  const mine = callId ? 'glowming-snap-' + guard.snapId(callId) + '.json' : null;
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (!/^glowming-snap-.+\.json$/.test(f)) continue;
    const manifestPath = path.join(os.tmpdir(), f);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { continue; }
    const stale = Date.now() - (manifest.created || 0) > STALE_MS;
    if (mine && f !== mine && !stale) continue;
    // A stale copy of the guard's own folder is only cleared, never put back: the app may have updated
    // the plugin in place since, and an hours-old copy would undo that.
    for (const dir of manifest.dirs) {
      if (dir.plugin && mine && f !== mine) continue;
      checkFolder(dir, manifest.cwd, problems);
    }
    fs.rmSync(manifestPath, { force: true });
    fs.rmSync(manifest.backupDir, { recursive: true, force: true });
  }
  return problems.length ? problems.join(' ') : null;
}

function checkFolder(dir, cwd, problems) {
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
    // The guard's own folder: every change is put back (marked in the copy, so it does not depend on
    // which folder this process takes to be the plugin's).
    const reason = dir.plugin ? guard.PLUGIN_REASON : judgeChange(e, now, cwd);
    if (reason) {
      fs.copyFileSync(e.backup, e.path);
      problems.push(path.basename(e.path) + ': ' + reason + ' The earlier version was put back.');
    }
  }
  let nowFiles = [];
  try { nowFiles = guard.walkFiles(dir.dir, []); } catch (e) { nowFiles = []; }
  for (const p of nowFiles) {
    if (before.has(p)) continue;
    const reason = dir.plugin ? guard.PLUGIN_REASON : guard.checkNewFile(p, cwd);
    if (reason) {
      fs.rmSync(p, { force: true });
      problems.push(path.basename(p) + ' was created where new files are not allowed (' + reason + '), so it was removed.');
    }
  }
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

module.exports = { verifyAll };

if (require.main === module) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    let callId = null;
    try { callId = JSON.parse(buf || '{}').tool_use_id || null; } catch (e) { callId = null; }
    let problem = null;
    try { problem = verifyAll(callId); } catch (e) { problem = 'the after-check failed (' + e.message + '); look at the campaign folders.'; }
    if (problem) { process.stderr.write('Glowming campaign guard: ' + problem); process.exit(2); }
    process.exit(0);
  });
}
