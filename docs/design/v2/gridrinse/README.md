# GridRinse v2: "Rinse Cycle" (2026-11-23)

The owner approved bold redesigns of ChangeKite (Starface-style sticker bento) and WebhookTrail (ChainGPT-Labs-style
retrofuturist grid) and asked for GridRinse "to look this good too", with its own identity.

## Three directions

Mocked up with Higgsfield `gpt_image_2_6` (quality high), desktop first screen and phone first screen each (`mockups/`).

| | Direction | Figma 2026 trends | Verdict |
| --- | --- | --- | --- |
| **A** | **Rinse Cycle** (`a-rinse-cycle-*`) | Neo-brutalism, bold typography, 3D elements, gamified design | **Picked** |
| B | Torn Sheet (`b-torn-sheet-*`) | Collage / cut-out, handmade marks | Runner-up |
| C | Kinetic Rinse (`c-kinetic-rinse-*`) | Kinetic typography, gamified health bar | Rejected |

**Why A.**

1. It shows the product in one look: a messy spreadsheet being squeegeed clean by the mascot, with a "Clean 100%" meter.
   The before/after in the built hero is produced by the real cleaning engine, not drawn.
2. It is unmistakably not a sibling. ChangeKite is a rainbow bento in black gutters with rounded type; WebhookTrail is a
   beige technical grid with pixel type. GridRinse is one electric cobalt field with a raw spreadsheet grid, thick black
   outlines, hard offset shadows and tall condensed poster caps. The grid *is* the product (a spreadsheet).
3. It is the most buildable at high quality and speed: flat colour, CSS outlines and shadows, type, and a handful of
   small 3D cut-outs. No textures to ship, so mobile Lighthouse stays high.
4. It evolves what GridRinse already had (black outlines, offset shadows) instead of throwing the brand away, but turns
   the volume up: v1 was mint and cream and read as a tidy template.

B was charming (torn paper, washi tape, a sponge sticker), but paper textures are heavy, editorial collage fights the
"fast tool" message, and it sits close to ChangeKite's sticker look. C's grunge smudges and spray-bottle were noisy, its
aqua-mint drifts toward ChangeKite's cyan, and the stretched "RINSE" word is hard to make readable on a phone.

Borrowed from the others: from C, the gamified meter (in the hero and inside the real Cleaner); from B, the idea of the
messy cells being marked up before they are rinsed (the hero marks the cells the engine rewrites in pink).

An art-director ranking from ChatGPT was not attempted: both sibling sessions found that typing into chatgpt.com from
Claude in Chrome is blocked in this setup.

## The system

| Role | Value |
| --- | --- |
| Field | Cobalt `#1e3bff` with a 64x40 white grid at 16% (the spreadsheet), used for every page's opening band and the plans band |
| Ink | `#0a0a0a`: 3px outlines, 4-9px hard offset shadows, the footer, the marquee |
| Clean | Acid lime `#c6ff3a`: the squeegee, meters, the Pro plan, "after" tables, primary hover |
| Attention | Bubblegum pink `#ff7ccf`: buttons, the privacy band, the $5 pass, "before" marks |
| Paper | `#eef1ff` for reading pages; white cards |
| Display | Anton (tall condensed caps), white with a black outline and a hard black drop on cobalt |
| Text | Plus Jakarta Sans, 16-23px, semibold for short lines |

Token names from v1 were kept (`mint` = lime, `lemon` = pink, `accent` = cobalt, `card-pop`, `btn-pop`, `mint-grid`), so
every page, including the Cleaner, paywall, pass checkout, account, admin and help, picks the new look up without its
logic being touched.

## Figma 2026 trends used

Source: https://www.figma.com/resource-library/web-design-trends/

| Trend | Where |
| --- | --- |
| Neo-brutalism / anti-design | Thick black outlines, hard offset shadows, a raw visible grid, loud flat colour, a header that is itself an outlined card |
| Bold typography | "MESSY IN. CLEAN OUT." at up to 138px in outlined condensed caps; every section heading in the same face; the footer ends on a full-width "GRIDRINSE" |
| 3D elements | A glossy iridescent soap-bubble mascot (squeegee and waving poses) plus lock, spreadsheet, bubbles and trophy cut-outs |
| Gamified design | The hero's "Clean 100%" meter that fills as the squeegee passes; the Cleaner's lime "Rinsed!" meter with cells fixed and rows removed after each run |
| Motion | One squeegee wipe on load, rising headlines, floating art, a marquee of real fixes, lift-on-hover cards, press-down buttons. Transform, opacity and clip-path only; all of it stops under `prefers-reduced-motion` and the page shows the final clean state |

## Deliberate departures from the design-taste house rules

The skill bans outlines, offset shadows and grid lines. Here they are the chosen direction (neo-brutalism) and the
product's own material (a spreadsheet grid), so they stay; everything else holds: two-line headlines, no tracked
uppercase eyebrows (the old ones became black fact chips), no monospace outside data tables, no gradients, one idea
per block, a heading on every section.

## Art

Style phrase for every asset: "glossy 3D toy render, iridescent soap-film and soft-touch vinyl, chunky rounded forms,
bright studio lighting with crisp specular highlights", in the owner's single-asset prompt shape. Each asset folder in
`art/` holds the concept, the Higgsfield cut-out and a manifest with job ids. Served files are in
`apps/gridrinse/public/art/` as AVIF with WebP fallback (7-27 KB AVIF each).

## Kept exactly

The Cleaner and every step, the "files never uploaded" promise and its wording, free limits, the $5 24-hour pass and
Pro/Business checkout (no billing code changed), analytics events, SEO metadata, JSON-LD, sitemap, every `/tools` and
`/guides` page, the e2e labels ("Clean a messy sample file").
