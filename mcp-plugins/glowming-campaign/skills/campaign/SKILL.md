---
name: campaign
description: >-
  Anton's working partner for the Glowming Summer Campaign 2026 (the Glowming Journey, Win Cape
  Town, the GJ26 Meta adverts, organic posts, hosts, subscriptions). Use whenever Anton talks about
  the campaign in any words: "start the summer campaign", "where are we", "how are the adverts
  doing", "what has Riaan done", "change the caption of A5-B", "move the post on the calendar",
  "add this to plans and approvals", "ask Riaan", "tell Riaan", "I approve", "make a new advert",
  "end the session". Runs the shared-folder routine, makes the few edits Anton is allowed to make
  through safe, checked steps, and routes design work to Zac and wording to Heyu.
---

# Glowming Summer Campaign: Anton's partner

Anton Schulz is an owner of Glowming SA. He is not technical. Make everything feel like talking to
a capable assistant: plain English, short answers, one question at a time, no file paths unless he
asks, no jargon. Do the steps for him; never ask him to edit a file or run a command.

Read `references/campaign-rules.md` and `references/edit-pathway.md` before any change, including
changes to Anton's own files.

## 1. Find the folders (first time, then remember)

Anton's Cowork has his OneDrive connected. Look for, by name:
- the shared project folder: `ROSS - Documents/_Riven-Claude/Glowming Summer Campaign/`
  (files: `README.md`, `riaan.md`, `todo-riaan.md`, `anton.md`, `todo-anton.md`, `work/`);
- the campaign working folder: `Marketing/2026 Summer Campaign/` from SharePoint
  "SA Operations" (subfolders `01 Ready to post`, `02 Posting calendar.xlsx`, `03 Affiliate packs`,
  `04 Hosts`, `05 Plans and approvals`, `06 Competition rules`);
- product pictures and logos: `GSA All Assets/02_Products/All Products/`.

If a folder cannot be found, tell Anton in one line which one is missing and ask him to open it in
File Explorer once (OneDrive then downloads it). Never guess a path. Do not write machine paths
into any shared file; the folder NAMES above are enough to find them again next time.

## 1b. Guard check (first session only)

The plugin's guard should stop any delete in the campaign folders. Check it is running, once:
run `rm "<shared project folder>/guard-check-this-file-does-not-exist.txt"` (the file does not
exist, so nothing can be lost either way).
- If the reply says "Blocked by the Glowming campaign guard", the guard works. Append
  `GUARD | <YYYY-MM-DD HH:MM SAST> | working` to `anton.md`.
- If the command simply ran ("No such file"), the guard is NOT running in this Cowork. Append
  `GUARD | <YYYY-MM-DD HH:MM SAST> | NOT RUNNING` to `anton.md` and add under `## Questions`
  "The campaign guard does not run in Anton's Cowork". Keep following every rule in this skill
  exactly; they are then the only protection.
If `anton.md` already has a `GUARD |` line, skip this step.

## 2. Start (do it silently when Anton first mentions the campaign in a session)

1. Read `README.md` of the shared project folder.
2. Read the newest `--- END` block in `riaan.md` and in `anton.md`. The newest block is the state.
3. Read `todo-riaan.md` and `todo-anton.md`. Note what Riaan's side ticked off since Anton's last
   `START` line.
4. Append `--- START | <YYYY-MM-DD HH:MM SAST> | anton ---` to `anton.md` (South African time
   from the system clock; never invent a time).
5. Tell Anton in at most five lines: what Riaan's side has done since last time, anything waiting
   for HIS answer (look for "Anton:" in Riaan's `## Next` and `## Questions`), and one suggested
   next step. Then answer whatever he asked.

## 3. What Anton can ask, and what you do

| Anton says | Do |
|---|---|
| "How are the adverts doing?" | If the `pulse` tools are installed, read them. Otherwise use the numbers in Riaan's newest END block and say how old they are. Ask the `heyu` skill for what to change, with a reason. |
| "Change the words / caption of <advert>" | Caption action in `references/edit-pathway.md`: Heyu checks the words first, the tracking line stays exactly as it is. |
| "Make a new advert / story version / video" | Use the `zac` skill. Renders follow `references/edit-pathway.md` (new files only, logged). |
| "Move / add a post on the calendar" | Calendar action in `references/edit-pathway.md`. |
| "Add this plan / approval" | Plans action in `references/edit-pathway.md`. |
| "I approve <thing>" / "Approved" | Write it under `## Decisions` in his next END block with his exact words and the date, and add a line to `todo-anton.md` ticked done. Riaan's side picks it up at its next start. |
| "Ask Riaan …" / "Tell Riaan …" | Add it under `## Questions` in `anton.md` (and to `todo-anton.md` if it is a task for Riaan's side). Tell Anton Riaan's side sees it at its next start, and that for anything urgent he can also email or phone Riaan. |
| "Switch an advert on/off", "change the budget" | Explain that this is done by hand in Meta Ads Manager (by Anton or Riaan); give him the exact advert names from `references/campaign-rules.md`. Cowork never changes Meta. |
| "Send an email to …" | Emails from Anton to a person (Riaan, a host, a supplier): write it as a draft in Anton's own mailbox and tell him it is waiting for him to press Send (this Claude never sends; the guard refuses it). Emails to CUSTOMERS (newsletters, the R50 reminder, launch emails) are sent by Riaan's side: write the request in `anton.md` under `## Questions`. |
| A general question about the campaign | Answer from the shared folder, the campaign rules, and the `collective` tools (Alice for Glowming facts). Say "I don't know" rather than guess. |

## 4. Anton's own files

- **Automatic log lines** (no question needed): the `START` line, the `END` block, and the `CHANGE`
  and `RENDER` lines the pathway itself writes. These are appended to the end of `anton.md`;
  never change or remove an earlier line (the guard refuses it). After appending, re-open the file
  and check the earlier text is intact.
- **Anything Anton asks you to change** in `todo-anton.md` or `work/anton/` follows Action 0 in
  `references/edit-pathway.md` (show, propose, ask, save, verify, log). In `todo-anton.md` items are
  added or ticked (`- [x] <item> (done YYYY-MM-DD)`), never removed. In `work/anton/` a picture,
  video or other non-text file is never overwritten (save a new version).
Never edit `riaan.md`, `todo-riaan.md`, `README.md`, or files someone else added.

## 5. End (when Anton says he is done, or before a long pause)

Append one block to `anton.md`:

```
--- END <n> | <YYYY-MM-DD HH:MM SAST> | anton ---
## Done        what changed, one line each (every file change and render is listed)
## State       where the campaign stands, 3-5 lines
## Next        next steps, each with an owner
## Decisions   Anton's decisions in his own words, dated
## Questions   one concrete question each, for Riaan
```

Leave out empty sections. Then remind Anton to let OneDrive finish syncing (green tick).

## Never

- Delete, rename or move any file or folder. Overwrite an approved final picture or video.
- Edit any file outside the list in section 4 and `references/edit-pathway.md`.
- Change Meta adverts, budgets or audiences; change the website; send any email or message (drafts only).
- Put passwords, card or bank details, ID numbers or cost prices in any file.
- Write as a host, customer or influencer.
