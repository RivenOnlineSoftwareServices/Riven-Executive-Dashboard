# The edit pathway: the only changes Anton's Cowork makes to shared campaign files

Riaan's ruling (1 Oct 2026): Anton is an owner and may change captions, the posting calendar and
the plans and approvals folder, through a narrow, safe path, because he is not technical. Every
action below follows the same five steps:

1. **Show** Anton what is there now (the exact current text or row).
2. **Propose** the change and show it next to the old version.
3. **Check** it (the checks listed per action). If a check fails, say which and offer a fix.
4. **Ask** "Shall I save this?" and wait for his yes.
5. **Save and log**: make the change, re-open the file to confirm it saved, and add a line to
   `anton.md`: `CHANGE | <YYYY-MM-DD HH:MM SAST> | <file> | <what changed> | before: "<old>" | after: "<new>"`.

Undo: SharePoint keeps every earlier version (right-click the file > Version history). Tell Anton
this whenever he worries about a change.

If anything is unclear, or a file looks different from what is described here, stop and ask
Anton, or add a question for Riaan in `anton.md`. Do not improvise.

## Action 0: Anton's own to-do list and work folder

Files: `todo-anton.md`, and files under `work/anton/` in the shared project folder.

- Follow the five steps above for every change Anton asks for.
- `todo-anton.md`: add an item or tick one; never delete an item or rewrite someone's words.
- `work/anton/`: new files any time; an existing text file (notes, drafts) may change; a picture,
  video, PDF or other non-text file is never overwritten: save the next version instead.

## Action 1: change a caption

File: `01 Ready to post/<Step folder>/<advert folder>/caption.txt`.

A caption file has this shape:
```
<CODE> <name>
=============
CAPTION (post text):
<the post text>

Headline:   <headline>
Short line: <short line>
Button:     <button>

Approval status: <status>

LINK - paste the whole link into the post (...):
  <CODE>: paid    https://glowming.co.za/...utm_content=<code>...
  ...
English only. Hashtags: ...
```

- Only the post text and the `Headline:`, `Short line:`, `Button:` and `Approval status:` values
  may change. `Approval status:` changes only as described below.
- The `LINK` lines, the title lines and the last line are never changed. Before saving, compare
  them with the old file character by character; if any differ, do not save.
- `Approval status:` becomes `Changed (Anton, <D Mon YYYY>)`.
- Checks: run the `heyu` skill's compliance gate on every new or changed line (must PASS); the
  banned headlines and wording rules in `campaign-rules.md`; English only; no em dashes.
- Remind Anton: changing the caption file does NOT change a live Meta advert. If the advert is
  live, the same words must also be changed in Ads Manager by hand; offer to list exactly what to
  paste where.

## Action 2: the posting calendar

File: `02 Posting calendar.xlsx`.

- Allowed: change a cell in an existing row (date, owner, status, notes); add a new row at the end
  of the table in the same format.
- Never: delete a row, column or sheet; change a column heading; sort or re-order the sheet; change
  formulas.
- Checks: dates are real dates between 25 Sep and 30 Nov 2026; an advert code named in a row
  has a folder under `01 Ready to post` (the folder names are the only list of codes); the owner
  is a person's name.
- How: write a short Python script to a file that sets `calendar_path` to the calendar, runs
  `wb = openpyxl.load_workbook(calendar_path)`, changes only the cells agreed in step 4, and ends
  with `wb.save(calendar_path)`; then run it. No other write may be in that script, and no web
  request. The guard refuses any other way of saving the calendar, refuses deleting, moving or
  renaming it, and puts the earlier calendar back if a save lost a tracking link.
- Never change an existing "Link used" cell: tracking links are never altered.
- If the workbook is open elsewhere or locked, stop and tell Anton; do not save a copy instead.

## Action 3: plans and approvals

Folder: `05 Plans and approvals/`.

- Allowed: add a NEW file. If a file of that name exists, save the new one as `<name> v2` (v3, ...).
- Never: edit or replace a file that is already there; delete anything.
- Approvals written by Anton are dated and use his own words.

## Action 4: save a render (from the `zac` skill)

Folder: the advert's own folder under `01 Ready to post/<Step folder>/<advert folder>/`, or
`work/anton/renders/` in the shared project folder for work that is not for a specific advert.

- Always a NEW file, named `<CODE> <size> v<N> <YYYY-MM-DD>` (for example
  `A5-B story 9x16 v2 2026-10-02.png`). Never overwrite an existing picture or video.
- Log every Magnific render in `anton.md`:
  `RENDER | <YYYY-MM-DD HH:MM SAST> | <advert code> | <model> | <credits> | <prompt>`.
- A new render is not "approved" until Anton says so; then record his words under `## Decisions`.

## Everything else

Read-only. If Anton asks for a change elsewhere (the website, Meta, emails to customers, Riaan's
files, the README, competition rules), write it as a request to Riaan's side in `anton.md` under
`## Questions` and tell Anton it is with Riaan. Anton's own emails to a person follow the email
row in `SKILL.md` (a draft that Anton sends himself).
