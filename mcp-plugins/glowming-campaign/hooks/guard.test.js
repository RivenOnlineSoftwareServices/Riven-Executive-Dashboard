#!/usr/bin/env node
/**
 * Tests for guard.js against real files in a temporary folder laid out like the
 * synced campaign folders. Run: node hooks/guard.test.js
 * Each case states what would go wrong for Anton if it broke.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide } = require(process.env.GUARD_PATH || './guard.js');

const NL = String.fromCharCode(10);
const zlib = require('zlib');
const calendarLinks = require(path.join(__dirname, 'calendar-links.js'));

/** A minimal .xlsx-shaped zip (stored entries) whose shared strings hold the given cell texts. */
function makeXlsx(file, cells) {
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst>' + cells.map((c) => '<si><t>' + c.replace(/&/g, '&amp;') + '</t></si>').join('') + '</sst>'],
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-guard-'));
const base = path.join(root, 'Riven Online Software Services');
const shared = path.join(base, 'ROSS - Documents', '_Riven-Claude', 'Glowming Summer Campaign');
const camp = path.join(base, 'Glowming-SA Operations - Documents', 'SA Operations', 'Marketing', '2026 Summer Campaign');
const advert = path.join(camp, '01 Ready to post', 'Step 2 - Already know Glowming', 'A5 Journey starts Monday 5 or 19 October');
for (const d of [path.join(shared, 'work', 'anton'), advert, path.join(camp, '05 Plans and approvals'), path.join(camp, '06 Competition rules')]) {
  fs.mkdirSync(d, { recursive: true });
}
const caption = [
  'A5 Journey starts', '=================', '', 'CAPTION (post text):', 'Old post text.', '',
  'Headline:   Old headline', 'Short line: Old short', 'Button:     Sign up', '',
  'Approval status: Approved (Anton, 26 Sep 2026)', '',
  'LINK - paste the whole link into the post:',
  '  A5-B: paid    https://glowming.co.za/pages/journey?utm_source=meta&utm_content=a5-b&utm_term=feed', '',
  'English only. Hashtags: #GlowmingJourney.',
].join(NL) + NL;
const files = {
  anton: path.join(shared, 'anton.md'),
  riaan: path.join(shared, 'riaan.md'),
  todo: path.join(shared, 'todo-anton.md'),
  caption: path.join(advert, 'caption.txt'),
  png: path.join(advert, 'A5-B story 9x16.png'),
  plan: path.join(camp, '05 Plans and approvals', 'Ad plan.docx'),
  rules: path.join(camp, '06 Competition rules', 'rules.md'),
  calendar: path.join(camp, '02 Posting calendar.xlsx'),
  antonPng: path.join(shared, 'work', 'anton', 'old.png'),
};
fs.writeFileSync(files.anton, '# anton.md' + NL + '--- START | 2026-10-01 | anton ---' + NL);
fs.writeFileSync(files.riaan, '# riaan.md' + NL);
fs.writeFileSync(files.todo, '- [ ] a' + NL);
fs.writeFileSync(files.caption, caption);
fs.writeFileSync(files.png, 'x');
fs.writeFileSync(files.plan, 'x');
fs.writeFileSync(files.rules, 'x');
makeXlsx(files.calendar, ['Mon 5 Oct', LINK]);
fs.writeFileSync(files.antonPng, 'x');

let passed = 0;
const allow = (why, ev) => { assert.strictEqual(decide(ev), null, 'should ALLOW: ' + why); passed++; };
const block = (why, ev) => { assert.notStrictEqual(decide(ev), null, 'should BLOCK: ' + why); passed++; };
const W = (p, content) => ({ tool_name: 'Write', tool_input: { file_path: p, content } });
const E = (p, o, n) => ({ tool_name: 'Edit', tool_input: { file_path: p, old_string: o, new_string: n } });
const B = (command) => ({ tool_name: 'Bash', tool_input: { command } });
// Forward slashes, for paths placed inside a JS string in a node -e command.
const norm4 = (p) => p.split(path.sep).join('/');

// anton.md: append-only (his log is the record Riaan's side reads).
allow('append to anton.md', W(files.anton, fs.readFileSync(files.anton, 'utf8') + 'CHANGE | x' + NL));
block('rewrite anton.md', W(files.anton, '# anton.md' + NL));
allow('Edit that appends after the last line', E(files.anton, '--- START | 2026-10-01 | anton ---', '--- START | 2026-10-01 | anton ---' + NL + 'more'));
block('Edit that changes an earlier line', E(files.anton, '# anton.md', '# changed'));
allow('todo-anton.md edit', E(files.todo, '- [ ] a', '- [x] a (done 2026-10-01)'));
block('riaan.md is Riaan\'s file', W(files.riaan, 'x'));
block('README in the shared folder', W(path.join(shared, 'README.md'), 'x'));

// work/anton: new files fine; an existing picture is never replaced.
allow('new file in work/anton', W(path.join(shared, 'work', 'anton', 'notes.md'), 'x'));
block('overwrite a picture in work/anton', W(files.antonPng, 'y'));

// caption.txt: words may change, tracking may not.
allow('change the headline', E(files.caption, 'Headline:   Old headline', 'Headline:   New headline'));
allow('change the post text and approval status', W(files.caption, caption.replace('Old post text.', 'New text.').replace('Approved (Anton, 26 Sep 2026)', 'Changed (Anton, 1 Oct 2026)')));
block('change the tracking link', E(files.caption, 'utm_content=a5-b', 'utm_content=a5-c'));
block('change the title line', E(files.caption, 'A5 Journey starts', 'A5 Something else'));
block('drop the last line', W(files.caption, caption.replace('English only. Hashtags: #GlowmingJourney.' + NL, '')));
block('a NEW caption.txt (needs a code from Riaan)', W(path.join(advert, '..', 'caption.txt'), 'x'));

// Ready to post: new renders only.
allow('a new render file', W(path.join(advert, 'A5-B story 9x16 v2 2026-10-02.png'), 'x'));
block('overwrite an approved final', W(files.png, 'y'));

// Plans and approvals: add only.
allow('a new plan file', W(path.join(camp, '05 Plans and approvals', 'Ad plan v2.docx'), 'x'));
block('replace an existing plan', W(files.plan, 'y'));
block('the Write tool replacing the posting calendar', W(files.calendar, 'y'));
block('competition rules are read-only', W(files.rules, 'y'));
block('a folder that is not on the list', W(path.join(base, 'Finance', 'x.md'), 'x'));
allow('a temporary file outside company folders', W(path.join(os.tmpdir(), 'draft.txt'), 'x'));

// Shell: no delete / move / overwrite in company folders; reading is fine.
block('rm in the campaign folder', B('rm "' + files.png + '"'));
block('Remove-Item', B('Remove-Item "' + files.plan + '"'));
block('move a folder', B('mv "' + advert + '" /tmp/x'));
block('redirect over a file', B('echo hi > "' + files.caption + '"'));
block('python os.remove', B('python -c "import os; os.remove(r\'' + files.png + '\')"'));
allow('list a folder (with 2>&1)', B('ls "' + advert + '" 2>&1'));
allow('read a caption', B('cat "' + files.caption + '"'));
allow('rm outside company folders', B('rm /tmp/scratch.txt'));

// Connectors: delete / move / rename are blocked, reads are not.
block('SharePoint delete', { tool_name: 'mcp__m365__sharepoint_delete_item', tool_input: {} });
block('move a file through a connector', { tool_name: 'mcp__m365__sharepoint_move_item', tool_input: {} });
allow('search through a connector', { tool_name: 'mcp__m365__sharepoint_search', tool_input: {} });

// Round 2: path tricks, shell from inside the folder, script writes, connector effects.
block('.. out of work/anton onto riaan.md', W(path.join(shared, 'work', 'anton') + path.sep + '..' + path.sep + '..' + path.sep + 'riaan.md', 'x'));
block('relative path resolved against a company folder', { tool_name: 'Write', tool_input: { file_path: 'riaan.md', content: 'x' }, cwd: shared });
block('rm with the shell already inside the folder', { tool_name: 'Bash', tool_input: { command: 'rm caption.txt' }, cwd: advert });
block('python open(..., "w") on a caption', B('python -c "open(r\'' + files.caption + '\', \'w\').write(\'x\')"'));
block('cp over a plan', B('cp /tmp/x.docx "' + files.plan + '"'));
allow('a NEW .svg in work/anton', W(path.join(shared, 'work', 'anton', 'old.svg'), 'y'));
fs.writeFileSync(path.join(shared, 'work', 'anton', 'old.svg'), 'x');
block('overwrite an existing .svg in work/anton (exists)', W(path.join(shared, 'work', 'anton', 'old.svg'), 'y'));
fs.writeFileSync(path.join(shared, 'work', 'anton', 'notes2.md'), 'x');
allow('edit an existing text note in work/anton', W(path.join(shared, 'work', 'anton', 'notes2.md'), 'y'));
block('send mail through Outlook', { tool_name: 'mcp__ms365__outlook_send_mail', tool_input: {} });
block('reply (which sends) through Gmail', { tool_name: 'mcp__gmail__reply', tool_input: {} });
allow('create an email draft', { tool_name: 'mcp__ms365__outlook_create_draft', tool_input: {} });
allow('create a reply draft', { tool_name: 'mcp__ms365__outlook_create_reply_draft', tool_input: {} });
block('upload over a SharePoint file', { tool_name: 'mcp__ms365__sharepoint_upload_file', tool_input: {} });
block('Graph PATCH through Lokka', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: { method: 'patch' } });
allow('Graph GET through Lokka', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: { method: 'get' } });
allow('Magnific image generation', { tool_name: 'mcp__magnific__images_generate', tool_input: {} });
allow('Magnific upload of a source photo', { tool_name: 'mcp__magnific__creations_upload_image', tool_input: {} });
allow('Magnific stock download', { tool_name: 'mcp__magnific__stock_download', tool_input: {} });

// Round 3: the calendar may be saved but never deleted; scripts are judged by their contents;
// tracking links are protected in every editable text file.
block('rm the posting calendar', B('rm "' + files.calendar + '"'));
block('rename the posting calendar', B('mv "' + files.calendar + '" "' + files.calendar + '.old"'));
const evil = path.join(os.tmpdir(), 'gc-evil-' + process.pid + '.py');
fs.writeFileSync(evil, 'import os' + NL + 'os.remove(r"' + files.png + '")' + NL);
block('a script that deletes a company file', B('python "' + evil + '"'));
const overwrite = path.join(os.tmpdir(), 'gc-over-' + process.pid + '.py');
fs.writeFileSync(overwrite, 'open(r"' + files.caption + '", "w").write("x")' + NL);
block('a script that overwrites a caption', B('python ' + overwrite));
const calScript = path.join(os.tmpdir(), 'gc-cal-' + process.pid + '.py');
fs.writeFileSync(calScript, 'import openpyxl' + NL + 'wb = openpyxl.load_workbook(r"' + files.calendar + '")' + NL + 'wb.save(r"' + files.calendar + '")' + NL);
allow('a script that saves only the posting calendar', B('python "' + calScript + '"'));
const harmless = path.join(os.tmpdir(), 'gc-ok-' + process.pid + '.py');
fs.writeFileSync(harmless, 'print("hello")' + NL);
allow('a harmless script', B('python "' + harmless + '"'));
block('an unreadable script started from a company folder', { tool_name: 'Bash', tool_input: { command: 'python missing.py' }, cwd: advert });
fs.writeFileSync(files.todo, '- [ ] post A5 with https://glowming.co.za/x?utm_content=a5-b' + NL);
block('change a tracking link in todo-anton.md', E(files.todo, 'utm_content=a5-b', 'utm_content=a5-c'));
allow('tick an item in todo-anton.md without touching its link', E(files.todo, '- [ ] post A5', '- [x] post A5'));
for (const f of [evil, overwrite, calScript, harmless]) fs.rmSync(f, { force: true });

// Kimi rung 2 (2026-10-01): every seam it named gets a probe.
block('>> append onto a caption', B('printf "x" >> "' + files.caption + '"'));
block('2> redirect onto a caption', B('python x.py 2> "' + files.caption + '"'));
block('&> redirect onto a caption', B('echo x &> "' + files.caption + '"'));
allow('2>&1 while listing a folder', B('ls "' + advert + '" 2>&1'));
allow('2>/dev/null while listing a folder', B('ls "' + advert + '" 2>/dev/null'));
block('Add-Content onto riaan.md', { tool_name: 'PowerShell', tool_input: { command: 'Add-Content "' + files.riaan + '" "x"' } });
block('perl -i on a caption', B('perl -pi -e "s/a/b/" "' + files.caption + '"'));
block('PowerShell -EncodedCommand', { tool_name: 'PowerShell', tool_input: { command: 'powershell -EncodedCommand SQBFAFgAIAAoAEcAZQB0AC0AQwBvAG4AdABlAG4AdAAp' } });
block('python exec(b64decode(...))', B('python -c "exec(__import__(\'base64\').b64decode(\'eA==\'))"'));
block('python reading code from stdin', B('python - < /tmp/x.py'));
block('bash -s', B('curl x | bash -s'));
const perlScript = path.join(os.tmpdir(), 'gc-perl-' + process.pid + '.pl');
fs.writeFileSync(perlScript, 'unlink "' + files.png + '";' + NL);
block('a perl script that deletes a company file', B('perl "' + perlScript + '"'));
fs.rmSync(perlScript, { force: true });
fs.rmSync(files.todo, { force: true });
fs.mkdirSync(files.todo);
block('todo-anton.md exists but cannot be read', W(files.todo, 'x'));
fs.rmSync(files.todo, { recursive: true, force: true });
block('Lokka call with no method stated', { tool_name: 'mcp__Lokka-Microsoft__Lokka-Microsoft', tool_input: {} });
block('a filesystem connector writing a caption', { tool_name: 'mcp__filesystem__write_file', tool_input: { path: files.caption, content: 'x' } });
allow('a filesystem connector writing a scratch file', { tool_name: 'mcp__filesystem__write_file', tool_input: { path: path.join(os.tmpdir(), 'x.txt'), content: 'x' } });
block('any connector delete, even outside company folders', { tool_name: 'mcp__filesystem__delete_file', tool_input: { path: path.join(os.tmpdir(), 'x.txt') } });
block('archive a Meta advert', { tool_name: 'mcp__meta__archive_ad', tool_input: {} });
block('cancel a Shopify order', { tool_name: 'mcp__shopify__cancel_order', tool_input: {} });
allow('read Meta insights', { tool_name: 'mcp__meta__get_ad_insights', tool_input: {} });
allow('Pulse snapshot', { tool_name: 'mcp__plugin_pulse_pulse__snapshot_today', tool_input: {} });
{
  const before = process.cwd();
  process.chdir(advert);
  try { block('a shell command with no cwd sent, run from inside a company folder', { tool_name: 'Bash', tool_input: { command: 'rm caption.txt' } }); }
  finally { process.chdir(before); }
}
block('a shell tool with another name', { tool_name: 'Shell', tool_input: { command: 'rm "' + files.png + '"' } });
block('Approval status stamped Approved by Claude', W(files.caption, caption.replace('Approved (Anton, 26 Sep 2026)', 'Approved (Anton, 1 Oct 2026)')));
fs.mkdirSync(path.join(root, 'Users', 'anton', 'OneDrive', 'Documents'), { recursive: true });
allow('a scratch file under a personal OneDrive Documents folder', W(path.join(root, 'Users', 'anton', 'OneDrive', 'Documents', 'scratch.md'), 'x'));

// Codex round 4.
block('node fs.rmSync on a render', B('node -e "require(\'fs\').rmSync(\'' + norm4(files.png) + '\')"'));
block('node fs.unlinkSync on a render', B('node -e "require(\'fs\').unlinkSync(\'' + norm4(files.png) + '\')"'));
block('python open(calendar, "w") despite the calendar exception', B('python -c "open(r\'' + files.calendar + '\', \'w\').write(\'x\')"'));
block('calendar saved without openpyxl', B('python -c "import shutil; x.save(r\'' + files.calendar + '\')"'));
block('a relative caption path through a filesystem connector, from the advert folder', { tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'caption.txt', content: 'x' }, cwd: advert });
block('curl POST to the Meta API', B('curl -X POST "https://graph.facebook.com/v21.0/123/?status=PAUSED"'));
block('python requests.post to an email API', B('python -c "import requests; requests.post(\'https://api.resend.com/emails\', json={})"'));
block('any web request from the shell, even a read', B('curl -s https://glowming.co.za/'));
block('a shell-written draft with a weight-loss claim', B('echo "Lose weight fast with Glowming" > /tmp/draft.txt'));
block('a Magnific prompt with a detox claim', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'detox drink on a beach' } });
allow('a Magnific prompt without claims', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'sunset over Camps Bay, pouch on a table' } });
allow('a search that mentions a banned word (reading, not writing)', B('grep -n "detox" /tmp/notes.txt'));

// Codex round 5.
block('curl --json to an API', B('curl --json \'{"enabled":true}\' https://example.com/api/settings'));
block('python requests.get (any web request)', B('python -c "import requests; requests.get(\'https://example.com\')"'));
const sh = path.join(os.tmpdir(), 'gc-sh-' + process.pid + '.sh');
fs.writeFileSync(sh, 'printf x > "' + files.caption + '"' + NL);
block('a shell script redirecting into a caption', B('bash "' + sh + '"'));
fs.rmSync(sh, { force: true });
block('Magnific prompt with an appetite claim', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'drink that reduces your appetite' } });
block('Magnific prompt with a cravings claim', { tool_name: 'mcp__magnific__images_generate', tool_input: { prompt: 'controls cravings all day' } });
// The calendar: saved only by openpyxl naming the calendar, from anywhere, with its links kept.
const calOther = path.join(os.tmpdir(), 'gc-calo-' + process.pid + '.py');
fs.writeFileSync(calOther, 'import openpyxl' + NL + 'wb = openpyxl.load_workbook(r"' + files.calendar + '")' + NL + 'wb.save(r"' + path.join(advert, 'other.xlsx') + '")' + NL);
block('an openpyxl script saving to another file', B('python "' + calOther + '"'));
fs.rmSync(calOther, { force: true });
const calSide = path.join(os.tmpdir(), 'gc-cals-' + process.pid + '.py');
fs.writeFileSync(calSide, 'import openpyxl' + NL + 'wb = openpyxl.load_workbook("02 Posting calendar.xlsx")' + NL + 'wb.save("other.xlsx")' + NL);
block('from inside the folder, an openpyxl script saving the calendar under another name', { tool_name: 'Bash', tool_input: { command: 'python "' + calSide + '"' }, cwd: camp });
fs.rmSync(calSide, { force: true });
const calRel = path.join(os.tmpdir(), 'gc-calr-' + process.pid + '.py');
fs.writeFileSync(calRel, 'import openpyxl' + NL + 'calendar_path = "02 Posting calendar.xlsx"' + NL + 'wb = openpyxl.load_workbook(calendar_path)' + NL + 'wb.save(calendar_path)' + NL);
allow('saving the calendar from inside the campaign folder', { tool_name: 'Bash', tool_input: { command: 'python "' + calRel + '"' }, cwd: camp });
assert.strictEqual(calendarLinks.verifyAll(), null, 'links untouched: nothing to restore'); passed++;
fs.rmSync(calRel, { force: true });
const calLose = path.join(os.tmpdir(), 'gc-call-' + process.pid + '.py');
fs.writeFileSync(calLose, 'import openpyxl' + NL + 'wb = openpyxl.load_workbook(r"' + files.calendar + '")' + NL + 'wb.save(r"' + files.calendar + '")' + NL);
allow('an openpyxl calendar save is let through (links checked after)', B('python "' + calLose + '"'));
makeXlsx(files.calendar, ['Mon 5 Oct', 'link removed']);
assert.notStrictEqual(calendarLinks.verifyAll(), null, 'a lost link must be reported'); passed++;
assert.deepStrictEqual(calendarLinks.linksIn(files.calendar), [LINK], 'the earlier calendar is put back'); passed++;
fs.rmSync(calLose, { force: true });
fs.writeFileSync(files.calendar, 'not a workbook');
fs.writeFileSync(calLose, 'import openpyxl' + NL + 'wb = openpyxl.load_workbook(r"' + files.calendar + '")' + NL + 'wb.save(r"' + files.calendar + '")' + NL);
block('a calendar that cannot be read as a workbook', B('python "' + calLose + '"'));
fs.rmSync(calLose, { force: true });

fs.rmSync(root, { recursive: true, force: true });
console.log(passed + ' passed');
