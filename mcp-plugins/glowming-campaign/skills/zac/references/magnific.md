# Magnific for Glowming: prompting, motion and the render log

Magnific (formerly Freepik) is the picture and video engine, used through the
**Magnific connector** on Anton's claude.ai account. It is the same Magnific
account Riaan uses. **There is no credit cap, but every render is logged**
(section 7). Tool names below are the connector's usual names; if the
connector shows slightly different names, use its equivalent.

## 1. What Magnific is for (and not for)

| Use it for | Never use it for |
|---|---|
| Scenes and backgrounds with no product and no people (a sunny counter, a Cape Town sky) | Drawing a pouch, a sachet or the logo |
| Extending a photograph to a taller size (expand / outpaint) | Generating a whole finished advert with words on it |
| Animating an approved photograph (sky and sea only) | Any person: faces, hands, bodies, silhouettes |
| Upscaling a real photo for a bigger size | "Skin enhancer" or beauty filters on product photos |

The product and logo are always the **official files**, placed on top
afterwards. If an official product picture is needed as a guide for a scene,
upload it and pass it as a reference image; never let the model invent it.

## 2. Picking a model

| Job | Model (slug) | Why |
|---|---|---|
| Scene or background still, photographic | Seedream 4.5 (`seedream-4-5`) or `cinematic` | Strong light and depth; use only where no readable label is needed |
| A scene that must show a real label faithfully (guided by the official packshot) | Nano Banana Pro (`imagen-nano-banana-2`) | Keeps real packaging legible; concept use only, finals still use the official file |
| Quick cheap drafts | Nano Banana 2 Flash (`imagen-nano-banana-2-flash`) | Fast, cheap iterations |
| **Motion advert (animate an approved photo)** | **Kling 2.5 (`kling-25`)** | Good value, start-frame control; used for the approved Glowming motion adverts |
| Motion with finer camera control | Seedance 2.0 (`bytedance-seedance-pro-2.0`) | Best overall, more expensive |

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
- **State real sizes when scale matters:** "a 22 cm tall pouch stands well
  above a 16 cm glass". The pouch is the biggest thing on the counter.
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
3. **Check every result before anything else.** Watch it through and check
   frames. **Reject it if anything other than sky or sea moves**, or if
   anything appears that was not in the photo. Video models have added people
   walking, smog over a balcony, and warped buildings on Glowming renders
   before. **No synthetic people, ever,** even small and far away.
4. **Hold the rest still with a mask** where possible: put the original still
   photo back over everything except the sky and sea areas, so only those
   areas move. Do this with code if this computer can process video. If it
   cannot, re-render with a stricter prompt, or deliver the animated layer and
   say which step remains.
5. **Put the approved layout on top, unchanged:** the same words, logo,
   product, bubble and positions as the approved still, at the same pixel
   size. A headline may appear line by line only if Anton asks for it.
6. **Export** MP4 (H.264), 1080 wide at the advert's size, silent unless
   asked. Save as a new file beside the approved still; never replace it.

### Before every video render

Tell Anton in one line: model, length, size, and expected credits (use the
connector's cost estimate if it has one, for example `simulate_cost`; past
Glowming motion adverts have used roughly 190 to 510 credits each). Wait for
his "go". **One "go" covers one render;** a re-roll needs a new "go".

## 5. Extending a photo for a new size

For a feed or story version of a photo advert, extend the **photograph only**
(Magnific's expand tool, for example `images_expand`) to the new height, then
place the approved layout on it. Never expand across the product, logo or
words. Check the new area for invented objects or people and reject if any
appear.

## 6. Checks on every render

- Zero people. Zero invented logos, labels or letters.
- Warm light, real texture, clear depth (score it with the richness checks in
  `persona.md`).
- Product and logo are the official files, placed afterwards.
- Iterate at most three times, then show Anton the best candidates and say
  what is stuck.

## 7. The render log (every render, no exceptions)

Every Magnific call that makes a picture or video, including drafts and
rejected results, gets **one line** in Anton's render log. The log's location
is set in the shared campaign rules
(`${CLAUDE_PLUGIN_ROOT}/skills/campaign/references/campaign-rules.md`).

Format:

```
RENDER | <YYYY-MM-DD HH:MM SAST> | <advert code> | <model> | <credits> | <prompt>
```

- **Time** in South African time (SAST, UTC+2), 24-hour clock.
- **Advert code** as in `campaign-adverts.md` (for example `A1-A`). If the
  render is not for one advert, ask Anton which code it belongs to.
- **Model** is the slug used (for example `kling-25`).
- **Credits** from the render result, or the `account_balance` difference
  before and after. Write the number only.
- **Prompt** is the full prompt on one line (replace line breaks with
  spaces). Do not shorten it.

Example:

```
RENDER | 2026-10-02 10:15 SAST | A1-A | kling-25 | 187 | slow drifting clouds, gentle sea swell and soft sparkle on the water; buildings, mountain, balcony and table perfectly still; locked-off camera
```

Write the line straight after the render, before reviewing the result. If the
log file cannot be found, show Anton the line in the reply and ask where his
render log is; never skip it.
