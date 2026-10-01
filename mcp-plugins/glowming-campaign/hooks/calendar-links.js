#!/usr/bin/env node
/**
 * Tracking links inside the posting calendar (.xlsx), read CELL BY CELL.
 *
 * An .xlsx file is a zip of XML parts. This reads it with Node's own zlib (no
 * dependencies). cellLinks() returns every cell whose text holds a utm_ link,
 * keyed by sheet and cell reference, plus every hyperlink target keyed by sheet
 * and relationship id. linksKept(before, after) is true only if every one of
 * those cells and targets still holds exactly the same text: moving a link to
 * another cell, or changing it while a copy survives elsewhere, both fail
 * (Codex round 6, 2026-10-01).
 */
'use strict';

const fs = require('fs');
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

/** All the text inside the <t> elements of an XML fragment. */
function textOf(xml) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

/**
 * Every cell's text, keyed "sheet!REF" (shared strings, inline strings, values and formulas), and
 * every cell hyperlink keyed "sheet!REF#link", resolved through the sheet's relationships so a
 * hyperlink is tied to its CELL, not to its relationship id (Codex round 7).
 */
function cellTexts(file) {
  const parts = zipParts(fs.readFileSync(file));
  const sst = parts['xl/sharedStrings.xml']
    ? [...parts['xl/sharedStrings.xml'].matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  const out = new Map();
  for (const [name, xml] of Object.entries(parts)) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    for (const m of xml.matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const inner = m[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const f = (inner.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1] || '';
      let text = '';
      if (type === 's' && v !== undefined) text = sst[Number(v)] || '';
      else if (type === 'inlineStr') text = textOf(inner);
      else if (v !== undefined) text = decodeXml(v);
      out.set(name + '!' + ref, text + (f ? ' =' + decodeXml(f) : ''));
    }
    const relsName = name.replace(/^xl\/worksheets\//, 'xl/worksheets/_rels/') + '.rels';
    const targets = {};
    for (const m of (parts[relsName] || '').matchAll(/<Relationship\s+([^>]*?)\/?>/g)) {
      const id = (m[1].match(/\bId="([^"]+)"/) || [])[1];
      if (id) targets[id] = decodeXml((m[1].match(/\bTarget="([^"]+)"/) || [])[1] || '');
    }
    for (const m of xml.matchAll(/<hyperlink\s+([^>]*?)\/?>/g)) {
      const ref = (m[1].match(/\bref="([^"]+)"/) || [])[1];
      const id = (m[1].match(/\br:id="([^"]+)"/) || [])[1];
      const loc = decodeXml((m[1].match(/\blocation="([^"]+)"/) || [])[1] || '');
      if (ref) out.set(name + '!' + ref + '#link', (id ? targets[id] || '' : '') + (loc ? '#' + loc : ''));
    }
  }
  return out;
}

/** The cells and cell hyperlinks that hold a utm_ tracking link. */
function cellLinks(file) {
  const out = new Map();
  for (const [k, v] of cellTexts(file)) if (/utm_/i.test(v)) out.set(k, v);
  return out;
}

/** True when every link cell / target of `before` still holds exactly the same text in `after`. */
function linksKept(before, after) {
  for (const [k, v] of before) if (after.get(k) !== v) return false;
  return true;
}

module.exports = { cellLinks, cellTexts, linksKept, zipParts };
