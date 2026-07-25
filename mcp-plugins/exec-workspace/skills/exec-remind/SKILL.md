---
name: exec-remind
description: >-
  Create a dated reminder in the executive's OWN Microsoft To Do (their Microsoft
  365 account, shared via the business). Use when they say "remind me to X",
  "add to my to-do / todos", "put X on my list", "add a task", or name a deadline
  or date for something to do. Lightweight: it drops the item on their default
  Tasks list (or a list they name) with an optional due/reminder date. It is for
  time-bound personal reminders only — not dev tickets, not notes.
---

# Exec Remind — add to your Microsoft To Do

Put a reminder on the executive's **own** Microsoft To Do. They sign in as
themselves (Microsoft 365, shared through the business), so everything targets
`/me` — never a hard-coded user or list. Keep it light: title in, optional date,
done.

## When to fire

- *"remind me to X"*, *"add to my to-do: X"*, *"put X on my list"*, *"add a task: X"*
- *"... by Friday / tomorrow / end of month"* → set a date.
- Explicit list: *"add to my Work list: X"* → use that list.

Do NOT fire for: vague musings ("maybe I should…" — ask first), knowledge/notes
(that's not a reminder), or dev tickets. One reminder per clear ask.

## What you need connected

A Microsoft To Do / Graph tool in their Claude — either a **Lokka-Microsoft MCP**
or a **Microsoft 365 connector** signed in as them. If none is connected, say so
plainly and point them to connect Microsoft (they have M365 via the business);
do not try to work around it. Use whatever Microsoft tool IS available — this skill
is tool-agnostic; the Graph call below is the same regardless.

## How to create it

1. **Find the target list.** Default is their built-in Tasks list. Get lists with:
   ```
   GET /me/todo/lists
   ```
   Use the one whose `wellKnownListName` is `defaultList` (that's "Tasks"), or match
   `displayName` if they named a specific list. Cache nothing — look it up per run.
2. **Create the task** on that list:
   ```
   POST /me/todo/lists/{listId}/tasks
   {
     "title": "<short imperative title>",
     "body": { "content": "<optional context>", "contentType": "text" },
     "importance": "normal",
     "dueDateTime":      { "dateTime": "2026-07-30T09:00:00.0000000", "timeZone": "Africa/Johannesburg" },
     "reminderDateTime": { "dateTime": "2026-07-30T09:00:00.0000000", "timeZone": "Africa/Johannesburg" },
     "isReminderOn": true
   }
   ```
   - **title** — required, short (<80 chars), imperative ("Call Paul", not "Calling Paul").
   - **date fields** — include ONLY if they gave a date/time. Resolve "tomorrow" /
     "Friday" / "end of month" against today's date. Set `reminderDateTime` +
     `isReminderOn: true` when they want to be pinged; add `dueDateTime` for a
     deadline. Omit all date fields if none was given. Default time zone
     `Africa/Johannesburg` (SAST) unless they say otherwise.
   - **importance** — `high` only if they said urgent/important; otherwise `normal`.

## Confirm briefly

After it's created, one short line — no Graph dump:
```
Added to <list>: "<title>"
  Reminder: <date/time if set>
```

## Errors

- **401** → their Microsoft sign-in expired; ask them to reconnect the Microsoft tool.
- **403** → the connection lacks `Tasks.ReadWrite`; they need to re-consent to that scope.
- **404 on a list id** → re-fetch `GET /me/todo/lists`.
- **400** → usually a malformed date; use `YYYY-MM-DDTHH:MM:SS.0000000` + a separate `timeZone`.

## Keep it lightweight

- No topic routing, no personal list taxonomy — default Tasks list, or the one they
  name. That's the whole job.
- Don't create duplicates if they repeat themselves — offer to edit instead.
- Never delete a task without confirming.
