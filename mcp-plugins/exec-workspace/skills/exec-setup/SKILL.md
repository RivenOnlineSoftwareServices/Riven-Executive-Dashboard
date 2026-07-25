---
name: exec-setup
description: >-
  Guided Q&A install assistant for the Riven executive tools (Pulse + Collective).
  Use when a Riven executive says "help me set up the Riven exec tools", "install
  Pulse / Collective on my Claude", "set up the exec plugins", "configure my
  Pulse/Collective tokens", or "get me started with the Glowming exec tools".
  Walk them through it one question at a time, tailored to their setup — never
  assume their environment.
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
3. Install the **pulse** and **collective** plugins.
4. Configure tokens (Step 3), then reload the app.

**Claude Code (terminal):**
```
claude plugin marketplace add RivenOnlineSoftwareServices/Riven-Executive-Dashboard
claude plugin install pulse@riven-exec
claude plugin install collective@riven-exec
```
Then configure tokens (Step 3) and start a new session.

## Step 2 — confirm it installed

Have them check the two plugins appear (in-app: the plugins list; terminal:
`claude plugin list`). If an install failed, read the error with them — most
issues are a missing token config, not a broken install.

## Step 3 — tokens (ask what they already have)

Ask: *"Do you already have your two tokens, or should I point you to where to get
them?"* Each plugin holds its own token locally.

- **collective** → `gateway_token` = their scoped **exec** gateway token; leave
  `gateway_url` as `https://chat.glowming.business`. The token reaches Glowming
  knowledge + the personas only — never internal business data.
- **pulse** → `bearer_token` = the Pulse **dashboard-2026** bearer.

If they don't have them: the Business App has an **Exec Tools** page (Riven → Exec
Tools) that reveals the Collective token to anyone granted it, and a CEO can send
the Pulse bearer. Do not try to fetch tokens yourself — point them there.

## Step 4 — try it

Once configured, suggest a first use so they see it work:
- *"How's business this week?"* → fires the **pulse-brief** skill.
- *"Ask Heyu how we should position Pomegranate."* → fires **ask-collective**.

If a call returns an auth error, the token is wrong or unset — re-open the plugin
config and re-paste it. If it says a service is unavailable, the data may not have
landed yet (e.g. the weekly digest early in the week) — that is not a setup fault.

## If they get stuck

Name the specific thing that failed (install vs token vs a live call) and fix that
one thing. Don't restart the whole flow. When they're set up and a call returns
real data, you're done — tell them so plainly.
