# Glowming social post system: sizes, grid, safe areas, text limits

A Glowming post is a **designed advert**, not a photograph with words on it.
It is built in layers: background (a built colour field or a photograph),
product, logo, headline, supporting line, badge or bubble, and a quiet
bottom line. The logo and products are always the real files, placed, never
regenerated.

## 1. Sizes

| Name | Pixels | Ratio | Used for |
|---|---|---|---|
| Feed | **1080 x 1350** | 4:5 | Instagram and Facebook feed (the main paid size) |
| Story / Reel | **1080 x 1920** | 9:16 | Stories, Reels, TikTok covers |
| Square | **1080 x 1080** | 1:1 | Organic posts, some placements, explainer videos |

All three are 1080 wide, so the same element sizes carry across: the logo is
about **366px wide** (one third of the width) in every size.

Export as PNG (stills) at exactly these pixel sizes. If rendering from HTML,
render at 2x and check the final file is the stated size.

## 2. The grid

- **Margin: 72px** on all four edges, every size. Nothing important crosses
  it, except a deliberate full-bleed photo or a product that deliberately
  peeks in from the edge.
- **12 columns**, 24px gutters, inside the margins (content width 936px).
- **Three zones, always in this order, top to bottom:**

| Zone | Square (1080 high) | Feed (1350 high) | Story (1920 high) |
|---|---|---|---|
| Logo zone | 72 to ~196px | 72 to ~220px | below the top safe area (from ~270px) |
| Message zone (headline + one supporting line) | ~196 to ~620px | ~220 to ~780px | ~400 to ~1100px |
| Product zone (product, bubble, bottom line) | ~620 to 1008px | ~780 to 1278px | ~1100px to the bottom safe area |

The square figures are the system standard; the feed and story figures
stretch the same order to the taller frame and are a starting point, not a
rule that overrides an approved layout. **Approved layouts are frozen:** if an
approved advert already places things differently, keep it as approved.

- **One focal point per post:** either the headline or the product leads; the
  other supports. Labels, bubbles and the bottom line stay quiet.

## 3. Safe areas (keep text and logo clear)

Platform bars and buttons cover parts of the frame. These are Meta's general
guidance; always check the result in Meta's placement preview before
approving.

- **Story (1080 x 1920):** keep text, logo and key product out of the **top
  ~14% (about 270px)** and the **bottom ~20% (about 380px)**, where the
  profile bar and the reply or link button sit.
- **Reel (1080 x 1920):** the bottom **~35%** is covered by the caption and
  buttons; keep headlines and the logo above it.
- **Feed (1080 x 1350):** some placements crop to a square, so keep the
  headline and logo inside the central square band where the approved layout
  allows it.
- **If a safe area clashes with an approved layout, ask Anton before moving
  anything.** Show the approved version and the proposed change side by side.

## 4. Type sizes on a 1080-wide post

### Headlines: Axiforma Black, ALL CAPS

| Step | Size | Tracking | Line spacing | Use |
|---|---|---|---|---|
| Hero | 132px | -0.045em | 0.92 | One bold statement, max 3 short lines |
| XL | 104px | -0.04em | 0.94 | Most adverts, 2 to 4 lines |
| L | 78px | -0.035em | 0.96 | Panels, secondary statements |

Line breaks come from the approved copy, not from automatic wrapping.

### Everything else: Geist

| Step | Size | Weight | Use |
|---|---|---|---|
| Lead | 34px | 500 | The one supporting line |
| Body | 28px | 400 | Short supporting paragraph |
| Label | 30px | 700 | Small headed label or bar |
| Small caps label | 21px | 700, tracking +0.22em | The short kicker above a headline |
| Bottom line | 20px | 600, caps, tracking +0.16em | The web address, if shown at all |

Nothing smaller than 20px on a 1080-wide post: it will not read on a phone.

## 5. Text limits

| Element | Limit |
|---|---|
| Headline (Hero) | 3 short lines |
| Headline (XL) | 2 to 4 lines, about 22 characters a line |
| Supporting line | about 32 characters a line; longer goes back to Heyu |
| Small caps kicker | about 24 characters |
| Messages per post | **one** |

If approved words do not fit, Zac reports the exact limit ("this line is 31
characters; the space takes 24") and the words go back to Heyu. Zac never
shortens or rewrites copy, and never shrinks text below the sizes above to
force it in.

For reference, Meta's own text fields (written in Ads Manager, not on the
picture): primary text shows about 125 characters before "See more"; keep
headlines short. Zac does not edit adverts in Meta.

## 6. Containers and furniture

- One shape family per post: panels 28px corners, small labels 14px corners,
  1.5px lines. No fully round pills.
- **No white web-address pill.** If the address appears, it is the quiet
  bottom line in small caps. Omit it on mood posts.
- Bubbles (for example the benefit bubble or the "70 MILLION" bubble) and
  stickers sit in space the layout leaves empty and never cover the product
  or the logo.
- **Colour posts:** a built background (soft light patch, gentle darkening,
  darker floor), never a flat fill.
- **Photo posts:** a darkening gradient at the top (behind logo and headline)
  and at the bottom (behind the bottom text), plus one soft text shadow on
  white type. No outlined letters on photographs.
- **Every product is grounded:** a soft dark oval under it plus a softer cast
  shadow.

## 7. Layout patterns (pick by the post's job)

| Pattern | Job | Ground |
|---|---|---|
| Statement | One bold line | Photograph |
| Benefit | Product plus one benefit | Built colour field |
| Comparison | This versus that (story size) | Colour field with an inner panel |
| Collage / testimonial | Real-life proof, a customer quote | Colour field with three photo cells |
| Lifestyle hero | Aspirational moment | Full-bleed real photograph |

People appear only in real photographs, never generated.

## 8. Short explainer videos (in-chat feature videos)

- Square **1080 x 1080**, **20 to 25 seconds**, 24 frames a second, readable
  with the sound off.
- Glowming warm light ground; Pomegranate for highlight stickers and the end
  card.
- The phone shows **real recorded app screens**, supplied by Riaan's team, on
  a test account. Never mock up screens; never show a real customer's name,
  order or diary.
- Five or six screens, one action each, held about three seconds, with a
  highlight on what to tap. End card: what the viewer now has, then the logo.
- One feature per video. No new weight, body or before-and-after wording and
  no new health claims. English only.
- Caption under 300 characters: **"New: [the thing], in [number] taps"**,
  one sentence on why it matters, the steps in one sentence, then the link or
  "Reply if you get stuck". Caption words go through Heyu.
