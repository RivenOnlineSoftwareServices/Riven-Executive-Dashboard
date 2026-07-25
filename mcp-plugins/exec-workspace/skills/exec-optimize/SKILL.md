---
name: exec-optimize
description: >-
  Guided clean-up and optimisation of a Riven executive's Claude Code workspace.
  Use when they say "clean up my Claude", "optimise my Claude Code", "tune my
  setup", "audit my Claude workspace", "make my Claude work like Riaan's", "check
  my plugins/skills/MCP", or "do a security sweep of my Claude". Audit their
  workspace across efficiency, skills + MCP, and security — one question at a
  time — and move them toward the proven Riven setup WITHOUT removing the work
  they have done. Always ask before changing anything.
---

# Exec Optimise — tune a Claude workspace toward the proven Riven setup

Help a Riven executive get their Claude Code close to the setup that works well
for the team, **without undoing anything they have built**. This is additive and
opt-in: you audit, you explain, you suggest, and you only change what they say yes
to. Go **one dimension at a time**, ask before acting, and keep their existing
plugins, skills, settings, and workflows intact unless they explicitly agree to a
change.

## Golden rules

- **Never remove their work.** Disabling beats deleting; suggesting beats doing.
  If something looks unused, ask before touching it — it may be theirs on purpose.
- **Ask, then act.** One question, wait for the answer, then the next step.
- **Respect their setup.** Fit into how they already work. Don't impose a workflow
  they didn't ask for.
- **Explain the why.** Each suggestion says what it improves (speed, cost, safety),
  so they can decide.
- **Secrets never enter the chat.** If you find a token/key in a config, do not
  print it — tell them where it is and that it should move to a secret store.

## Opening

Tell them what you'll do and let them pick where to start:

> "I'll look at your Claude setup across three areas — **efficiency** (unused or
> costly plugins/skills), **capabilities** (the review + Glowming tools), and
> **security** (secrets and permissions). I won't change anything without asking,
> and I won't remove your work. Where should I start, or shall I run all three?"

## Step 0 — map what's theirs FIRST (do this before any audit)

Before judging anything, find out what this Claude is already used for, so you
never mistake the executive's own work for clutter. **Ask:**

> "Before I look at anything — what else do you use this Claude for besides
> Glowming? Your own projects, a personal or business knowledge base, finance or
> admin tools, a vault, any MCPs you rely on? I'll treat all of that as yours and
> leave it alone."

Some Riven executives are **co-owners with substantial setups of their own** — a
separate vault, their own knowledge base (which correctly uses its OWN API keys,
isolated from Glowming's), and domain MCPs (property, finance, admin). **All of
that is theirs and stays.** Write down (for this session) what they name so that
when you hit an unfamiliar plugin, MCP, or key later, you already know it's their
tool, not something to clean up. When in doubt, it's theirs — ask, don't touch.

## Dimension 1 — Capabilities (the proven toolset)

The Riven setup leans on a small, high-leverage set. Check what they have
(`claude plugin list`, `claude plugin marketplace list`, and their MCP list) and
suggest — never force — the gaps:

- **A second review opinion (only if they have access).** A second model reviewing
  changes catches what one misses. The team uses **Codex** and **Gemini**, but
  those need their OWN accounts — Codex needs an OpenAI / ChatGPT sign-in, Gemini
  needs a Google AI Studio API key. **Ask first: "Do you have a ChatGPT/OpenAI or
  Google AI Studio account?"** If yes and they do code work, suggest adding the
  matching plugin. **If no, do not push it** — say it's optional, and that they can
  still get a second look by asking Claude to critique its own output against the
  failure case, or by pasting a diff into a second Claude conversation. Never make
  them feel they need a paid account they don't have.
- **The Glowming exec tools.** `pulse` (business numbers) + `collective` (ask the
  personas) from the `riven-exec` marketplace. If not installed, hand off to the
  **exec-setup** skill rather than repeating its steps.
- **MCPs that match their work.** Keep everything they named in Step 0 — their own
  knowledge base, property/finance/admin MCPs, and vault access are theirs. Only for
  an MCP that is connected, unfamiliar, AND that they don't recognise when asked,
  offer to disable it (each adds startup cost and surface area) — after asking.

## Dimension 2 — Efficiency (cost + clutter)

- **Token cost.** `claude plugin details <name>` shows a plugin's always-on and
  on-invoke token cost. Walk the list; for anything always-on that they never use,
  offer to **disable** it (not uninstall) so it's one toggle to bring back.
- **Duplicate / overlapping skills.** If two skills do the same job, suggest
  keeping the one they prefer and disabling the other. Ask first.
- **Model choice.** Confirm they're on a capable default model for real work, and
  that they know how to switch for quick vs. hard tasks. Don't change it for them.
- **Stale marketplaces.** A marketplace they no longer install from can be removed;
  confirm before removing.

## Dimension 3 — Security sweep

- **Secrets in configs.** Scan `settings.json` / plugin configs for anything that
  looks like a token, key, or password sitting in plaintext. If found, DO NOT print
  it — tell them it's there and that it belongs in a secret store / the plugin's own
  sensitive config, not a committed or plaintext file. The team's rule: reference
  secrets, never paste values.
  - **Separate keys are GOOD, not a problem.** If they keep their own knowledge base
    or domain data on its OWN API key (isolated from Glowming's), that is correct
    isolation — a leak of one key can't expose the other. Never suggest consolidating
    keys or flag a distinct key as a duplicate. The concern is plaintext exposure,
    not having more than one key.
- **Permission scope.** Review their allow/deny permission rules. Flag anything
  broad or auto-approving that could run risky commands without a prompt (e.g. a
  blanket allow on shell, or auto-approving network/file-deletion). Suggest
  tightening to the specific commands they actually rely on.
- **Hooks.** If they have hooks configured, confirm they know what each does — a
  hook runs on their machine automatically. Flag any that call out to the network
  or run unreviewed scripts.
- **Untrusted marketplaces/plugins.** Confirm each installed plugin comes from a
  source they trust. A plugin can ship hooks and MCP servers that run locally.

## Working principles worth adopting (offer, don't lecture)

These are the lightweight versions of how the team works — mention the ones that
fit, as habits, not rules:

- **Get a second look before you rely on something.** If you have a second review
  tool, use it; if not, ask Claude to argue against its own answer and test it
  against the case most likely to break. The point is a real second pass, not a
  specific paid tool.
- **Verify the effect, not the intent.** "It should work" isn't "it works" — run
  the thing against the real case.
- **Merged is not shipped.** A change isn't done until you've seen it work in the
  real place.
- **No shortcuts.** Fix the actual issue rather than silencing it.
- **Secrets by reference.** Keep keys in a store; never in chat, code, or plain files.

## Close

Summarise: what you checked, what they changed (only what they agreed to), and
what you left alone. End by confirming nothing of theirs was removed. If they want
to go deeper on any one area, do that area properly rather than a broad second pass.
