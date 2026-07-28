---
name: exec-setup
description: >-
  Guided Q&A install assistant for the Riven executive tools — all three plugins
  (Pulse, Collective and Exec Workspace). Use when a Riven executive says "help me
  set up the Riven exec tools", "install Pulse / Collective on my Claude", "set up
  the exec plugins", "configure my Pulse/Collective tokens", or "get me started
  with the Glowming exec tools". Walk them through it one question at a time,
  tailored to their setup — never assume their environment.
---

# Riven Exec Setup — guided install

You are helping a Riven executive install the exec tools on **their own Claude**.
Go **one step at a time**, ask before assuming, and respect whatever setup they
already have. This adds to their configuration; it never changes their existing
plugins, skills, or settings. Keep it friendly and short — an executive wants to
be done, not to read a manual.

## Golden rules

- **Ask, don't assume.** Confirm their environment and OS before giving commands.
- **Respect their setup.** If they already have a password manager, a token store,
  or a preferred way of doing things, fit into it. Never tell them to change
  unrelated settings.
- **One question, then wait.** Do not dump every step at once.
- **Never ask them to paste a token into the chat.** Tokens go into the plugin's
  own config, not into a conversation.

## Step 1 — which Claude are they using?

Ask: *"Which Claude are you setting up — Cowork, Claude Code in a terminal, or the
Claude Desktop app?"* Then follow the matching path.

**Cowork / Claude Desktop (in-app):**
1. Open the plugin marketplace settings (or type `/plugin marketplace add`).
2. Add the marketplace by repository: `RivenOnlineSoftwareServices/Riven-Executive-Dashboard`
3. Install the **pulse**, **collective** and **exec-workspace** plugins.
4. Configure tokens (Step 3), then reload the app.

> **If they ask why they are installing `exec-workspace` when this guide already
> came from it:** because right now it is running from a temporary or borrowed
> copy. Installing it puts it in *their* Claude permanently, so `exec-guide`,
> `exec-optimize` and `exec-remind` are there next week without anyone setting it
> up again. Worth saying before they ask — it looks redundant otherwise.

**Claude Code (terminal):**
```
claude plugin marketplace add RivenOnlineSoftwareServices/Riven-Executive-Dashboard
claude plugin install pulse@riven-exec
claude plugin install collective@riven-exec
claude plugin install exec-workspace@riven-exec
```
Then configure tokens (Step 3) and start a new session.

## Step 2 — confirm it installed

Have them check all three plugins appear (in-app: the plugins list; terminal:
`claude plugin list`). If an install failed, read the error with them.

**Read the actual error before assuming it is a token.**

All three plugins are now bundled in the marketplace repository itself, so an
install no longer depends on anyone's GitHub access or on being signed in to
anything. That removes the failure that used to block executives
entirely, so any older troubleshooting notes about GitHub access no longer
apply.

- **The marketplace itself will not add, or "sync failed"** → send Riaan the
  exact message. Do not have them retry repeatedly; a marketplace that cannot
  validate will not start working on the third attempt.

- **A plugin installs but a tool errors when you use it** — that is the token
  case (Step 3).

If only some plugins installed, that usually just means a step was skipped —
have them install the missing one rather than starting over.

## Step 3 — tokens (ask what they already have)

Ask: *"Do you already have your two tokens, or should I point you to where to get
them?"* Each plugin holds its own token locally.

- **collective** → `gateway_token` = their scoped **exec** gateway token. The
  token reaches Glowming knowledge + the personas only — never internal business
  data.
- **pulse** → `bearer_token` = their Pulse bearer.

**Only the token needs entering.** Each plugin also exposes `gateway_url` /
`base_url`, and those must be LEFT BLANK or left at their shown default: the
plugin declares the production default and the MCP server falls back to the same
value independently. Telling an exec to fill them in adds two fields, two chances
to mistype a URL, and the false impression that a missing URL is why a call
failed. **exec-workspace** takes no configuration at all.

### HOW they enter it — this differs by surface, and getting it wrong wastes their hour

- **Cowork / Claude Desktop:** enabling a plugin that declares config prompts for
  it — the field's title and help text are shown in a configuration dialog. Paste
  the token there. **If no dialog appears** for them, do NOT improvise a settings
  path: the exact in-app behaviour is not documented per-surface and I could not
  confirm Cowork's specifically, so tell them to stop and send Riaan a screenshot
  of what they DO see. That is a five-minute answer from him and an hour of
  guessing otherwise.
- **Claude Code (terminal):** the value is set **at install time** with
  `--config`, one flag per value:

  ```
  claude plugin install pulse@riven-exec --config bearer_token=<their token>
  claude plugin install collective@riven-exec --config gateway_token=<their token>
  claude plugin install exec-workspace@riven-exec
  ```

- ⚠️ **`claude plugin config` DOES NOT EXIST.** It is not a command; it reports an
  unknown command. If an exec was told to run it, that instruction was wrong —
  say so plainly and give them the `--config` form above. (An assistant told an
  exec exactly this on 2026-07-28, alongside a second wrong claim that the
  plugins' URLs needed "baking in" — they were already defaulted in both the
  manifest and the server.)
- **To CHANGE a token later:** re-run the install line for that plugin with the
  new value, or re-enter it in the in-app dialog. Non-sensitive values live in
  `~/.claude/settings.json` under `pluginConfigs`; tokens go to the OS keychain,
  so they are not editable in a text file.
- **Never put these in a project's `.claude/settings.json`.** `pluginConfigs`
  entries there are deliberately ignored, so a value placed in a repo silently
  does nothing.

**Where to get both:** the Business App **Exec Tools** page (Riven → Exec Tools)
dispenses BOTH tokens to any exec a CEO has granted `exec:token_dispense` — a
"Reveal my tokens" button shows the Collective gateway token and the Pulse bearer
to copy. Point them there. If a token shows "not provisioned", a CEO needs to add
it in the Business App; do not try to fetch tokens yourself.

## Step 4 — try it

Once configured, suggest a first use so they see it work:
- *"How's business this week?"* → fires the **pulse-brief** skill.
- *"Ask Heyu how we should position Pomegranate."* → fires **ask-collective**.

If a call returns an auth error, the token is wrong or unset — re-enter it the way
their surface allows (in-app dialog, or re-run the `--config` install line). If it
says a service is unavailable, the data may not have landed yet (e.g. the weekly
digest early in the week) — that is not a setup fault.

**If the plugin behaves as though it has no token even though one was entered,**
check the MCP server's stderr for a line reading `arrived as an UNSUBSTITUTED
placeholder`. That means the plugin runtime did not resolve the config value, and
it is OUR bug, not theirs — send Riaan the line. Background: until 2026-07-28
both `.mcp.json` files used `${PLUGIN_CONFIG_<key>}`, which Claude Code does not
implement (the real syntax is `${user_config.<key>}`), so no token or URL ever
reached either server on any surface. That is what blocked the first exec through
this flow. The guard now makes the same class of failure say so out loud instead
of looking like a bad token.

## If they get stuck

Name the specific thing that failed (install vs token vs a live call) and fix that
one thing. Don't restart the whole flow. When they're set up and a call returns
real data, you're done — tell them so plainly.
