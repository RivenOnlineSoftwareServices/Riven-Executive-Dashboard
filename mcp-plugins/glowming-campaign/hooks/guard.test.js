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
function makeXlsx(file, cells) {
  const sheet = '<?xml version="1.0"?><worksheet><sheetData>'
    + cells.map((c, i) => '<row r="' + (i + 1) + '"><c r="A' + (i + 1) + '" t="s"><v>' + i + '</v></c></row>').join('')
    + '</sheetData></worksheet>';
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst>' + cells.map((c) => '<si><t>' + c.replace(/&/g, '&amp;') + '</t></si>').join('') + '</sst>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
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
const LINK = 'https://glowming.co.za/pages/journey?utm_source=meta&utm_content=a5-b&utm_term=feed';
const LINK2 = 'https://glowming.co.za/pages/journey?utm_source=meta&utm_content=a5-c&utm_term=feed';

// ---- a folder laid out like Anton's synced folders --------------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-guard-'));
const base = path.join(root, 'Riven Online Software Services');
const shared = path.join(base, 'ROSS - Documents', '_Riven-Claude', 'Glowming Summer Campaign');
const camp = path.join(base, 'Glowming-SA Operations - Documents', 'SA Operations', 'Marketing', '2026 Summer Campaign');
const advert = path.join(camp, '01 Ready to post', 'Step 2 - Already know Glowming', 'A5 Journey starts Monday 5 or 19 October');
const plans = path.join(camp, '05 Plans and approvals');
const rulesDir = path.join(camp, '06 Competition rules');
for (const d of [path.join(shared, 'work', 'anton'), advert, plans, rulesDir]) fs.mkdirSync(d, { recursive: true });
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
const same = (k) => Buffer.compare(fs.readFileSync(files[k]), ORIGINAL[k]) === 0;

let passed = 0;
const allow = (why, ev) => { assert.strictEqual(decide(ev), null, 'should ALLOW: ' + why); passed++; };
const block = (why, ev) => { assert.notStrictEqual(decide(ev), null, 'should BLOCK: ' + why); passed++; };
const W = (p, content) => ({ tool_name: 'Write', tool_input: { file_path: p, content } });
const E = (p, o, n) => ({ tool_name: 'Edit', tool_input: { file_path: p, old_string: o, new_string: n } });
const B = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

/**
 * A shell command the guard may let run: decide() first; if allowed, do what the command
 * would do (effect), then run post.js. `outcome` checks the files afterwards.
 * Returns 'blocked', 'undone' (post.js reported and repaired) or 'kept'.
 */
function shell(why, ev, effect, expect) {
  const decision = decide(ev);
  let result = 'blocked';
  if (decision === null) {
    effect();
    result = post.verifyAll() === null ? 'kept' : 'undone';
  }
  const ok = Array.isArray(expect) ? expect.includes(result) : result === expect;
  assert.ok(ok, why + ': expected ' + expect + ', got ' + result + (decision ? ' (' + decision + ')' : ''));
  passed++;
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
shell('>> append onto a caption', B('printf "x" >> "' + files.caption + '"'), () => fs.appendFileSync(files.caption, 'x'), STOPPED);
assert.ok(same('caption'), 'caption back after the append'); passed++;
shell('Add-Content onto riaan.md', { tool_name: 'PowerShell', tool_input: { command: 'Add-Content "' + files.riaan + '" "x"' } }, () => fs.appendFileSync(files.riaan, 'x'), STOPPED);
shell('cp over a plan', B('cp /tmp/x.docx "' + files.plan + '"'), w('plan', 'other'), STOPPED);
shell('python os.open/os.write over the competition rules', B('python -c "import os; f=os.open(r\'' + files.rules + '\', os.O_WRONLY|os.O_TRUNC); os.write(f, b\'x\')"'), w('rules', 'x'), STOPPED);
shell('a delete the text did not reveal', B('python tidy.py ' + JSON.stringify(advert)), () => fs.rmSync(files.png), STOPPED);
{
  // The repair itself, checked byte for byte.
  decide(B('ls "' + advert + '"'));
  fs.writeFileSync(files.png, 'tampered');
  assert.notStrictEqual(post.verifyAll(), null, 'tampering is reported'); passed++;
  assert.ok(same('png'), 'the picture is back exactly'); passed++;
  reset();
  decide(B('ls "' + advert + '"'));
  fs.rmSync(files.png);
  assert.notStrictEqual(post.verifyAll(), null, 'a deletion is reported'); passed++;
  assert.ok(fs.existsSync(files.png) && same('png'), 'the deleted picture is back exactly'); passed++;
  reset();
}
shell('a new render saved by a script', B('python render.py "' + advert + '"'), () => fs.writeFileSync(path.join(advert, 'A5-B story 9x16 v3 2026-10-02.png'), 'new'), 'kept');
assert.ok(fs.existsSync(path.join(advert, 'A5-B story 9x16 v3 2026-10-02.png')), 'the new render stays'); passed++;
shell('a new file in the competition rules folder', B('python make.py "' + rulesDir + '"'), () => fs.writeFileSync(path.join(rulesDir, 'new.md'), 'x'), 'undone');
assert.ok(!fs.existsSync(path.join(rulesDir, 'new.md')), 'the forbidden new file is removed'); passed++;
shell('a caption headline changed by sed -i', B('sed -i "s/Old headline/New headline/" "' + files.caption + '"'), w('caption', caption.replace('Old headline', 'New headline')), 'kept');
shell('a caption tracking link changed by sed -i', B('sed -i "s/a5-b/a5-c/" "' + files.caption + '"'), w('caption', caption.split('a5-b').join('a5-c')), 'undone');
shell('a todo link changed by a script while a copy is kept', B('python t.py "' + shared + '"'), w('todo', '- [ ] a' + NL + '- [ ] post A5 with ' + LINK2 + NL + LINK + NL), 'undone');
shell('the calendar saved with its links in place', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', LINK, 'Tue 6 Oct']), 'kept');
shell('the calendar saved with a link lost', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', 'gone']), 'undone');
shell('the calendar saved with a link moved to another cell', B('python cal.py "' + files.calendar + '"'), () => makeXlsx(files.calendar, ['Mon 5 Oct', 'x', LINK]), 'undone');
shell('the calendar replaced by something that is not a workbook', B('python cal.py "' + files.calendar + '"'), w('calendar', 'junk'), 'undone');
shell('another workbook overwritten by the calendar script, from inside the folder', B('python "' + calPy + '"', camp), w('other', 'overwritten'), 'undone');
assert.ok(same('other'), 'the other workbook is back'); passed++;
shell('a stray new workbook in the campaign folder', B('python "' + calPy + '"', camp), () => fs.writeFileSync(path.join(camp, 'copy.xlsx'), 'x'), 'undone');
assert.ok(!fs.existsSync(path.join(camp, 'copy.xlsx')), 'the stray workbook is removed'); passed++;
assert.ok(calendarLinks.linksKept(calendarLinks.cellLinks(files.calendar), calendarLinks.cellLinks(files.calendar)), 'a calendar keeps its own links'); passed++;

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

fs.rmSync(calPy, { force: true });
// Nothing may be left behind for a later post.js run to act on.
post.verifyAll();
assert.strictEqual(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('glowming-snap-')).length, 0, 'no snapshot left behind'); passed++;
fs.rmSync(root, { recursive: true, force: true });
console.log(passed + ' passed');
