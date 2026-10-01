# Magnific for Glowming: prompting, motion and the render log

Magnific (formerly Freepik) is the picture and video engine, used through the
**Magnific connector** on Anton's claude.ai account. It is the same Magnific
account Riaan uses. **There is no credit cap, but every render is logged**
(section 7). Tool names below are the connector's usual names; if the
connector shows slightly different names, use its equivalent.

## 1. What Magnific is for (and not for)

| Use it for | Never use it for |
|---|---|
| Scenes and backgrounds with no product and no people (a sunny counter, a Cape Town sky) | Generating or drawing a pouch, a sachet or the logo, even for a concept or draft |
| Extending a photograph to a taller size (expand / outpaint) | Generating a whole finished advert with words on it |
| Animating an approved photograph (sky and sea only) | Generating any new person: faces, hands, bodies, silhouettes |
| Upscaling a real photo for a bigger size | Animating or changing a person already in an approved photo |
| | "Skin enhancer" or beauty filters on product photos |

The product and logo are **never generated**, not even as a concept or a
guide image. They are always the **official files**, placed on top afterwards
by code. People already in an approved source photograph (for example the
hand stirring a sachet) are kept exactly as they are; Magnific never makes new
ones.

## 2. Picking a model

| Job | Model (slug) | Why |
|---|---|---|
| Scene or background still (no product, no people), photographic | Seedream 4.5 (`seedream-4-5`) or `cinematic` | Strong light and depth |
| Quick cheap drafts of a scene | Nano Banana 2 Flash (`imagen-nano-banana-2-flash`) | Fast, cheap iterations |
| **Motion advert (animate an approved photo)** | **Kling 2.5 (`kling-25`)** | Good value, start-frame control; used for the approved Glowming motion adverts |
| Motion, alternative model | Seedance 2.0 (`bytedance-seedance-pro-2.0`) | Higher quality, more credits; same rule: still camera, only sky or sea moves |

Check the live list with `images_models_list` / `video_models_list` if a slug
is refused.

## 3. How to write a prompt

Flat, boring output is the default because it needs the fewest decisions.
Make the decisions in the prompt. Build it in this order:

1. Subject plus one concrete detail
2. Setting
3. Framing and composition
4. Light, named (golden hour, soft window light from the left, rim light)
5. Lens (for example "85mm, shallow depth of field")
6. Materials and texture (condensation on glass, oak grain, linen weave)
7. Colour grade (warm: pomegranate, café latte, cream; never cool or
   teal-and-orange)

Then add the **Glowming anti-flat block**:

> cinematic depth with clear foreground, midground and background
> separation, real directional lighting with soft falloff and grounded
> contact shadows, shallow depth of field, rich material texture and warm
> colour, a single clear focal moment, photographic realism not stock-photo
> staging.

### Prompt rules that matter

- **Never write the words "logo" or "text" in a prompt, even as "no logo".**
  It makes models invent fake logos and gibberish. To keep space empty, write
  "keep the upper right as clean, softly lit empty background".
- **No people words at all** (woman, hand, person, crowd, walkers).
- **No product words either** (pouch, sachet, packet, packaging, brand
  name). Generate the empty scene; the official product file goes on top
  later. Props may be named with real sizes so the scene matches the product
  that will be placed (for example "a 16 cm tall glass"; the 22 cm pouch
  placed later is the biggest thing on the counter).
- Warm, natural daylight; South African setting; it is spring and summer
  during this campaign.
- No evening, night or bedtime scenes (Glowming is a daytime ritual).

### Settings

- Sizes: `4:5` feed, `9:16` story, `1:1` square.
- Draft at `2k` with `count` 2 to 3; only the chosen direction goes to `4k`.
- Never explore ideas on video. Settle the still first.
- To show a result, follow the tool's instruction (usually `creations_show`)
  and give Anton the link.

## 4. Motion adverts: the method

Motion is made from an **approved** advert. Nothing about the approved design
changes; only the photograph behind it gently moves.

1. **Separate the layers.** The photo layer is the approved photograph on its
   own, with no headline, logo, product, bubble or sticker on it. If only the
   flat finished advert exists, ask for the layered source or the original
   photo; do not animate words or the logo.
2. **Animate the photo layer only,** with Kling 2.5 (or Seedance 2.0), using
   the photo as the start frame. Prompt for **sky and sea movement only**:
   "slow drifting clouds, gentle sea swell and soft sparkle on the water;
   buildings, mountain, balcony, table and everything else perfectly still;
   locked-off camera". 5 or 10 seconds; it should loop cleanly.
3. **Log, then check.** Straight after the render, append its log line
   (section 7). Then watch it through and check frames. **Reject it if
   anything other than sky or sea moves** (including any camera movement, and
   any person or hand already in the photo), or if anything appears that was
   not in the photo. Video models have added people walking, smog over a
   balcony, and warped buildings on Glowming renders before. **Never any new
   people,** even small and far away; people already in the approved photo
   stay exactly as they were.
4. **Hold the rest still with a mask** where possible: put the original still
   photo back over everything except the sky and sea areas, so only those
   areas move. Do this with code if this computer can process video. If it
   cannot, re-render with a stricter prompt, or deliver the animated layer and
   say which step remains.
5. **Put the approved layout on top, unchanged:** the same words, logo,
   product, bubble and positions as the approved still, at the same pixel
   size. A headline may appear line by line only if Anton asks for it.
6. **Export** MP4 (H.264), 1080 wide at the advert's size, silent unless
   asked. Save it only through Action 4 of the edit pathway, as a new file
   beside the approved still; never replace it.

### Before every video render

Confirm `anton.md` can be appended to (if not, do not render). Then tell
Anton in one line: model, length, size, and expected credits (use the
connector's cost estimate if it has one, for example `simulate_cost`; past
Glowming motion adverts have used roughly 190 to 510 credits each). Showing
credits is fine: Anton approves spend. Wait for his "go". **One "go" covers
one render;** a re-roll needs a new "go".

## 5. Extending a photo for a new size

For a feed or story version of a photo advert, extend the **photograph only**
(Magnific's expand tool, for example `images_expand`) to the new height, then
place the approved layout on it. Never expand across the product, logo or
words, and never across a person already in the photo. Check the new area
for invented objects or people and reject if any appear.

## 6. Checks on every render

- Zero new people (people already in the approved source photo are kept
  unchanged). Zero invented products, logos, labels or letters.
- Warm light, real texture, clear depth (score it with the richness checks in
  `persona.md`).
- Product and logo are the official files, placed afterwards.
- Iterate at most three times, then show Anton the best candidates and say
  what is stuck.

## 7. The render log (every render, no exceptions)

Every Magnific call that makes a picture or video, including drafts and
rejected results, gets **one line** in Anton's log: **`anton.md` in the
shared project folder** (Action 4 of
`${CLAUDE_PLUGIN_ROOT}/skills/campaign/references/edit-pathway.md`). The log
is **appended, never rewritten**.

Format:

```
RENDER | <YYYY-MM-DD HH:MM SAST> | <advert code> | <model> | <credits> | <prompt>
```

- **Time** in South African time (SAST, UTC+2), 24-hour clock.
- **Advert code** as in `campaign-adverts.md` (for example `A1-A`). Work
  that is not for one advert (saved under `work/anton/renders/`) uses
  `none`. Never invent a new code.
- **Model** is the slug used (for example `kling-25`).
- **Credits** is the number reported in the render result. Do not use the
  account balance: the account is shared, so a balance difference is not this
  render's cost. Write the number only.
- **Prompt** is the full prompt on one line (replace line breaks with
  spaces). Do not shorten it.

Example:

```
RENDER | 2026-10-02 10:15 SAST | A1-A | kling-25 | 187 | slow drifting clouds, gentle sea swell and soft sparkle on the water; buildings, mountain, balcony and table perfectly still; locked-off camera
```

**Order, every time: render, then IMMEDIATELY append the line, then review
the result.** So a rejected render is always logged.

**How to append safely:** before the first render, check that `anton.md`
exists and can be written. To add a line, add it at the very end only; then
re-open `anton.md` and confirm every earlier line is still there and the new
line is last. Never replace, shorten, re-order or rewrite the file.

**If the line cannot be appended** (file missing, locked, or the check
fails): **stop rendering** and tell Anton. Do not keep a chat-only log and do
not save the line anywhere else.
