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

**Read the actual error before assuming it is a token.** There are two very
different failures and they need opposite fixes:

- **`pulse` fails while downloading**, with a message about not being able to
  read a repository, or a prompt for a GitHub username and password. This is not
  a token problem and changing tokens will not fix it. Pulse is downloaded from a
  **private** GitHub repository, so it needs two separate things: their GitHub
  account must have been given access to it, **and** their laptop must be signed
  in to GitHub.

  **Do not ask them whether they are signed in — test it.** Asking is unreliable:
  someone whose browser is logged into GitHub will honestly answer "yes" while
  the thing doing the download is not signed in at all. Those are two different
  sign-ins and only one of them matters here.

  Have them run this and tell you *exactly* what comes back:

  ```
  git ls-remote https://github.com/RivenOnlineSoftwareServices/Glowming-Pulse
  ```

  - **A long list of letters-and-numbers lines** → the download works, so the
    original failure was something else. Go back and re-read that error.
  - **A sign-in window opens, or it asks for a username and password** → not
    signed in on this machine. Have them complete that sign-in (on Windows and
    Mac a GitHub sign-in page opens in the browser; approve it there), then
    retry the install. They can do this themselves.
  - **"Repository not found", or it fails immediately without asking for
    anything** → their GitHub account has not been given access. **This one goes
    to Riaan.** GitHub deliberately says "not found" rather than "no access" for
    private repositories, so this is the same message someone would see if the
    repo did not exist — it is not a mistake on their part.

  Note the asymmetry deliberately: a sign-in they can fix in two minutes, an
  access grant only Riaan can. Guessing wrong in either direction wastes
  somebody's afternoon.

  If `git` is not installed on their machine at all, that is its own answer —
  route to Riaan, because the terminal install path needs it.

- **A plugin installs but a tool errors when you use it** — that is the token
  case (Step 3).

If `pulse` fails while `collective` and `exec-workspace` install fine, that is a
useful clue rather than a diagnosis: those two come from the public marketplace
repository and are not affected by private-repo access. But two-of-three can also
just mean a step was skipped or a different error was hit — so still read the
error text rather than concluding from the count.

## Step 3 — tokens (ask what they already have)

Ask: *"Do you already have your two tokens, or should I point you to where to get
them?"* Each plugin holds its own token locally.

- **collective** → `gateway_token` = their scoped **exec** gateway token; leave
  `gateway_url` as `https://chat.glowming.business`. The token reaches Glowming
  knowledge + the personas only — never internal business data.
- **pulse** → `bearer_token` = their Pulse bearer.

**Where to get both:** the Business App **Exec Tools** page (Riven → Exec Tools)
dispenses BOTH tokens to any exec a CEO has granted `exec:token_dispense` — a
"Reveal my tokens" button shows the Collective gateway token and the Pulse bearer
to copy. Point them there. If a token shows "not provisioned", a CEO needs to add
it in the Business App; do not try to fetch tokens yourself.

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
