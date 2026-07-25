---
name: ask-collective
description: >-
  Consult a Riven Collective persona in plain language and get an
  evidence-grounded answer. Use when an executive says "ask Heyu…", "what would
  Iris say about…", "get Zac's read on…", "check this with Alice", "what's the
  brand canon on…", "is this on-brand", "what does the research say about…", or
  otherwise wants a marketing (Heyu), research/evidence (Iris), design (Zac), or
  brand-canon (Alice) perspective. Routes the question through the deployed
  Collective retrieval gateway (mcp__collective__ask_persona) and answers from
  what it returns. Read-only; no local vault needed.
---

# Ask the Collective — executive persona pass-through

A thin bridge so an executive can consult a Collective persona without running
the full orchestrator or holding any keys. You (the assistant) pick the persona,
call `mcp__collective__ask_persona`, and answer **from the hits it returns** — in
that persona's lane and voice.

## Personas

| Persona | Lane — use when the exec wants… |
|---------|----------------------------------|
| `heyu`  | marketing strategy, positioning, copy angles, channel mix, campaign thinking |
| `iris`  | research, evidence, market/competitor intelligence, "what does the data say" |
| `zac`   | design / UI / UX / visual-system judgement |
| `alice` | brand canon — approved verbs/colours/claims, "is this on-brand", Glowming ops facts |

Pick the one that fits the question. If it genuinely spans two (e.g. "give me a
campaign AND check it's on-brand"), call the tool once per persona and combine.

## How to answer

1. Call `mcp__collective__ask_persona` with `{ persona, query }` (add `topN` up to
   10 for a broader pull; default is fine).
2. The tool returns **reranked evidence hits** (`{score, source_file, type, text}`)
   from that persona's namespaces — it is retrieval, not a finished answer. Read
   the hits and **synthesise** a short reply in the persona's lane.
3. Ground every claim in the returned hits. If the hits are thin or empty, say so
   plainly ("the Collective doesn't have material on that yet") rather than
   inventing a persona opinion. Never fabricate brand canon — if Alice returns
   nothing, it is not canon.

## Guardrails

- The exec token is **namespace-scoped at the gateway** — it cannot reach
  `business` or internal-only corpora, and it shouldn't try. Stick to the persona
  namespaces the tool already fans across.
- This is a pass-through, not a persona rewrite: don't add scope, refusals, or
  voice rules of your own beyond presenting the retrieved material in-lane. The
  authoritative persona definitions live in the Collective, not here.
- No em dashes in the reply. South African context; R / en-ZA where money appears.
