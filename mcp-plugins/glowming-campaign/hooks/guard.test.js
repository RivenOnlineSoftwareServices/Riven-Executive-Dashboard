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
fs.writeFileSync(files.calendar, 'x');
fs.writeFileSync(files.antonPng, 'x');

let passed = 0;
const allow = (why, ev) => { assert.strictEqual(decide(ev), null, 'should ALLOW: ' + why); passed++; };
const block = (why, ev) => { assert.notStrictEqual(decide(ev), null, 'should BLOCK: ' + why); passed++; };
const W = (p, content) => ({ tool_name: 'Write', tool_input: { file_path: p, content } });
const E = (p, o, n) => ({ tool_name: 'Edit', tool_input: { file_path: p, old_string: o, new_string: n } });
const B = (command) => ({ tool_name: 'Bash', tool_input: { command } });

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
allow('the posting calendar', W(files.calendar, 'y'));
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
block('.. out of work/anton onto riaan.md', W(path.join(shared, 'work', 'anton', '..', '..', 'riaan.md'), 'x'));
block('relative path resolved against a company folder', { tool_name: 'Write', tool_input: { file_path: 'riaan.md', content: 'x' }, cwd: shared });
block('rm with the shell already inside the folder', { tool_name: 'Bash', tool_input: { command: 'rm caption.txt' }, cwd: advert });
block('python open(..., "w") on a caption', B('python -c "open(r\'' + files.caption + '\', \'w\').write(\'x\')"'));
block('cp over a plan', B('cp /tmp/x.docx "' + files.plan + '"'));
allow('a script saving the posting calendar', B('python edit_calendar.py && python -c "wb.save(r\'' + files.calendar + '\')"'));
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

fs.rmSync(root, { recursive: true, force: true });
console.log(passed + ' passed');
