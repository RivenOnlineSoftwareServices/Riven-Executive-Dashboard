#!/usr/bin/env node
/**
 * glowming-campaign guard, PART 2 (PostToolUse): judge what a shell command DID.
 *
 * guard.js (PreToolUse) copies every file in the company folders a shell command
 * names (and the folder it runs in) before the command is allowed to run. This
 * file runs after every tool call and compares:
 *   - a file that is gone             -> put back
 *   - a file that changed             -> judged by the same rules as the file tools
 *                                        (anton.md append-only, caption lines locked,
 *                                        tracking links kept, plans never replaced...);
 *                                        the posting calendar may change only if every
 *                                        tracking-link cell is untouched; anything else
 *                                        that fails -> put back
 *   - a new file where creating one is not allowed -> removed (this command made it)
 * Whatever a command tried, the folders end in a state the rules allow. Replaces
 * guessing writes from command text, which could always miss one more method
 * (Codex rounds 4-6, 2026-10-01).
 *
 * Exit 2 with a plain-English reason when anything had to be put back or removed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const guard = require('./guard.js');
const calendarLinks = require('./calendar-links.js');

const SNAP_PREFIX = 'glowming-snap-';

/** Check every pending snapshot; returns a reason string, or null when all is well. */
function verifyAll() {
  const problems = [];
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (!f.startsWith(SNAP_PREFIX) || !f.endsWith('.json')) continue;
    const manifestPath = path.join(os.tmpdir(), f);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { continue; }
    for (const dir of manifest.dirs) {
      const before = new Map(dir.files.map((e) => [e.path, e]));
      // Files that existed before: gone or changed?
      for (const e of dir.files) {
        if (!fs.existsSync(e.path)) {
          fs.copyFileSync(e.backup, e.path);
          problems.push(path.basename(e.path) + ' was deleted, so it was put back');
          continue;
        }
        const now = fs.readFileSync(e.path);
        if (guard.sha1(now) === e.sha1) continue;
        const reason = judgeChange(e, now, manifest.cwd);
        if (reason) {
          fs.copyFileSync(e.backup, e.path);
          problems.push(path.basename(e.path) + ': ' + reason + ' The earlier version was put back.');
        }
      }
      // Files that are new in this folder.
      let names = [];
      try { names = fs.readdirSync(dir.dir); } catch (e) { names = []; }
      for (const name of names) {
        const p = path.join(dir.dir, name);
        if (before.has(p)) continue;
        let st;
        try { st = fs.statSync(p); } catch (e) { continue; }
        if (!st.isFile()) continue;
        const reason = guard.checkNewFile(p, manifest.cwd);
        if (reason) {
          fs.rmSync(p, { force: true });
          problems.push(name + ' was created where new files are not allowed (' + reason + '), so it was removed.');
        }
      }
    }
    fs.rmSync(manifestPath, { force: true });
    fs.rmSync(manifest.backupDir, { recursive: true, force: true });
  }
  return problems.length ? problems.join(' ') : null;
}

/** May this existing file have changed this way? Null = yes, else the reason. */
function judgeChange(entry, nowBuf, cwd) {
  const np = guard.norm(entry.path);
  if (np.endsWith('/' + guard.CALENDAR)) {
    try {
      return calendarLinks.linksKept(calendarLinks.cellLinks(entry.backup), calendarLinks.cellLinks(entry.path))
        ? null : 'a tracking link in the posting calendar was changed or moved.';
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
    let problem = null;
    try { problem = verifyAll(); } catch (e) { problem = 'the after-check failed (' + e.message + '); look at the campaign folders.'; }
    if (problem) { process.stderr.write('Glowming campaign guard: ' + problem); process.exit(2); }
    process.exit(0);
  });
}
