#!/usr/bin/env node
/**
 * Tracking links inside the posting calendar (.xlsx) must survive every save.
 *
 * The guard (PreToolUse) lets an openpyxl script save the calendar. Before it runs,
 * snapshot() copies the workbook and records every utm_ link in it. After the
 * command (PostToolUse), verify() reads the links again; if any link was changed
 * or removed it puts the copy back and blocks with a plain-English reason.
 *
 * An .xlsx file is a zip of XML parts. This reads it with Node's own zlib (no
 * dependencies): every .xml / .rels part is scanned, so links in cells, shared
 * strings and hyperlink targets are all seen.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

/** The XML text of every part in a zip file (stored or deflated entries). */
function zipParts(buf) {
  const parts = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(xml|rels)$/i.test(name)) continue;
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + csize);
    parts[name] = method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
  }
  return parts;
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Every distinct utm_ link in a workbook, sorted. Throws if the file cannot be read as a workbook. */
function linksIn(file) {
  const parts = zipParts(fs.readFileSync(file));
  const found = new Set();
  for (const xml of Object.values(parts)) {
    for (const m of decodeXml(xml).match(/[^\s"'<>]*utm_[^\s"'<>]*/gi) || []) found.add(m);
  }
  return [...found].sort();
}

function snapshotPath(file) {
  const id = crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'glowming-calendar-' + id);
}

/** Before a calendar save: keep a copy and the list of its links. Returns an error string or null. */
function snapshot(file) {
  try {
    const links = linksIn(file);
    const base = snapshotPath(file);
    fs.copyFileSync(file, base + '.xlsx');
    fs.writeFileSync(base + '.json', JSON.stringify({ file: path.resolve(file), links }));
    return null;
  } catch (e) {
    return 'The posting calendar could not be read to protect its tracking links (' + e.message + '), so the save was blocked. Check OneDrive has finished syncing and try again.';
  }
}

/** After a command: every pending snapshot is checked; lost links mean the copy goes back. */
function verifyAll() {
  const problems = [];
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (!/^glowming-calendar-[0-9a-f]{16}\.json$/.test(f)) continue;
    const meta = path.join(os.tmpdir(), f);
    const copy = meta.replace(/\.json$/, '.xlsx');
    let rec;
    try { rec = JSON.parse(fs.readFileSync(meta, 'utf8')); } catch (e) { continue; }
    let now = null;
    try { now = linksIn(rec.file); } catch (e) { now = null; }
    const lost = now === null ? rec.links : rec.links.filter((l) => !now.includes(l));
    if (lost.length) {
      try { fs.copyFileSync(copy, rec.file); } catch (e) { /* reported below */ }
      problems.push('The posting calendar lost or changed ' + lost.length + ' tracking link(s), so the earlier version was put back. Change only the cells that do not hold links.');
    }
    fs.rmSync(meta, { force: true });
    fs.rmSync(copy, { force: true });
  }
  return problems.length ? problems.join(' ') : null;
}

module.exports = { linksIn, snapshot, verifyAll, zipParts };

// PostToolUse entry point.
if (require.main === module) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    const problem = verifyAll();
    if (problem) { process.stderr.write('Glowming campaign guard: ' + problem); process.exit(2); }
    process.exit(0);
  });
}
