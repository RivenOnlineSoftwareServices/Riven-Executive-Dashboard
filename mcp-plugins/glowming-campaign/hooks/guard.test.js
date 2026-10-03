#!/usr/bin/env node
/**
 * Tests for the glowming-campaign guard: guard.js (PreToolUse) and post.js
 * (PostToolUse), against real files in a temporary folder laid out like the synced
 * campaign folders. Run: node hooks/guard.test.js
 *
 * File tools are judged before they run. Shell commands are judged twice: before
 * (deletes, hidden code, web requests, claims) and AFTER, by comparing the company
 * folders with the copy taken first. So a shell case states the OUTCOME: either the
 * command was refused, or it ran and post.js put the files back. Each case names
 * what would go wrong for Anton if it broke.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const NL = String.fromCharCode(10);
const guard = require(process.env.GUARD_PATH || './guard.js');
const { decide } = guard;
const post = require(process.env.POST_PATH || './post.js');
const calendarLinks = require(path.join(__dirname, 'calendar-links.js'));

/** A minimal .xlsx (stored zip): shared strings plus sheet1 with one cell per string in column A. */
function makeXlsx(file, cells, links) {
  links = links || [];
  const sheet = '<?xml version="1.0"?><worksheet><sheetData>'
    + cells.map((c, i) => '<row r="' + (i + 1) + '"><c r="A' + (i + 1) + '" t="s"><v>' + i + '</v></c></row>').join('')
    + '</sheetData>'
    + (links.length ? '<hyperlinks>' + links.map((l, i) => '<hyperlink ref="' + l.ref + '" r:id="rId' + (i + 1) + '"/>').join('') + '</hyperlinks>' : '')
    + '</worksheet>';
  const rels = '<?xml version="1.0"?><Relationships>' + links.map((l, i) => '<Relationship Id="rId' + (i + 1) + '" Type="hyperlink" Target="' + l.target.replace(/&/g, '&amp;') + '" TargetMode="External"/>').join('') + '</Relationships>';
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    // '&#...;' is kept as a raw XML character reference (a cell can hold one); other '&' are escaped.
    ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst>' + cells.map((c) => '<si><t>' + c.replace(/&(?!#)/g, '&amp;') + '</t></si>').join('') + '</sst>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  if (links.length) entries.push(['xl/worksheets/_rels/sheet1.xml.rels', rels]);
  writeZip(file, entries);
}

/** A stored (uncompressed) zip of [name, text] entries. */
function writeZip(file, entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, cd, eocd]));
}
/** A two-sheet workbook: sheet A1 texts per sheet name, in the workbook order given by `order` (part names). */
function makeTwoSheets(file, sheets, order) {
  const sst = [];
  const parts = {};
  for (const [part, text] of Object.entries(sheets)) {
    sst.push(text);
    parts[part] = '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>' + (sst.length - 1) + '</v></c></row></sheetData></worksheet>';
  }
  const wb = '<?xml version="1.0"?><workbook><sheets>' + order.map((part, i) => '<sheet name="' + ['Week 1', 'Week 2'][i] + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>';
  const wbRels = '<?xml version="1.0"?><Relationships>' + order.map((part, i) => '<Relationship Id="rId' + (i + 1) + '" Type="worksheet" Target="' + part.replace('xl/', '') + '"/>').join('') + '</Relationships>';
  writeZip(file, [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['xl/workbook.xml', wb],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst>' + sst.map((c) => '<si><t>' + c.replace(/&/g, '&amp;') + '</t></si>').join('') + '</sst>'],
    ...Object.entries(parts),
  ]);
}
const LINK = 'https://glowming.co.za/pages/journey?utm_source=meta&utm_content=a5-b&utm_term=feed';
const LINK2 = 'https://glowming.co.za/pages/journey?utm_source=meta&utm_content=a5-c&utm_term=feed';

// ---- a folder laid out like Anton's synced folders --------------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-guard-'));
// Removed however the run ends, a failed assertion included (every negative control ends one early).
process.on('exit', () => {
  try { process.chdir(os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ }
});
const base = path.join(root, 'Riven Online Software Services');
const shared = path.join(base, 'ROSS - Documents', '_Riven-Claude', 'Glowming Summer Campaign');
const camp = path.join(base, 'Glowming-SA Operations - Documents', 'SA Operations', 'Marketing', '2026 Summer Campaign');
const advert = path.join(camp, '01 Ready to post', 'Step 2 - Already know Glowming', 'A5 Journey starts Monday 5 or 19 October');
const plans = path.join(camp, '05 Plans and approvals');
const rulesDir = path.join(camp, '06 Competition rules');
for (const d of [path.join(shared, 'work', 'anton'), advert, plans, rulesDir]) fs.mkdirSync(d, { recursive: true });
// Every case runs as Anton does: launched from, and standing in, a folder that is not a git checkout.
// The tests may themselves run from a Claude session launched inside a code repository, which the
// guard would treat as a developer's checkout (section 5), so that is cleared here.
const antonHome = path.join(root, 'Users', 'anton');
fs.mkdirSync(antonHome, { recursive: true });
process.chdir(antonHome);
delete process.env.CLAUDE_PROJECT_DIR;
const caption = [
  'A5 Journey starts', '=================', '', 'CAPTION (post text):', 'Old post text.', '',
  'Headline:   Old headline', 'Short line: Old short', 'Button:     Sign up', '',
  'Approval status: Approved (Anton, 26 Sep 2026)', '',
  'LINK - paste the whole link into the post:',
  '  A5-B: paid    ' + LINK, '',
  'English only. Hashtags: #GlowmingJourney.',
].join(NL) + NL;
const files = {
  anton: path.join(shared, 'anton.md'),
  riaan: path.join(shared, 'riaan.md'),
  todo: path.join(shared, 'todo-anton.md'),
  caption: path.join(advert, 'caption.txt'),
  png: path.join(advert, 'A5-B story 9x16.png'),
  plan: path.join(plans, 'Ad plan.docx'),
  rules: path.join(rulesDir, 'rules.md'),
  calendar: path.join(camp, '02 Posting calendar.xlsx'),
  antonPng: path.join(shared, 'work', 'anton', 'old.png'),
  other: path.join(camp, 'Budget.xlsx'),
};
const ORIGINAL = {};
function reset() {
  fs.writeFileSync(files.anton, '# anton.md' + NL + '--- START | 2026-10-01 | anton ---' + NL);
  fs.writeFileSync(files.riaan, '# riaan.md' + NL);
  fs.writeFileSync(files.todo, '- [ ] a' + NL + '- [ ] post A5 with ' + LINK + NL);
  fs.writeFileSync(files.caption, caption);
  fs.writeFileSync(files.png, 'png-bytes');
  fs.writeFileSync(files.plan, 'plan-bytes');
  fs.writeFileSync(files.rules, 'rules');
  makeXlsx(files.calendar, ['Mon 5 Oct', LINK]);
  fs.writeFileSync(files.antonPng, 'x');
  fs.writeFileSync(files.other, 'budget-bytes');
  for (const [k, p] of Object.entries(files)) ORIGINAL[k] = fs.readFileSync(p);
}
reset();
const same = (k) => fs.existsSync(files[k]) && Buffer.compare(fs.readFileSync(files[k]), ORIGINAL[k]) === 0;

let passed = 0;
const allow = (why, ev) => { assert.strictEqual(decide(ev), null, 'should ALLOW: ' + why); passed++; };
const block = (why, ev) => { assert.notStrictEqual(decide(ev), null, 'should BLOCK: ' + why); passed++; };
const W = (p, content) => ({ tool_name: 'Write', tool_input: { file_path: p, content } });
const E = (p, o, n) => ({ tool_name: 'Edit', tool_input: { file_path: p, old_string: o, new_string: n } });
const B = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
// Sections 1-4 and 6 mean nothing if this machine's temp folder sits inside a checkout the guard
// would trust: prove the blanket rules hold where Anton stands before anything else.
block('start-up: a web request from Anton\'s folder is refused', B('curl -s https://example.com/'));

/**
 * A shell command the guard may let run: decide() first; if allowed, do what the command
 * would do (effect), then run post.js. `outcome` checks the files afterwards.
 * Returns 'blocked', 'undone' (post.js reported and repaired) or 'kept'.
 */
function shell(why, ev, effect, expect, after) {
  const decision = decide(ev);
  let result = 'blocked';
  if (decision === null) {
    effect();
    result = post.verifyAll() === null ? 'kept' : 'undone';
  }
  if (result === 'undone') {
    for (const k of Object.keys(files)) assert.ok(same(k), why + ': ' + k + ' must be exactly as before after the repair');
  }
  const ok = Array.isArray(expect) ? expect.includes(result) : result === expect;
  assert.ok(ok, why + ': expected ' + expect + ', got ' + result + (decision ? ' (' + decision + ')' : ''));
  passed++;
  if (after) { after(); passed++; }
  reset();
  return result;
}
const STOPPED = ['blocked', 'undone'];

// ---- 1. File tools ------------------------------------------------------------------------------
allow('append to anton.md', W(files.anton, fs.readFileSync(files.anton, 'utf8') + 'CHANGE | x' + NL));
block('rewrite anton.md', W(files.anton, '# anton.md' + NL));
allow('Edit that appends after the last line', E(files.anton, '--- START | 2026-10-01 | anton ---', '--- START | 2026-10-01 | anton ---' + NL + 'more'));
block('Edit that changes an earlier line', E(files.anton, '# anton.md', '# changed'));
allow('tick an item in todo-anton.md', E(files.todo, '- [ ] a', '- [x] a (done 2026-10-01)'));
allow('tick the item that carries a link', E(files.todo, '- [ ] post A5 with ' + LINK, '- [x] post A5 with ' + LINK + ' (done 2026-10-01)'));
block('change a tracking link in todo-anton.md', E(files.todo, 'utm_content=a5-b', 'utm_content=a5-c'));
block('change a link while keeping a copy elsewhere', W(files.todo, '- [ ] a' + NL + '- [ ] post A5 with ' + LINK2 + NL + 'note: ' + LINK + ' old' + NL));
block('riaan.md is Riaan\'s file', W(files.riaan, 'x'));
block('README in the shared folder', W(path.join(shared, 'README.md'), 'x'));
block('.. out of work/anton onto riaan.md', W(path.join(shared, 'work', 'anton') + path.sep + '..' + path.sep + '..' + path.sep + 'riaan.md', 'x'));
block('relative path resolved against the shared folder', { tool_name: 'Write', tool_input: { file_path: 'riaan.md', content: 'x' }, cwd: shared });
allow('new file in work/anton', W(path.join(shared, 'work', 'anton', 'notes.md'), 'x'));
block('overwrite a picture in work/anton', W(files.antonPng, 'y'));
allow('change the headline', E(files.caption, 'Headline:   Old headline', 'Headline:   New headline'));
allow('change the post text and mark it Changed', W(files.caption, caption.replace('Old post text.', 'New text.').replace('Approved (Anton, 26 Sep 2026)', 'Changed (Anton, 1 Oct 2026)')));
block('stamp Approved (only Anton approves)', W(files.caption, caption.replace('Approved (Anton, 26 Sep 2026)', 'Approved (Anton, 1 Oct 2026)')));
block('change the tracking link', E(files.caption, 'utm_content=a5-b', 'utm_content=a5-c'));
block('change the title line', E(files.caption, 'A5 Journey starts', 'A5 Something else'));
block('drop the last line', W(files.caption, caption.replace('English only. Hashtags: #GlowmingJourney.' + NL, '')));
block('a NEW caption.txt (needs a code from Riaan)', W(path.join(advert, '..', 'caption.txt'), 'x'));
block('a weight-loss claim in a caption (Write)', W(files.caption, caption.replace('Old post text.', 'Lose weight fast.')));
block('a cure claim in a caption (Edit)', E(files.caption, 'Old post text.', 'Cures bloating.'));
block('an appetite claim in a new plan', W(path.join(plans, 'Idea.md'), 'It reduces your appetite.'));
allow('a new render file', W(path.join(advert, 'A5-B story 9x16 v2 2026-10-02.png'), 'x'));
block('overwrite an approved final', W(files.png, 'y'));
allow('a new plan file', W(path.join(plans, 'Ad plan v2.docx'), 'x'));
block('replace an existing plan', W(files.plan, 'y'));
block('the Write tool replacing the posting calendar', W(files.calendar, 'y'));
block('competition rules are read-only', W(files.rules, 'y'));
block('a folder that is not on the list', W(path.join(base, 'Finance', 'x.md'), 'x'));
allow('a temporary file outside company folders', W(path.join(os.tmpdir(), 'draft.txt'), 'x'));
fs.mkdirSync(path.join(root, 'Users', 'anton', 'OneDrive', 'Documents'), { recursive: true });
allow('a scratch file under a personal OneDrive Documents folder', W(path.join(root, 'Users', 'anton', 'OneDrive', 'Documents', 'scratch.md'), 'x'));
allow('an HTML preview with font-weight outside company folders', W(path.join(os.tmpdir(), 'preview.html'), '<b style="font-weight: bold">Hi</b>'));
fs.rmSync(files.todo, { force: true }); fs.mkdirSync(files.todo);
block('todo-anton.md exists but cannot be read', W(files.todo, 'x'));
fs.rmSync(files.todo, { recursive: true, force: true }); reset();

// ---- 2. Shell, refused before running -----------------------------------------------------------
block('rm in the campaign folder', B('rm "' + files.png + '"'));
block('Remove-Item', { tool_name: 'PowerShell', tool_input: { command: 'Remove-Item "' + files.plan + '"' } });
block('move a folder', B('mv "' + advert + '" /tmp/x'));
block('rm the posting calendar', B('rm "' + files.calendar + '"'));
block('node fs.rmSync on a render', B('node -e "require(\'fs\').rmSync(\'' + files.png.split(path.sep).join('/') + '\')"'));
block('rm with the shell already inside the folder', B('rm caption.txt', advert));
{
  const before = process.cwd();
  process.chdir(advert);
  try { block('rm with no cwd sent, run from inside a company folder', { tool_name: 'Bash', tool_input: { command: 'rm caption.txt' } }); }
  finally { process.chdir(before); }
}
block('a shell tool with another name', { tool_name: 'Shell', tool_input: { command: 'rm "' + files.png + '"' } });
block('PowerShell -EncodedCommand', { tool_name: 'PowerShell', tool_input: { command: 'powershell -EncodedCommand SQBFAFgAIAAoAEcAZQB0AC0AQwBvAG4AdABlAG4AdAAp' } });
block('python exec(b64decode(...))', B('python -c "exec(__import__(\'base64\').b64decode(\'eA==\'))"'));
block('python reading code from stdin', B('python - < /tmp/x.py'));
block('bash -s reading a script from stdin', B('bash -s < /tmp/x.sh'));
block('any web request from the shell, even a read', B('curl -s https://glowming.co.za/'));
block('curl --json to an API', B('curl --json \'{"enabled":true}\' https://example.com/api/settings'));
block('python requests (any web request)', B('python -c "import requests; requests.get(\'https://example.com\')"'));
block('node https.request', B('node -e "require(\'https\').request(\'https://example.com\',{method:\'POST\'}).end()"'));
block('a shell-written draft with a weight-loss claim', B('echo "Lose weight fast with Glowming" > /tmp/draft.txt'));
block('an unreadable script started from a company folder', B('python missing.py', advert));
allow('list a folder', B('ls "' + advert + '" 2>&1'));
allow('grep for a banned word (reading, not writing)', B('grep -n "detox" /tmp/notes.txt'));
allow('rm outside company folders', B('rm /tmp/scratch.txt'));
allow('a preview with font-weight written outside company folders', B('printf "<b style=font-weight:bold>Hi</b>" > /tmp/preview.html'));
const perlScript = path.join(os.tmpdir(), 'gc-perl-' + process.pid + '.pl');
fs.writeFileSync(perlScript, 'unlink "' + files.png + '";' + NL);
block('a perl script that deletes a company file', B('perl "' + perlScript + '"'));
fs.rmSync(perlScript, { force: true });

const calPy = path.join(os.tmpdir(), 'gc-cal-' + process.pid + '.py');
fs.writeFileSync(calPy, 'import openpyxl' + NL + 'wb = openpyxl.load_workbook("02 Posting calendar.xlsx")' + NL + 'wb.save("02 Posting calendar.xlsx")' + NL);

// ---- 3. Shell, judged by what it DID ------------------------------------------------------------
const w = (k, data) => () => fs.writeFileSync(files[k], data);
shell('redirect over a caption', B('echo hi > "' + files.caption + '"'), w('caption', 'hi'), STOPPED);
shell('>> append onto a caption', B('printf "x" >> "' + files.caption + '"'), () => fs.appendFileSync(files.caption, 'x'), STOPPED,
  () => assert.ok(same('caption'), 'caption back after the append'));
shell('Add-Content onto riaan.md', { tool_name: 'PowerShell', tool_input: { command: 'Add-Content "' + files.riaan + '" "x"' } }, () => fs.appendFileSync(files.riaan, 'x'), STOPPED);
shell('cp over a plan', B('cp /tmp/x.docx "' + files.plan + '"'), w('plan', 'other'), STOPPED);
shell('python os.open/os.write over the competition rules', B('python -c "import os; f=os.open(r\'' + files.rules + '\', os.O_WRONLY|os.O_TRUNC); os.write(f, b\'x\')"'), w('rules', 'x'), STOPPED);
shell('a delete the text did not reveal', B('python tidy.py ' + JSON.stringify(advert)), () => fs.rmSync(files.png), STOPPED);
{
  // The repair itself, checked byte for byte.
  decide(B('python fix.py "' + advert + '"'));
  fs.writeFileSync(files.png, 'tampered');
  assert.notStrictEqual(post.verifyAll(), null, 'tampering is reported'); passed++;
  assert.ok(same('png'), 'the picture is back exactly'); passed++;
  reset();
  decide(B('python fix.py "' + advert + '"'));
  fs.rmSync(files.png);
  assert.notStrictEqual(post.verifyAll(), null, 'a deletion is reported'); passed++;
  assert.ok(fs.existsSync(files.png) && same('png'), 'the deleted picture is back exactly'); passed++;
  reset();
}
shell('a new render saved by a script', B('python render.py "' + advert + '"'), () => fs.writeFileSync(path.join(advert, 'A5-B story 9x16 v3 2026-10-02.png'), 'new'), 'kept');
assert.ok(fs.existsSync(path.join(advert, 'A5-B story 9x16 v3 2026-10-02.png')), 'the new render stays'); passed++;
shell('a new file in the competition rules folder', B('python make.py "' + rulesDir + '"'), () => fs.writeFileSync(path.join(rulesDir, 'new.md'), 'x'), 'undone',
  () => assert.ok(!fs.existsSync(path.join(rulesDir, 'new.md')), 'the forbidden new file is removed'));
shell('a caption headline changed by sed -i', B('sed -i "s/Old headline/New headline/" "' + files.caption + '"'), w('caption', caption.replace('Old headline', 'New headline')), 'kept');
shell('a caption tracking link changed by sed -i', B('sed -i "s/a5-b/a5-c/" "' + files.caption + '"'), w('caption', caption.split('a5-b').join('a5-c')), 'undone');
shell('a todo link changed by a script while a copy is kept', B('python t.py "' + shared + '"'), w('todo', '- [ ] a' + NL + '- [ ] post A5 with ' + LINK2 + NL + LINK + NL), 'undone');
shell('the calendar saved with its links in place', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Tue 6 Oct']), 'kept');
shell('the calendar saved with a link lost', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', 'gone']), 'undone');
shell('the calendar saved with a link moved to another cell', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', 'x', LINK]), 'undone');
shell('the calendar replaced by something that is not a workbook', B('python cal.py "' + files.calendar + '"'), w('calendar', 'junk'), 'undone');
shell('another workbook overwritten by the calendar script, from inside the folder', B('python "' + calPy + '"', camp), w('other', 'overwritten'), 'undone',
  () => assert.ok(same('other'), 'the other workbook is back'));
shell('a stray new workbook in the campaign folder', B('python "' + calPy + '"', camp), () => fs.writeFileSync(path.join(camp, 'copy.xlsx'), 'x'), 'undone',
  () => assert.ok(!fs.existsSync(path.join(camp, 'copy.xlsx')), 'the stray workbook is removed'));
assert.ok(calendarLinks.linksKept(calendarLinks.cellLinks(files.calendar), calendarLinks.cellLinks(files.calendar)), 'a calendar keeps its own links'); passed++;
// Codex round 7.
const packs = path.join(camp, '03 Affiliate packs');
fs.mkdirSync(packs, { recursive: true });
fs.writeFileSync(path.join(packs, 'notes.txt'), 'pack notes');
shell('a protected file in a sub-folder, script names only the campaign root', B('python tidy.py "' + camp + '"'), () => fs.writeFileSync(path.join(packs, 'notes.txt'), 'overwritten'), 'undone',
  () => assert.strictEqual(fs.readFileSync(path.join(packs, 'notes.txt'), 'utf8'), 'pack notes', 'the sub-folder file is back'));
shell('a forbidden file in a NEW sub-folder', B('python tidy.py "' + camp + '"'), () => { fs.mkdirSync(path.join(camp, '07 New'), { recursive: true }); fs.writeFileSync(path.join(camp, '07 New', 'x.md'), 'x'); }, 'undone',
  () => assert.ok(!fs.existsSync(path.join(camp, '07 New', 'x.md')), 'the file in the new sub-folder is removed'));
block('fetch with a space before the bracket', B('node -e "fetch (\'https://example.com\')"'));
const stdinPy = path.join(os.tmpdir(), 'gc-stdin-' + process.pid + '.py');
fs.writeFileSync(stdinPy, 'import sys' + NL + 'exec(sys.stdin.read())' + NL);
block('a scratch script that runs code from stdin, outside company folders', B('python "' + stdinPy + '" < /tmp/payload.txt'));
fs.rmSync(stdinPy, { force: true });
shell('a calendar save that adds a hyperlink to a plain cell (benign)', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Shop'], [{ ref: 'A1', target: LINK }]), 'kept');
makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Shop'], [{ ref: 'A3', target: LINK }]);
for (const k of ['calendar']) ORIGINAL[k] = fs.readFileSync(files[k]);
{
  decide(B('python cal.py "' + files.calendar + '"'));
  makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Shop'], [{ ref: 'A1', target: LINK }]);
  assert.notStrictEqual(post.verifyAll(), null, 'a hyperlink moved to another cell is caught'); passed++;
  assert.ok(same('calendar'), 'the calendar with its hyperlink in place is back'); passed++;
  reset();
}
shell('a calendar cell gains a banned claim', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Lose weight fast with Glowming']), 'undone');
{
  // Two overlapping tool calls: checking one must not consume the other's copy.
  decide({ tool_name: 'Bash', tool_input: { command: 'python a.py "' + advert + '"' }, tool_use_id: 'toolu_A' });
  decide({ tool_name: 'Bash', tool_input: { command: 'python b.py "' + plans + '"' }, tool_use_id: 'toolu_B' });
  assert.strictEqual(post.verifyAll('toolu_A'), null, 'call A finished cleanly'); passed++;
  fs.writeFileSync(files.plan, 'tampered by call B');
  assert.notStrictEqual(post.verifyAll('toolu_B'), null, 'call B is still checked against its own copy'); passed++;
  assert.ok(same('plan'), 'the plan is back'); passed++;
  reset();
}
{
  const count = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('glowming-snap-')).length;
  const n0 = count();
  allow('a plain read in a company folder', B('ls "' + advert + '" | head -5'));
  assert.strictEqual(count(), n0, 'a plain read takes no copy'); passed++;
}
// Codex round 8.
shell('sort -o over a protected file', B('sort -o "' + files.rules + '" /tmp/input.txt'), w('rules', 'sorted'), STOPPED);
shell('a relative path climbing out of work/anton onto riaan.md', B('printf changed > ../../riaan.md', path.join(shared, 'work', 'anton')), w('riaan', 'changed'), STOPPED);
block('bash reading a script from stdin', B('bash < /tmp/payload'));
block('code piped into python', B('cat /tmp/x.py | python'));
const inner = path.join(os.tmpdir(), 'gc-inner-' + process.pid + '.py');
const outer = path.join(os.tmpdir(), 'gc-outer-' + process.pid + '.sh');
fs.writeFileSync(inner, 'import urllib.request' + NL + 'urllib.request.urlopen("https://example.com")' + NL);
fs.writeFileSync(outer, 'python "' + inner + '"' + NL);
block('a script that starts another script making a web request', B('bash "' + outer + '"'));
fs.rmSync(inner, { force: true }); fs.rmSync(outer, { force: true });
shell('a calendar cell gains a claim written as XML character codes', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'de&#116;ox']), 'undone');
shell('a calendar save that adds a plain cell (benign)', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'x']), 'kept');
{
  makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Lose weight fast']);
  ORIGINAL.calendar = fs.readFileSync(files.calendar);
  decide(B('python cal.py "' + files.calendar + '"'));
  makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Lose weight fast', 'Lose weight fast']);
  assert.notStrictEqual(post.verifyAll(), null, 'an existing claim may not be copied into a new cell'); passed++;
  assert.ok(same('calendar'), 'the calendar is back'); passed++;
  reset();
}
{
  // Two sheets swapped in the workbook: Week 1 now shows what Week 2 showed.
  makeTwoSheets(files.calendar, { 'xl/worksheets/sheet1.xml': LINK, 'xl/worksheets/sheet2.xml': 'plain' }, ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  ORIGINAL.calendar = fs.readFileSync(files.calendar);
  decide(B('python cal.py "' + files.calendar + '"'));
  makeTwoSheets(files.calendar, { 'xl/worksheets/sheet1.xml': LINK, 'xl/worksheets/sheet2.xml': 'plain' }, ['xl/worksheets/sheet2.xml', 'xl/worksheets/sheet1.xml']);
  assert.notStrictEqual(post.verifyAll(), null, 'a link moved to another sheet by swapping sheets is caught'); passed++;
  assert.ok(same('calendar'), 'the calendar is back'); passed++;
  reset();
}
// Codex round 9.
{
  // A folder link (junction) whose own name says nothing about the company folders.
  // Inside this run's own folder: a fixed name in the shared temp folder outlived an aborted run and
  // was picked up again when Windows reused the process id (measured 2026-10-03).
  const link = path.join(root, 'gc-link');
  try { fs.symlinkSync(shared, link, 'junction'); } catch (e) { /* no link support: skip */ }
  if (fs.existsSync(link)) {
    shell('a write through a folder link into the shared folder', B('python -c "open(\'linked/riaan.md\',\'w\').write(\'x\')"'.replace('linked', link.split(path.sep).join('/'))), w('riaan', 'changed'), STOPPED);
    fs.rmSync(link, { recursive: false, force: true });
  }
}
const child = path.join(os.tmpdir(), 'gc-child-' + process.pid + '.py');
const parent = path.join(os.tmpdir(), 'gc-parent-' + process.pid + '.py');
fs.writeFileSync(child, 'import urllib.request' + NL + 'urllib.request.urlopen("https://example.com")' + NL);
fs.writeFileSync(parent, 'import subprocess' + NL + 'subprocess.run(["python3", "' + child.split(path.sep).join('/') + '"])' + NL);
block('a script that starts another through subprocess.run([...])', B('python "' + parent + '"'));
fs.rmSync(child, { force: true }); fs.rmSync(parent, { force: true });
{
  const chain = [0, 1, 2, 3, 4].map((i) => path.join(os.tmpdir(), 'gc-chain' + i + '-' + process.pid + '.py'));
  chain.forEach((f, i) => fs.writeFileSync(f, i < 4 ? 'import subprocess' + NL + 'subprocess.run(["python", "' + chain[i + 1].split(path.sep).join('/') + '"])' + NL : 'print(1)' + NL));
  block('a chain of scripts deeper than three levels, from a scratch folder', B('python "' + chain[0] + '"'));
  chain.forEach((f) => fs.rmSync(f, { force: true }));
}
fs.writeFileSync(files.todo, '- [ ] Try our detx drink' + NL);
block('an Edit fragment that turns existing text into a banned claim', E(files.todo, 'tx', 'tox'));
allow('an Edit that fixes a typo without making a claim', E(files.todo, 'detx', 'tea'));
reset();
{
  // A calendar cell written with single-quoted XML attributes is still read.
  decide(B('python cal.py "' + files.calendar + '"'));
  const sheetXml = '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row><row r="3"><c r=\'A3\' t=\'inlineStr\'><is><t>detox</t></is></c></row></sheetData></worksheet>';
  writeZip(files.calendar, [['[Content_Types].xml', '<?xml version="1.0"?><Types/>'], ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst><si><t>Mon 5 Oct</t></si><si><t>' + LINK.replace(/&/g, '&amp;') + '</t></si></sst>'], ['xl/worksheets/sheet1.xml', sheetXml]]);
  assert.notStrictEqual(post.verifyAll(), null, 'a claim in a single-quoted cell is caught'); passed++;
  assert.ok(same('calendar'), 'the calendar is back'); passed++;
  reset();
}
shell('a tracking cell given a click-through hyperlink to somewhere else', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK], [{ ref: 'A2', target: 'https://elsewhere.example/' }]), 'undone');

// ---- 4. Connectors ------------------------------------------------------------------------------
block('SharePoint delete', { tool_name: 'mcp__m365__sharepoint_delete_item', tool_input: {} });
block('move a file through a connector', { tool_name: 'mcp__m365__sharepoint_move_item', tool_input: {} });
block('any connector delete, even outside company folders', { tool_name: 'mcp__filesystem__delete_file', tool_input: { path: path.join(os.tmpdir(), 'x.txt') } });
allow('search through a connector', { tool_name: 'mcp__m365__sharepoint_search', tool_input: {} });
block('send mail through Outlook', { tool_name: 'mcp__ms365__outlook_send_mail', tool_input: {} });
block('reply (which sends) through Gmail', { tool_name: 'mcp__gmail__reply', tool_input: {} });
allow('create an email draft', { tool_name: 'mcp__ms365__outlook_create_draft', tool_input: {} });
allow('create a reply draft', { tool_name: 'mcp__ms365__outlook_create_reply_draft', tool_input: {} });
block('upload over a SharePoint file', { tool_name: 'mcp__ms365__sharepoint_upload_file', tool_input: {} });
block('Graph PATCH through Lokka', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: { method: 'patch' } });
block('Lokka call with no method stated', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: {} });
allow('Graph GET through Lokka', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: { method: 'get' } });
block('a filesystem connector writing a caption', { tool_name: 'mcp__filesystem__write_file', tool_input: { path: files.caption, content: 'x' } });
block('a relative caption path through a filesystem connector', { tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'caption.txt', content: 'x' }, cwd: advert });
allow('a filesystem connector writing a scratch file', { tool_name: 'mcp__filesystem__write_file', tool_input: { path: path.join(os.tmpdir(), 'x.txt'), content: 'x' } });
block('archive a Meta advert', { tool_name: 'mcp__meta__archive_ad', tool_input: {} });
block('cancel a Shopify order', { tool_name: 'mcp__shopify__cancel_order', tool_input: {} });
allow('read Meta insights', { tool_name: 'mcp__meta__get_ad_insights', tool_input: {} });
allow('Pulse snapshot', { tool_name: 'mcp__plugin_pulse_pulse__snapshot_today', tool_input: {} });
allow('Magnific image generation', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'sunset over Camps Bay, pouch on a table' } });
allow('Magnific upload of a source photo', { tool_name: 'mcp__magnific__creations_upload_image', tool_input: {} });
block('a Magnific prompt with a detox claim', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'detox drink on a beach' } });
block('a Magnific prompt with an appetite claim', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'drink that reduces your appetite' } });

// ---- 5. Developer's checkouts (2026-10-03) ----------------------------------------------------------
// A code repository on an owner's machine starts servers, makes local requests and runs build scripts:
// the blanket shell rules step aside there. Everything that protects the company files still applies.
// Decided ONLY from what a session cannot change: the folder it was LAUNCHED in (CLAUDE_PROJECT_DIR),
// strictly inside the owner's code folder (C:\repos on the owner's machine; this folder here), with no
// link in its path and no campaign or company name in it, and the shell still inside that folder.
const repos = path.join(root, 'repos');
guard.setDevRootsForTests([repos]);
const devRepo = path.join(repos, 'ROSS-Suite');
const devScripts = path.join(devRepo, 'scripts');
const devTree = path.join(devRepo, '.claude', 'worktrees', 'fix');
const campRepo = path.join(repos, 'Glowming-Summer-Campaign-2026');
const campTree = path.join(campRepo, '.claude', 'worktrees', 'tidy');
// Folders inside a dev launch whose own name says campaign (the shell going there gets the full rules).
const campNotes = path.join(devRepo, 'campaign-notes');
// A git checkout kept INSIDE a company folder is company files (under the code folder here, so the
// company-folder rule alone decides it).
const companyCode = path.join(repos, '_Riven-Claude', 'code');
const antonWork = path.join(antonHome, 'Work');
for (const d of [devScripts, path.join(devRepo, 'src'), devTree, path.join(campRepo, 'drafts'), campTree, campNotes, companyCode, antonWork]) fs.mkdirSync(d, { recursive: true });
// A junction with a neutral name leading into a campaign folder.
const campAlias = path.join(repos, 'alias');
fs.symlinkSync(campRepo, campAlias, 'junction');
/** Run `fn` as a session launched in `project` (undefined: no launch folder known). */
const launchedIn = (project, fn) => {
  const was = process.env.CLAUDE_PROJECT_DIR;
  if (project === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = project;
  try { fn(); } finally { if (was === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = was; }
};
// What a test-and-build script looks like: a child process, a regex's exec, a real network import, eval.
fs.writeFileSync(path.join(devScripts, 'gates.mjs'), [
  'import { spawnSync } from "node:child_process";',
  'import { request } from "node:http";',
  'const out = spawnSync(process.execPath, ["--test"], { encoding: "utf8" }).stdout;',
  'const n = /tests (\\d+)/.exec(out);',
  'console.log(eval("1 + 1"), n, request);',
].join(NL));
// A chain five scripts deep (the guard reads three levels).
for (let i = 1; i <= 5; i++) fs.writeFileSync(path.join(devScripts, 'step' + i + '.sh'), i < 5 ? 'bash "' + path.join(devScripts, 'step' + (i + 1) + '.sh') + '"' + NL : 'echo done' + NL);
const devB = (command, cwd) => B(command, cwd || devRepo);
const web = (cwd) => B('curl -s https://glowming.co.za/', cwd);

launchedIn(devRepo, () => {
  allow('dev: a request to a local server', devB('curl -s http://localhost:3000/health'));
  allow('dev: the test-and-build script (child process, regex exec, http import, eval)', devB('node "' + path.join(devScripts, 'gates.mjs') + '"'));
  allow('dev: a chain of scripts five levels deep', devB('bash "' + path.join(devScripts, 'step1.sh') + '"'));
  allow('dev: an inline eval in node -e', devB('node -e "console.log(eval(\'1+1\'))"'));
  allow('dev: a test fixture that names a banned word', devB('echo "detox" > fixtures/claims.txt'));
  allow('dev: from a sub-folder of the checkout', devB('curl -s http://localhost:3000/', path.join(devRepo, 'src')));
  block('dev launch, but the shell has left the launch folder: a web request', web(antonHome));
  block('dev launch, the shell has gone into another folder of the code folder: a web request', web(campRepo));
  block('dev launch, the shell in a folder whose name says campaign: a web request', web(campNotes));
  // The company files are protected from a developer's checkout exactly as from anywhere else.
  block('dev: rm a company file', devB('rm "' + files.png + '"'));
  block('dev: the Write tool on riaan.md', { tool_name: 'Write', tool_input: { file_path: files.riaan, content: 'x' }, cwd: devRepo });
  block('dev: Graph PATCH through Lokka', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: { method: 'patch' }, cwd: devRepo });
  shell('dev: a script that overwrites a caption in the advert folder it names', devB('node scripts/fix.js "' + advert + '"'), w('caption', 'hi'), 'undone',
    () => assert.ok(same('caption'), 'the caption is back'));
  shell('dev: a shell append of a weight-loss claim into anton.md', devB('echo "Lose weight fast" >> "' + files.anton + '"'), () => fs.appendFileSync(files.anton, 'Lose weight fast' + NL), STOPPED);
});
block('the same five-level chain from Anton\'s folder (the depth rule itself still holds)', B('bash "' + path.join(devScripts, 'step1.sh') + '"'));
launchedIn(devTree, () => allow('dev: launched in a worktree inside the checkout', devB('curl -s http://localhost:3000/', devTree)));
launchedIn(undefined, () => block('no launch folder known, standing in a checkout: a web request', web(devRepo)));
launchedIn(antonWork, () => block('launched in Anton\'s folder (outside the code folder): a web request', web(antonWork)));
launchedIn(repos, () => block('launched at the code folder itself: a web request', web(repos)));
{
  // A session could persist an environment variable for the next one (setx): none is read.
  process.env.GLOWMING_DEV_ROOTS = antonHome;
  try { launchedIn(antonWork, () => block('a persisted GLOWMING_DEV_ROOTS naming Anton\'s folder changes nothing', web(antonWork))); }
  finally { delete process.env.GLOWMING_DEV_ROOTS; }
}
launchedIn(campRepo, () => block('campaign repository: a web request', web(campRepo)));
launchedIn(path.join(campRepo, 'drafts'), () => block('campaign repository, a sub-folder: a web request', web(path.join(campRepo, 'drafts'))));
launchedIn(campTree, () => {
  block('a worktree made inside the campaign repository: a web request', web(campTree));
  block('a worktree made inside the campaign repository: hidden code', devB('node -e "console.log(eval(\'1+1\'))"', campTree));
});
launchedIn(campNotes, () => block('launched in a folder whose name says campaign: a web request', web(campNotes)));
launchedIn(campAlias, () => block('a junction with a neutral name into the campaign repository: a web request', web(campAlias)));
launchedIn(companyCode, () => block('a checkout inside a company folder: a web request', web(companyCode)));
{
  // A junction made at an absent C:\repos, leading to Anton's folder, is not a code folder.
  const reposLink = path.join(root, 'repos-link');
  fs.symlinkSync(antonHome, reposLink, 'junction');
  guard.setDevRootsForTests([reposLink]);
  try {
    launchedIn(antonWork, () => block('a junction as the code folder, leading to Anton\'s folder: a web request', web(antonWork)));
    launchedIn(path.join(reposLink, 'Work'), () => block('a launch through that junction: a web request', web(path.join(reposLink, 'Work'))));
  } finally { guard.setDevRootsForTests([repos]); }
}
{
  // A launch folder that is a junction: from inside the code folder leading out, or from outside leading in.
  const out = path.join(repos, 'jx');
  fs.symlinkSync(antonWork, out, 'junction');
  launchedIn(out, () => block('a launch folder in the code folder that is a junction leading out: a web request', web(out)));
  const into = path.join(antonHome, 'to-repos');
  fs.symlinkSync(devRepo, into, 'junction');
  launchedIn(into, () => block('a launch folder outside the code folder that is a junction leading in: a web request', web(into)));
}

// ---- 6. Outside a developer's checkout: no text exempted, and no new way past the rules (2026-10-03) --
// From Anton's folder, so the blanket rules apply in full. Exemptions for text (a TypeScript type-only
// import, a member .exec() were tried and dropped: a string or a file name can carry the same text.
const fpFile = (name, lines) => { const p = path.join(antonHome, name); fs.writeFileSync(p, lines.join(NL) + NL); return p; };
block('a TypeScript type-only import of node:http counts as on main',
  B('node "' + fpFile('types.ts', ['import type { IncomingMessage } from "node:http";', 'export const x = 1;']) + '"'));
block('a real import of node:http', B('node "' + fpFile('server.ts', ['import { createServer } from "node:http";', 'createServer().listen(8080);']) + '"'));
block('a command named inside a string that looks like a type import (Codex round 3)',
  B('node "' + fpFile('tpl.ts', ['const program = `import type {curl} from "x"`.split(/[{}]/)[1];', 'require("child_process").spawnSync(program, ["-X", "POST", "https://example.com/api", "-d", "enabled=true"]);']) + '"'));
block('a web request wrapped between echoed "import type {" and "} from" lines',
  B('echo "import type {"; curl -X POST -d x https://graph.facebook.com/v19.0/act_1/ads; echo \'} from "x"\''));
// Outside a developer's checkout a member exec( counts too: a file's name does not say what runs it.
block('outside a developer\'s checkout, a regex\'s .exec( still counts', B('node "' + fpFile('rx.js', ['const m = /a(b)/.exec("ab");', 'console.log(m);']) + '"'));
block('Codex\'s payload in a file named .js, run by Python', B('python "' + fpFile('payload.js', ['import builtins as b', 'b.exec(bytes.fromhex("7072696e74283432290a").decode())']) + '"'));
block('a bare exec( still is', B('python "' + fpFile('run.py', ['code = open("x.py").read()', 'exec(code)']) + '"'));
block('Python exec through an alias of builtins, in the command (Codex)',
  B('python -c "import builtins as b; b.exec(bytes.fromhex(\'7072696e74283432290a\').decode())"'));
block('Python exec through an alias of builtins, in a script', B('python "' + fpFile('alias.py', ['import builtins as b', 'b.exec(bytes.fromhex("7072696e74283432290a").decode())']) + '"'));
block('Python exec with a space before the bracket', B('python "' + fpFile('spaced.py', ['exec (open("x.py").read())']) + '"'));
block('a child process given a command decoded from hex', B('node "' + fpFile('hex.js', ['const c = Buffer.from(process.argv[2], "hex").toString();', 'require("child_process").execSync(c);']) + '"'));
block('a bare eval( still is', B('node "' + fpFile('ev.js', ['eval(process.argv[2]);']) + '"'));
block('eval reached through the global object', B('node "' + fpFile('gev.js', ['globalThis.eval(process.argv[2]);']) + '"'));
block('exec reached through the builtins', B('python "' + fpFile('bexec.py', ['import builtins', 'builtins.exec(open("x").read())']) + '"'));
block('a payload decoded with atob', B('node "' + fpFile('atob.js', ['const p = atob(process.argv[2]);', 'console.log(p);']) + '"'));
block('a payload decoded from a base64 Buffer', B('node "' + fpFile('buf.js', ['const p = Buffer.from(process.argv[2], "base64").toString();', 'console.log(p);']) + '"'));
block('code built with new Function', B('node "' + fpFile('fn.js', ['const f = new Function(process.argv[2]);', 'f();']) + '"'));
block('a payload decoded from a base64url Buffer', B('node "' + fpFile('bufu.js', ['const p = Buffer.from(process.argv[2], "base64url").toString();', 'console.log(p);']) + '"'));
// The script-name pattern is main's exactly: widening it changed how a quoted command is split, so a
// script main reads went unread (Codex round 4). The quoted command still has its script read:
block('a script named inside a quoted command beside a name the pattern does not know is still read (Codex round 4)',
  B('bash -c "python ' + fpFile('payload.py', ['import requests', 'requests.post("https://example.com/api")']).split(path.sep).join('/') + '; echo harmless.mts"'));
fs.rmSync(companyCode, { recursive: true, force: true });

fs.rmSync(calPy, { force: true });
// Nothing may be left behind for a later post.js run to act on.
post.verifyAll();
assert.strictEqual(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('glowming-snap-')).length, 0, 'no snapshot left behind'); passed++;
process.chdir(os.tmpdir()); // Windows cannot remove the folder a process stands in
fs.rmSync(root, { recursive: true, force: true });
console.log(passed + ' passed');
