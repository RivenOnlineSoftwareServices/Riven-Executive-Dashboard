---
name: pulse-brief
description: >-
  Plain-English executive briefing over Glowming Pulse. Use when a Riven
  executive asks about business performance in ordinary language — "how's
  business", "how are sales / orders", "how was this week", "what's selling",
  "where are we losing sales / what's leaking in the funnel", "how's our
  reputation / reviews", "what's our ad spend / ROAS", "what changed week on
  week". Turns those questions into the right Glowming Pulse MCP calls
  (mcp__pulse__snapshot_today / digest_this_week / mart / mart_meta) and answers
  with the actual numbers — no need to know mart names. Read-only.
---

# Pulse Brief — executive briefing over Glowming Pulse

This skill lets an executive ask about the business in plain English and get a
grounded answer from **live Glowming Pulse data**. It sits on top of the `pulse`
MCP server (same plugin). You (the assistant) map the question to the right
tool call(s), read the returned `{data, meta}` envelope, and answer in a short,
number-led way.

**Never invent figures.** Every number in your answer must come from a Pulse
tool call in the current turn. If a call fails or returns no data, say so plainly
(e.g. "the weekly digest hasn't been generated yet") rather than estimating.

## The tools you have

| Tool | Returns |
|---|---|
| `mcp__pulse__snapshot_today` | Yesterday's KPIs + a short narrative (daily snapshot). |
| `mcp__pulse__digest_this_week` | The weekly executive digest markdown (Mon–Sun). 503 until the week's digest exists. |
| `mcp__pulse__mart` (`name`, `limit?`) | Rows of one materialised mart. |
| `mcp__pulse__mart_meta` (`name`) | Freshness of a mart (last refresh status, age, rows, data_through_ts). |

The nine marts: `daily_snapshot`, `checkout_funnel`, `customer_clv`,
`inventory_health`, `abandoned_recovery`, `ad_performance`,
`product_performance`, `product_quality`, `review_velocity`.

## Question → call mapping

| The exec asks… | Do this |
|---|---|
| "How's business / how are sales / orders?" | `snapshot_today`; for a trend, also `mart daily_snapshot` and compare the last two comparable periods. |
| "How was this week? / weekly summary" | `digest_this_week`. If it 503s, say the weekly digest isn't ready yet and offer `snapshot_today` instead. |
| "What's selling / top products?" | `mart product_performance` — name the top few by revenue with their figures. |
| "Where are we losing sales / funnel?" | `mart checkout_funnel` — walk view_item → add_to_cart → begin_checkout → add_payment → purchase, and name the biggest drop-off as a %. |
| "How's our reputation / reviews?" | `mart review_velocity` — count + average rating, and the trend. |
| "Ad spend / ROAS / are ads running?" | `mart ad_performance` — spend, ROAS, and `effective_status` (say plainly whether anything is actively delivering). |
| "Customer value / repeat buyers" | `mart customer_clv`. |
| "Stock / what's low?" | `mart inventory_health`. |
| "Is the data current?" | `mart_meta <name>` — report the age / `data_through_ts`. |

## Reading the data correctly (guards)

- **Monetary/NUMERIC fields arrive as decimal STRINGS** (BRS-Pulse §3.6). Treat
  them as exact values; do not re-round or coerce through lossy math when
  quoting them.
- **The most recent 1–2 days can be structurally incomplete** (GA4 lands ~24h
  behind; marts rebuild ~05:20 UTC). If the newest row looks like a collapse,
  check `mart_meta` / `data_through_ts` and call it a reporting lag, not a real
  drop.
- **Ad spend of 0 / null usually means "no active spend"**, not a broken feed —
  corroborate with `ad_performance.effective_status` before saying ads "stopped".
- **`digest_this_week` may 503** early in the week — that's "not generated yet",
  not an error to alarm about.

## Answer shape

Lead with the number the exec asked for, then one line of context (WoW delta or
the single most useful comparison), then — only if it earns its place — one
concrete implication. Keep it tight; an executive wants the read, not a report.
South African Rand (R), `en-ZA` formatting. No em dashes in the reply.
