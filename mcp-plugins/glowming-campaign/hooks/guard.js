#!/usr/bin/env node
/**
 * glowming-campaign guard: a PreToolUse hook that checks every file write, shell
 * command and connector call against an ALLOW-LIST, using the files as they are
 * on disk. Riaan's ruling 2026-10-01: Anton may edit captions, the posting
 * calendar, plans and approvals and his own files, through a narrow path, and
 * nothing may break.
 *
 * Exit 0 = allow. Exit 2 = block (the stderr text is shown to Claude, which tells
 * Anton in plain words). Zero dependencies (Node 18+, already needed by the pulse
 * and collective plugins).
 *
 * The allow-list, inside the company folders:
 *   shared project folder  _Riven-Claude/Glowming Summer Campaign/
 *     anton.md             append only (existing text must stay exactly as it is)
 *     todo-anton.md        items added or ticked; tracking links never change
 *     work/anton/...       new files; existing plain-text files may change (tracking
 *                          links kept); any other existing file is never overwritten
 *   campaign folder        Marketing/2026 Summer Campaign/
 *     01 Ready to post/.../caption.txt   only if the title, LINK and tracking lines
 *                          and the last line stay identical, and Approval status
 *                          only ever becomes "Changed (Anton, <D Mon YYYY>)"
 *     01 Ready to post/...  any other file: NEW files only
 *     02 Posting calendar.xlsx           saved only by a script (openpyxl); never
 *                          written, deleted, moved or renamed by a file tool or shell
 *     05 Plans and approvals/...         NEW files only
 * Everything else inside the company folders is read-only. Files outside them
 * (temporary working files) are allowed.
 *
 * Known limits (stated in the README): a script that builds company paths at run
 * time with no folder name in its text; a Python module run with -m; anything if
 * Cowork does not run plugin hooks at all (the skills' own rules then apply, and
 * the campaign skill runs a canary to find out).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NL = String.fromCharCode(10);
const SHARED = '_riven-claude/glowming summer campaign/';
const CAMPAIGN = 'marketing/2026 summer campaign/';
// Any path containing one of these is inside a synced company folder. Bare "onedrive" is
// deliberately NOT here: with Known Folder Move, Documents and Desktop live under OneDrive,
// and scratch files there must stay writable (Kimi, 2026-10-01).
const PROTECTED_MARKERS = [
  'riven online software services',
  'titan international',
  '_riven-claude',
  '2026 summer campaign',
  'gsa all assets',
  'sa operations',
];
// Existing files in work/anton/ may change only if they are plain text; anything else gets a new version.
const EDITABLE_TEXT = /\.(md|txt|csv|json|html?)$/i;
const CALENDAR = '02 posting calendar.xlsx';

/**
 * The real absolute location of a path: '~' expanded, relative paths against the
 * session folder, '..' resolved, and the nearest existing folder's links followed,
 * so 'work/anton/../../riaan.md' is judged as riaan.md.
 */
function realLocation(p, cwd) {
  let s = String(p || '');
  if (s === '~' || s.startsWith('~/') || s.startsWith('~' + path.sep)) s = path.join(os.homedir(), s.slice(1));
  let abs = path.resolve(cwd || process.cwd(), s);
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
  return String(s).split(String.fromCharCode(13) + NL).join(NL);
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
  const lines = unify(text).split(NL);
  const locked = [];
  lines.forEach((l, i) => {
    if (i < 2 || /^LINK\b/.test(l) || /utm_|https?:\/\//i.test(l)) locked.push(l);
  });
  const last = lines.filter((l) => l.trim()).pop();
  if (last !== undefined) locked.push('LAST:' + last);
  return locked.join(NL);
}

function approvalLine(text) {
  return (unify(text).split(NL).find((l) => /^Approval status:/.test(l)) || '').trim();
}

/** Tracking links may be added, never altered or removed. Null = fine, else a reason. */
function keepsTracking(tool, input, current) {
  const next = resultingText(tool, input, current);
  if (next === null) return 'This change could not be checked against the tracking links. Re-read the file and try a smaller change.';
  // Every line that carries a link must survive, the only allowed change being a ticked box or an
  // added "(done <date>)". Comparing whole lines (as a multiset) means a link cannot be altered while a
  // copy of the old one is kept somewhere else, and a duplicate cannot quietly disappear (Codex r6).
  const shape = (l) => l.replace(/^(\s*)- \[[ xX]\]/, '$1- [ ]').replace(/\s*\(done \d{4}-\d{2}-\d{2}\)\s*$/, '').trimEnd();
  const linkLines = (t) => unify(t).split(NL).filter((l) => /utm_/i.test(l)).map(shape);
  const pool = new Map();
  for (const l of linkLines(next)) pool.set(l, (pool.get(l) || 0) + 1);
  for (const l of linkLines(current)) {
    if (!pool.get(l)) return 'Existing tracking links (utm_) never change. Leave those lines exactly as they are.';
    pool.set(l, pool.get(l) - 1);
  }
  return null;
}

const UNREADABLE = 'That file exists but could not be read (OneDrive may still be downloading it), so the change cannot be checked. Open the folder in File Explorer, wait for the green tick, and try again.';

/** Decide one file write. Returns null to allow, or a plain-English reason to block. */
function checkWrite(tool, input, cwd, before) {
  const given = input.file_path || input.notebook_path || '';
  if (!given) return null;
  const raw = realLocation(given, cwd);
  const np = norm(raw);
  if (!isProtected(np)) return null; // a temporary working file outside the company folders
  // A company file never GAINS a banned claim (owner rulings 2026-10-01). The RESULTING text is
  // judged, not the edit fragment: replacing "tx" with "tox" in "detx" makes "detox" (Codex r9).
  {
    const curNow = before ? before.current : (fs.existsSync(raw) ? readText(raw) : null);
    const after = resultingText(tool, input, curNow);
    const fragment = tool === 'Write' ? input.content
      : tool === 'MultiEdit' ? (input.edits || []).map((e) => e.new_string || '').join(NL)
        : (input.new_string || input.new_source || '');
    const approvals = approvedClaims(path.dirname(raw), cwd);
    const isLog = np.endsWith(SHARED + 'anton.md'); // (`after` is a local string in this block)
    const gained = (t) => {
      if (typeof t !== 'string') return false;
      const was = curNow ? unapprovedClaimCount(curNow, approvals, isLog) : 0;
      return unapprovedClaimCount(t, approvals, isLog) > was;
    };
    if (gained(after) || (after === null && typeof fragment === 'string' && unapprovedClaimCount(fragment, approvals, isLog) > 0)) {
      return CLAIM_REFUSAL;
    }
  }
  // `before` lets post.js judge a change a shell command already made, against the copy taken first.
  const exists = before ? before.exists : fs.existsSync(raw);
  const current = before ? before.current : (exists ? readText(raw) : null);

  const shared = after(np, SHARED);
  if (shared !== null) {
    if (shared === 'anton.md') {
      if (!exists) return null;
      if (current === null) return UNREADABLE;
      const next = resultingText(tool, input, current);
      if (next === null) return 'anton.md is append-only and this change could not be checked. Add the new lines at the end instead.';
      return unify(next).startsWith(unify(current)) ? null
        : 'anton.md is append-only: earlier lines may not change. Add the new lines at the end instead.';
    }
    if (shared === 'todo-anton.md') {
      if (!exists) return null;
      return current === null ? UNREADABLE : keepsTracking(tool, input, current);
    }
    if (shared.startsWith('work/anton/')) {
      if (!exists) return null;
      if (!EDITABLE_TEXT.test(np)) return 'That file already exists. Save the new one under a new name (next version number) instead.';
      return current === null ? UNREADABLE : keepsTracking(tool, input, current);
    }
    return 'Only anton.md, todo-anton.md and work/anton/ may be changed in the shared project folder. To change anything else, ask Riaan\'s side in anton.md under ## Questions.';
  }

  const camp = after(np, CAMPAIGN);
  if (camp !== null) {
    if (camp.startsWith('01 ready to post/')) {
      if (/\/caption\.txt$/.test(camp)) {
        if (!exists) return 'A new caption.txt needs a tracking code from Riaan\'s side. Ask in anton.md under ## Questions.';
        if (current === null) return UNREADABLE;
        const next = resultingText(tool, input, current);
        if (next === null) return 'This caption change could not be checked. Re-read caption.txt and change only the post text, Headline, Short line, Button or Approval status.';
        if (lockedCaptionLines(next) !== lockedCaptionLines(current)) {
          return 'The title, the LINK lines, the tracking links and the last line of caption.txt never change. Change only the post text, Headline, Short line, Button or Approval status.';
        }
        const was = approvalLine(current);
        const now = approvalLine(next);
        if (now !== was && !/^Approval status:\s*Changed \(Anton, \d{1,2} [A-Z][a-z]{2} \d{4}\)$/.test(now)) {
          return 'Approval status may only become "Changed (Anton, <D Mon YYYY>)". Approving is Anton\'s word, recorded in anton.md.';
        }
        return null;
      }
      return exists ? 'That file already exists in Ready to post. Save it as a NEW file with the next version number instead.' : null;
    }
    if (camp === CALENDAR) return 'The posting calendar is changed cell by cell through the campaign skill\'s calendar steps, never replaced as a whole file.';
    if (camp.startsWith('05 plans and approvals/')) {
      return exists ? 'Files in Plans and approvals are never replaced. Save it as a new file ("<name> v2") instead.' : null;
    }
    return 'That campaign folder is read-only from here. Ask Riaan\'s side in anton.md under ## Questions.';
  }

  return 'That folder is outside the campaign files this Claude may change. Ask Riaan\'s side in anton.md under ## Questions.';
}

// Deleting, moving or renaming: never in a company folder, the posting calendar included.
const REMOVE_SHELL = /(^|[\s;&|(])(rm|del|erase|rmdir|rd|mv|move|ren|rename|unlink|shred|truncate)(\s|$)|remove-item|move-item|rename-item|clear-content|robocopy|xcopy|rsync|shutil\.(rmtree|move)|os\.(remove|unlink|rename|replace|rmdir)|\.unlink\(|\.rename\(|\.rmdir\(|\b(rmsync|unlinksync|rmdirsync|renamesync)\b|\bfs\.(rm|unlink|rmdir|rename)\b|\bfs\.promises\.(rm|unlink|rmdir|rename)\b|git\s+(clean|checkout|reset|rm|mv)/i;
// Writing file contents from code (command text AND the scripts it runs).
const CODE_WRITE = /set-content|add-content|out-file|copy-item|open\([^)]*['"][wax]b?\+?['"]|write_(text|bytes)\(|\.save\(|\.to_(csv|excel)\(|writefile|appendfile|copyfile|createwritestream|\bfs\.(write|append|copy|cp)\w*|\btee\b|\bsed\s+-i|\bperl\s+-\w*i|\bdd\s+[^|;]*of=|\binstall\s|\bpatch\s|\bcp\s|\bcopy\s/i;
// Any web request from the shell or a script. Anton never needs one (connectors and web reading
// cover him), and every way of changing adverts, the shop or sending email would go through one,
// so the whole class is refused rather than guessing which methods write (Codex round 5).
const NET_CALL = /\b(curl|wget|iwr|irm|invoke-restmethod|invoke-webrequest)\b|\b(requests|httpx|aiohttp|urllib3?)\b|urlopen|http\.client|\bfetch\s*\(|\bwebsocket|\baxios\b|xmlhttprequest|\bsmtplib\b|\bsendmail\b|send_mail\(|net\.webclient|\bsocket\.|require\(\s*['"](node:)?(https?|http2|net|tls|dgram)['"]\s*\)|from\s+['"](node:)?(https?|http2|net|tls|dgram)['"]|\bhttps?\.(request|get)\(|graph\.facebook\.com|graph\.microsoft\.com|myshopify\.com|api\.resend\.com|api\.sendgrid\.com/i;
// Approved claims (Riaan's standing rule, 2026-10-01: "Yes it actually does override when coming
// from Anton"). Anton's explicit approval of EXACT words overrides the claim rules. His Claude
// records each approval as one appended line in anton.md:
//   CLAIM APPROVED | <YYYY-MM-DD HH:MM SAST> | "<the exact words>"
// A claim word is then allowed only inside a WHOLE approved sentence (sentence boundaries on both
// sides, so "Lose weight" never licenses "Lose weight twice as fast"; approvals under three words
// are ignored, so "app" cannot mask "appetite"). Anything else is still refused, so this Claude
// cannot introduce a LISTED claim word Anton did not approve word for word; unlisted wording is the
// stated residual gap (see RESIDUAL GAP below).
const APPROVAL_LINE = /^CLAIM APPROVED \|[^|]*\|\s*"(.+)"\s*$/;
// Wording the owners approved before this rule existed, live in the adverts (campaign-rules.md).
const BUILT_IN_APPROVALS = ['gut health, energy, immunity and skin glow', 'gut health · energy · immunity · skin glow'];
// ONE log, at its canonical place only: .../_Riven-Claude/Glowming Summer Campaign/anton.md.
const LOG_TAIL = ['_Riven-Claude', 'Glowming Summer Campaign', 'anton.md'];

/** The canonical anton.md: searched from the session folder first, then from `from`; or null. */
function campaignLog(from, cwd) {
  for (const start of [cwd || process.cwd(), from].filter(Boolean)) {
    let dir = path.resolve(start);
    for (let i = 0; i < 12; i++) {
      for (const p of [path.join(dir, 'ROSS - Documents', ...LOG_TAIL), path.join(dir, ...LOG_TAIL), path.join(dir, 'anton.md')]) {
        if (norm(p).endsWith(norm(LOG_TAIL.join('/'))) && fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** Lower case, CRLF unified, runs of spaces/tabs collapsed: the form approvals are matched in. */
function claimForm(s) {
  // Non-breaking and figure spaces (pasted from Word or Teams) count as spaces (Kimi, P3).
  return unify(String(s || '')).toLowerCase().replace(/[ \t\u00A0\u2007\u202F]+/g, ' ');
}

/** Every approved claim text (claim form, three words or more), built-in ones included. */
function approvedClaims(from, cwd) {
  const log = campaignLog(from, cwd);
  const text = log ? readText(log) : null;
  const recorded = text === null ? [] : unify(text).split(NL).map((l) => (l.trim().match(APPROVAL_LINE) || [])[1]);
  return BUILT_IN_APPROVALS.concat(recorded.filter(Boolean))
    .map((t) => claimForm(t).trim()); // split into sentences and the 3-word minimum: unapprovedClaimCount
}

// A line that starts a new field or item: "Short line: ...", "- ...", "• ...", "1. ...".
const FIELD_START = /^\s*([A-Za-z][A-Za-z ()/-]{0,30}:\s|[-•*·]\s|\d+[.)]\s)/;

/**
 * The sentence units of a text, each in claim form without quotes, labels or end punctuation.
 * A sentence ends ONLY at . ! ? (or the end). A line break does not end one unless the next line
 * starts a new field or item, and quotes never do (Codex PR #17 round 3, P1): an approval must
 * equal a WHOLE unit, so nothing before or after it can ride along.
 */
function sentenceUnits(text) {
  const lines = unify(String(text || '')).split(NL);
  const blocks = [];
  let heading = true; // a line ending in ':' ("CAPTION (post text):") is a heading: the next line starts anew
  for (const line of lines) {
    if (!line.trim()) { blocks.push(''); heading = true; continue; }
    if (heading || FIELD_START.test(line)) {
      // A "Label: " is judged as its OWN unit, never thrown away: "Detox: feel lighter." must
      // still count "detox", and "Weight loss: <approved>." must not ride on the approval (Kimi,
      // PR #17 rung 2, P1). Bullets and numbers carry no words, so only a label is kept.
      const m = line.match(FIELD_START);
      if (m && /:\s$/.test(m[1])) blocks.push(m[1].replace(/:\s$/, '') + '.');
      blocks.push(line.replace(FIELD_START, ''));
    } else blocks[blocks.length - 1] += ' ' + line;
    heading = /:\s*$/.test(line);
  }
  const units = [];
  for (const b of blocks) {
    for (const s of b.split(/(?<=[.!?]["”']?)\s+/)) {
      const u = claimForm(s).trim().replace(/^["“'”]+|["“'”]+$/g, '').replace(/[.!?]+["”']?$/, '').replace(/^["“'”]+|["“'”]+$/g, '').trim();
      if (u) units.push(u);
    }
  }
  return units;
}

/** How many claim words `text` holds OUTSIDE whole approved sentences. `isLog` skips approval lines. */
function unapprovedClaimCount(text, approvals, isLog) {
  let t = unify(String(text || ''));
  if (isLog) t = t.split(NL).filter((l) => !APPROVAL_LINE.test(l.trim())).join(NL);
  // Every approval is itself split into sentence units, so a multi-sentence approval approves each
  // of its sentences, and the order approvals were recorded in cannot matter (round 1, P2).
  const ok = new Set();
  for (const a of approvals) for (const u of sentenceUnits(a)) if (u.split(' ').length >= 3) ok.add(u);
  let n = 0;
  for (const u of sentenceUnits(t)) {
    if (ok.has(u)) continue;
    n += (u.match(new RegExp(BANNED_CLAIMS.source, 'gi')) || []).length
      + (u.match(new RegExp(BENEFIT_CLAIMS.source, 'gi')) || []).length;
  }
  return n;
}

/** Shell text judged per quoted string: echo "<approved sentence>" is that sentence, nothing more. */
function unapprovedShellClaims(cmd, approvals) {
  // A quoted string earns the approval exemption only when it STANDS ALONE: whitespace or the start
  // before it, and after it only an operator or the end. Adjacent strings ("A"" B" or "A" "B")
  // are joined by the shell into one sentence, so those are judged with NO approvals (Codex PR #17
  // round 4, P1).
  let n = 0;
  const src = String(cmd || '');
  const rest = src.replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g, (m, dq, sq, at) => {
    const before = src.slice(0, at);
    const after = src.slice(at + m.length);
    // ...and no shell structure is INFERRED at all (Codex PR #17 rounds 5-6: a leading argument,
    // then an escaped \; that looks like a separator): the exemption applies only when the WHOLE
    // command is exactly  echo|printf [flags] "<one string>" [> or >> one file]  - nothing else.
    const alone = /^\s*(echo|printf)(\s+-[A-Za-z]+)*\s+$/.test(before) && /^\s*(>>?\s*[^\s;&|<>`$(){}]+)?\s*$/.test(after);
    n += unapprovedClaimCount(dq !== undefined ? dq : sq, alone ? approvals : [], false);
    return ' ; ';
  });
  return n + unapprovedClaimCount(rest, approvals, false);
}

const CLAIM_REFUSAL = 'That text contains a health, benefit, weight-loss, detox, appetite, craving or cure claim that Anton has not approved word for word. Show Anton the exact sentence and the risk; only if he approves it, append CLAIM APPROVED | <date time SAST> | "<the exact sentence>" to anton.md first, then try again.';
// Health, benefit and medical wording beyond the banned list: new wording of this kind also needs
// Anton's recorded approval (it was the prompt hook's job before; Codex PR #17 round 1, P1).
const BENEFIT_CLAIMS = /\bgut\s+(health|cleans\w*)|\bbloat\w*|\bdigest(ion|ive)\b|\bimmun\w*|\benerg(y|ise|ize|ising|izing)\b|skin\s+glow|glowing\s+skin|anti[\s-]?(ageing|aging|inflammatory)|\b(prevents?|treats?|treatment\s+for)\b|\bdiabetes|\bdiseases?\b|blood\s+(sugar|pressure)|cholesterol|\bcleans(e|es|ing)\b|heart\s+health|\bjoint\s+(pain|health|support)|\b(pain|joint)\s+relief|relieves?\s+pain|\bsleep\s+(quality|better|aid|support)|better\s+sleep|\binsomnia|\banxiety|\bdepress(ion|ive)|\bhormon\w*|\bliver\b|\bkidney|\bhair\s+(growth|loss)|\bwrinkl\w*|\binflamm\w*|\bfertilit\w*|\bbrain\s+(health|function)|\bheal(th)?y\s+weight|\bcancer|\btumou?r|\brisk\s+of\b|\bbreathe\s+(easier|better)|\b(boosts?|improves?|supports?|reduces?|relieves?|strengthens?|protects?|restores?|lowers?|balances?|regulates?|calms?)\s+(your\s+)?(the\s+)?(body|health|immune|gut|skin|energy|metabolism|sleep|mood|focus|heart|joints?|bones?|hair|nails|liver|digestion|circulation|stress|anxiety|blood|cholesterol|hormones?|risk)\b/i;
// RESIDUAL GAP, stated plainly (PR #17): only LISTED words are enforced. A new claim worded with
// none of them (for example "Twice as fast." on its own line after an approved sentence, or a
// claim in words not listed here) is not caught by this guard; the heyu skill rule (Claude never
// PROPOSES a claim) is then the only line. A meaning-based check cannot be a type:prompt hook (it
// cannot read Anton's approvals, so it would veto exactly what the owner ruling allows). The
// follow-up is a command hook that reads anton.md and asks `claude -p` to classify sentences, or a
// type:agent hook, validated in Cowork 2.1.284 before it ships (BTM TASK-20261001-001,
// glowming-summer-campaign-2026).
// Claims never allowed in anything this Claude writes or generates (owner rulings, 2026-10-01),
// unless Anton approved the exact words (see approvedClaims above).
const BANNED_CLAIMS = /weight[\s-]?(loss|control|management)|\bslimming|\bslim\s+down|fat[\s-]?(loss|burn)|(lose|losing|burn|burns|burning|melt)\s+(the\s+)?(fat|kg|kilos?|weight)|belly\s+fat|\d+\s*kg\b|\bdetox|appetite|craving|\bmetaboli|\bcures?\b|\bheals?\b|clinically\s+proven/i;
// Shell scripts are judged for redirects too (Python and JS are not: ">" there is not a redirect).
const SHELL_SCRIPT = /\.(sh|bash|ps1|psm1|bat|cmd)$/i;
// Shell redirection into a file: > >> 2> 2>> &> &>>, but not 2>&1. Judged on the COMMAND only
// (scripts contain arrows and comparisons that are not redirects).
const REDIRECT = /(^|[^=\-<>])(&|\d)?>{1,2}(?![&>=])/;
// Code that hides what it runs: blocked everywhere, Anton never needs it.
const HIDDEN_CODE = /-e(nc|ncodedcommand)?\s+[a-z0-9+/=]{16,}|-encodedcommand|frombase64string|base64\s+(-d|--decode)|b64decode|\beval\(|\bexec\(|\biex\b|invoke-expression|(^|[\s;&|])(python3?|py|node|ruby|perl)\s+-(\s|$)|(^|[\s;&|])(python3?|py|node)\s*<|\b(bash|sh|zsh)\s+-s\b|-command\s+-(\s|$)|(^|[\s;&|(])(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)(\.exe)?\s*<|\|\s*(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd|python3?|py|node|ruby|perl|php)(\.exe)?(\s|$)/i;
const SCRIPT_FILE = /(?:"([^"]+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))"|'([^']+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php))'|([^\s'"]+\.(?:py|js|mjs|cjs|ts|ps1|psm1|sh|bash|bat|cmd|pl|rb|php)))(?=$|[\s;&|)\],}])/gi;

/**
 * The text of every script file a command runs, and of every script THOSE scripts name (three
 * levels deep, Codex round 8), so a script is judged by what it does. A script named deeper than
 * that counts as unreadable.
 */
function scriptsRun(cmd, cwd) {
  let text = '';
  let shellText = '';
  let unreadable = 0;
  let tooDeep = 0; // scripts the guard cannot fully read: more than three levels down, or over 500 KB
  const seen = new Set();
  let frontier = [cmd];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next = [];
    for (const src of frontier) {
      const re = new RegExp(SCRIPT_FILE.source, 'gi');
      let m;
      while ((m = re.exec(src)) !== null) {
        const file = m[1] || m[2] || m[3];
        const where = realLocation(file, cwd);
        if (seen.has(where)) continue;
        seen.add(where);
        if (depth === 3) { tooDeep++; continue; }
        const body = readText(where);
        if (body === null) { unreadable++; continue; }
        if (body.length > 500000) { tooDeep++; continue; }
        const part = body;
        text += NL + part;
        if (SHELL_SCRIPT.test(file)) shellText += NL + part;
        next.push(part);
      }
    }
    frontier = next;
  }
  return { text, shellText, unreadable, tooDeep };
}

/** Decide one shell command, including the scripts it runs. */
function checkBash(input, cwd, callId) {
  const cmd = String(input.command || '');
  if (HIDDEN_CODE.test(cmd)) {
    return 'Commands that hide or stream the code they run (encoded, eval/exec, stdin) are not allowed from this Claude. Write the script to a file first so it can be checked.';
  }
  const scripts = scriptsRun(cmd, cwd);
  if (scripts.tooDeep > 0) {
    return 'That chain of scripts is too deep or too large to check (more than three levels, or a script over 500 KB). Run the script directly.';
  }
  const full = cmd + scripts.text;
  // Paths that only RESOLVE into a company folder (a symlink, "../..") count as naming it (Codex r9).
  const named = foldersNamed(full, cwd, false);
  const nfull = norm(full) + (named.length ? NL + named.map(norm).join(NL) : '');
  const inFolder = isProtected(norm(cwd || ''));
  // Anywhere, not only near company folders: hidden code could make a web request or reach a
  // company file the guard never sees (Codex round 7).
  if (HIDDEN_CODE.test(scripts.text)) {
    return 'That script hides or streams the code it runs (eval/exec/encoded/stdin), so it cannot be checked. Write the code itself into the script.';
  }
  if ((isProtected(nfull) || inFolder) && REMOVE_SHELL.test(full)) {
    return 'Deleting, moving or renaming files in the company folders is not allowed, the posting calendar included.';
  }
  // Throwing output away (2>/dev/null, >nul) writes no company file.
  const discard = /(&|\d)?>{1,2}\s*(\/dev\/null|nul)\b/gi;
  const cmdNoDiscard = cmd.replace(discard, '');
  const shellNoDiscard = scripts.shellText.replace(discard, '');
  const redirects = REDIRECT.test(cmdNoDiscard) || REDIRECT.test(shellNoDiscard);
  if (NET_CALL.test(full)) {
    return 'Web requests from the shell or a script are not allowed from this Claude (adverts, the shop and email are never changed this way). Use a connector to read, or ask Riaan\'s side.';
  }
  if ((redirects || CODE_WRITE.test(full)) && unapprovedShellClaims(full, approvedClaims(null, cwd)) > 0) {
    return CLAIM_REFUSAL;
  }
  if (inFolder && scripts.unreadable > 0) {
    return 'A script was started from a company folder but could not be read, so it was blocked to be safe.';
  }
  // Writes are not guessed from the text (there is always one more way to write a file).
  // Instead every company folder the command names, and the folder it runs in, is copied
  // now; post.js compares afterwards and puts back or removes whatever the rules forbid.
  // A plain read (ls, cat, grep ... with no redirect and no script) needs no copy.
  if (!(isProtected(nfull) || inFolder)) return null;
  if (!scripts.text && !redirects && isReadOnly(cmdNoDiscard)) return null;
  return snapshotFolders(full, cwd, inFolder, callId);
}

// Commands that only read. Every part of a pipeline or chain must be one of these.
const READ_ONLY_PART = /^\s*(ls|dir|cat|type|head|tail|less|more|grep|egrep|rg|findstr|wc|stat|file|du|pwd|echo|printf|cut|tr|basename|dirname|realpath|readlink|test|true|get-childitem|gci|get-content|gc|select-string|test-path|get-item|measure-object|select-object|format-list|format-table|find(?![^|;&]*-(delete|exec|execdir|ok|fprint)))(\s|$)/i;
function isReadOnly(cmd) {
  const parts = cmd.split(/&&|\|\||[;|\n]/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => READ_ONLY_PART.test(p));
}

/** Every company folder a command or its scripts name (plus the folder it runs in). */
function foldersNamed(full, cwd, inFolder) {
  const dirs = new Set();
  if (inFolder) dirs.add(path.resolve(cwd));
  // Candidates: every piece between quotes and line breaks, and every whitespace token. A path
  // inside a quoted one-liner (python -c "open(r'...')") is its own piece once split on quotes.
  const pieces = new Set();
  for (const seg of full.split(/["'\n\r`]/)) {
    pieces.add(seg.trim());
    for (const t of seg.split(/[\s<>|;&(),]+/)) pieces.add(t);
  }
  for (const piece of pieces) {
    if (!piece) continue;
    // A relative path is judged by where it LEADS from the session folder ("../../riaan.md"),
    // not by whether its own text names a company folder (Codex round 8).
    const looksLikePath = /[\\/]/.test(piece) || /^\.\.?$/.test(piece) || /\.[a-z0-9]{1,5}$/i.test(piece);
    if (!isProtected(norm(piece)) && !(looksLikePath && piece.length < 1024 && isProtected(norm(realLocation(piece, cwd))))) continue;
    // Walk up from the named path to the nearest folder that exists: a file's folder, a glob's
    // folder, or the folder of a path followed by code.
    let p = realLocation(piece, cwd);
    let st = null;
    for (let i = 0; i < 40; i++) {
      try { st = fs.statSync(p); break; } catch (e) { st = null; }
      const parent = path.dirname(p);
      if (parent === p) break;
      p = parent;
    }
    if (!st) continue;
    if (!st.isDirectory()) p = path.dirname(p);
    if (isProtected(norm(p))) dirs.add(p);
  }
  return [...dirs];
}

const SNAP_LIMIT_BYTES = 400 * 1024 * 1024;
const SNAP_LIMIT_FILES = 5000;

/** Every file under a folder, at any depth. */
function walkFiles(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

/** The snapshot file names for one tool call (its id from the hook input, else a random one). */
function snapId(callId) {
  const clean = String(callId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return clean || crypto.randomBytes(8).toString('hex');
}

/**
 * Copy every file under every named company folder (all depths), for post.js to compare after
 * THIS tool call. Null = ok, else a reason to block.
 */
function snapshotFolders(full, cwd, inFolder, callId) {
  let dirs = foldersNamed(full, cwd, inFolder);
  if (!dirs.length) return null;
  // A folder inside another named folder is already covered by it.
  dirs = dirs.filter((d) => !dirs.some((o) => o !== d && norm(d).startsWith(norm(o).replace(/\/?$/, '/'))));
  const id = snapId(callId);
  const backupDir = path.join(os.tmpdir(), 'glowming-snap-' + id + '.d');
  const manifest = { cwd: path.resolve(cwd || process.cwd()), backupDir, created: Date.now(), dirs: [] };
  let total = 0;
  let n = 0;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const dir of dirs) {
      const entry = { dir, files: [] };
      for (const p of walkFiles(dir, [])) {
        const size = fs.statSync(p).size;
        total += size;
        if (total > SNAP_LIMIT_BYTES || n >= SNAP_LIMIT_FILES) {
          throw new Error('too much to protect at once (over 400 MB or 5000 files); run it from the advert\'s own folder');
        }
        const buf = fs.readFileSync(p);
        const backup = path.join(backupDir, String(n++));
        fs.writeFileSync(backup, buf);
        entry.files.push({ path: p, sha1: sha1(buf), backup });
      }
      manifest.dirs.push(entry);
    }
    fs.writeFileSync(path.join(os.tmpdir(), 'glowming-snap-' + id + '.json'), JSON.stringify(manifest));
  } catch (e) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    return 'The company files this command touches could not be copied first (' + e.message + '), so it was blocked. Check OneDrive has finished syncing.';
  }
  return null;
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function isTextFile(np) {
  return EDITABLE_TEXT.test(np) || /\/caption\.txt$/.test(np);
}

/** May a NEW file appear at p? Null = yes, else the reason (the same rules as the file tools). */
function checkNewFile(p, cwd) {
  return checkWrite('Write', { file_path: p, content: '' }, cwd, { exists: false, current: null });
}

// Servers whose actions change nothing in Glowming's own systems (owner ruling: Anton renders on Magnific).
const SAFE_SERVERS = /^(magnific|pulse|collective)|[_-](magnific|pulse|collective)($|[_-])/;
const READ_ACTION = /(^|_)(get|list|search|read|fetch|retrieve|download|query|insights?|describe|show|find|view|status|stats|lookup|preview|count|check)($|_)|_info$/;

/** Every string value in a connector call, for spotting company paths in its arguments. */
function stringsIn(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) stringsIn(v[k], out);
  return out;
}

/** Decide one connector (MCP) call. */
function checkMcp(tool, input, cwd) {
  // mcp__<server>__<action>: the server says WHOSE system it is, the action says what it does.
  const parts = tool.toLowerCase().split('__');
  const server = parts.length > 2 ? parts.slice(1, -1).join('__') : '';
  const act = parts[parts.length - 1];
  if (/(delete|trash|remove|move|rename|purge|empty)/.test(act)) {
    return 'Deleting, moving or renaming through a connector is not allowed from this Claude. Ask Riaan\'s side if something must go.';
  }
  const strings = stringsIn(input, []);
  if (!READ_ACTION.test(act) && unapprovedClaimCount(strings.join(NL), approvedClaims(null, cwd), false) > 0) {
    return CLAIM_REFUSAL;
  }
  if (SAFE_SERVERS.test(server)) return null;
  // A generic Graph caller names no verb: only an explicit GET is a read.
  if (/lokka|graph/.test(server) || /lokka/.test(act)) {
    return String((input && input.method) || '').toLowerCase() === 'get' ? null
      : 'Only reading from Microsoft 365 is allowed from this Claude (could not confirm this call is a read).';
  }
  if (READ_ACTION.test(act)) return null;
  if (/draft/.test(act) && !/send/.test(act)) return null;
  const company = /(sharepoint|onedrive|outlook|mail|gmail|teams|calendar|microsoft|m365|meta|facebook|instagram|shopify|ads?($|[_-]))/.test(server + ' ' + act);
  if (company) {
    if (/(send|forward|reply|respond)/.test(act)) return 'This Claude writes emails and messages as drafts only; Anton presses Send himself.';
    return 'Changing files, adverts, the shop or settings through a connector is not allowed from this Claude. Use the checked steps, or ask Riaan\'s side.';
  }
  // Any other server: a non-read call whose arguments name a company folder, or a path that
  // RESOLVES into one from the session folder, is judged like a file write and refused.
  const looksLikePath = (s) => /[\\/]/.test(s) || /\.[a-z0-9]{1,5}$/i.test(s);
  if (strings.some((s) => isProtected(norm(s)) || (looksLikePath(s) && s.length < 1024 && isProtected(norm(realLocation(s, cwd)))))) {
    return 'That connector call would touch the company folders. Use the campaign skill\'s checked steps instead.';
  }
  return null;
}

function decide(event) {
  const tool = String(event.tool_name || '');
  const input = event.tool_input || {};
  const cwd = event.cwd || process.cwd();
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return checkWrite(tool, input, cwd);
  if (tool.startsWith('mcp__')) return checkMcp(tool, input, cwd);
  if (typeof input.command === 'string') return checkBash(input, cwd, event.tool_use_id);
  return null;
}

module.exports = { decide, checkWrite, checkNewFile, isTextFile, norm, sha1, walkFiles, snapId, CALENDAR, BANNED_CLAIMS, approvedClaims, unapprovedClaimCount, unapprovedShellClaims, sentenceUnits };

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
