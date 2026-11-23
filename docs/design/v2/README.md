# ChangeKite v2: "Sticker Bento" (2026-11-23)

The November redesign ("Editorial Signal", `docs/design/redesign-2026-11.md`) was judged poor by the owner: words collided in a
tightly tracked serif headline, it was the generic cream-and-blue SaaS template with no visual idea, every section was dense
small text, and the phone's first screen was only text.

## How we got here

1. Three concepts with Higgsfield mockups (`concepts.md`, `mockups/a-*`, `b-*`, `c-*`): High Wind, Field Report, Cyanotype Survey.
   High Wind was picked and built for one round.
2. The owner then changed direction: **simple**, and built from the Figma 2026 trends the last attempt had rejected. His reference
   was Starface (starface.world), listed on the Figma trends page under vibrant colour: a bento of saturated tiles in black gutters,
   a sideways logo bar, chunky rounded type with sticker outlines, stars, glossy 3D product renders and black chips, with almost
   no body text.
3. The bento direction was mocked up (`mockups/bento-desktop.jpg`, `mockups/bento-phone.jpg`) and built, then refined over the
   CI screenshot rounds below.

## Figma 2026 trends used

Source: Figma, "Top Web design trends for 2026" (https://www.figma.com/resource-library/web-design-trends/).

| Trend | How it shows up |
| --- | --- |
| Vibrant colour palettes | Full tiles of acid yellow, grass green, hot pink, cyan and orange in black gutters. Ink text on every tile (contrast 6.9:1 or more). One gradient tile, for the $9 report. |
| Bold typography | Fredoka (chunky rounded) at up to 96px with normal tracking, a pink offset "sticker" layer on headlines, white-outlined sticker numerals for the price. Nunito, also rounded, for text. |
| 3D elements | A glossy 3D kite mascot and six 3D icons (link, tag, magnifier, padlock, bell, wrench) made with Higgsfield `gpt_image_2_6` in one style phrase, cut out with `remove_background`, shipped as WebP (12-32 KB each). They float and bob; hovering a tile bounces its art. |
| Gamified design | The score tile: a big dial, a starburst grade sticker and "14 points to a perfect 100" (example data, from the real scoring function). |
| Maximalism, as a bento | The home page is one bento grid: hero with the scan form, mascot, score, four check-category tiles (3 checks each), the $9 tile, monitoring, tools and a ticker of plain promises. Each tile carries one idea in a few words; detail lives on subpages. |
| Motion design | Load-in rise, sticker pop and twinkle, floating 3D art, tile lift-and-tilt, a marquee ticker. Transform and opacity only; all dropped under `prefers-reduced-motion`. |

Kept from before: every claim is true, example data is labelled, the scan form, report, paywall and $9 pass checkout, tools,
guides, SEO metadata and JSON-LD, analytics events and auth all work as they did.

## Art

Style phrase used for every asset: "glossy 3D toy render, soft-touch candy-coloured vinyl, chunky rounded forms, bright studio
lighting with crisp specular highlights", in the single-asset prompt shape from the owner's pipeline. Files: `apps/changekite/public/art/`.
Spend for this redesign is listed in the final report.

## Rounds (CI design-shots, production build)

| Round | What changed after looking | Mobile Lighthouse (home) |
| --- | --- | --- |
| 1 | First bento build | 96 / 100 / 100 / 100 |
| 2 | Yellow sticky brand bar like the reference, tighter gutters, striped kite tile, form-first tool pages, monitoring chips, burst sticker fixed | 85 / 100 / 100 / 100 |
| 3 | Phone-sized kite preloaded (it is the largest paint), cyan monitoring tile (three yellows was too many), icons inside their tiles, 2x2 guides | 91 / 100 / 100 / 100 |
| 4 | Explainer tile: example site with pinned problems -> kite -> score 86 and 3 fixes (HTML/SVG, score counts up), pin red darkened for contrast | 97 / 100 / 100 / 100 |

Shipped in PR #10 (bento) and PR #12 (explainer), both deployed. Final live screenshots: `final/` (desktop 1440 and phone 390),
with `final/before-after-home-desktop.jpg` and `final/before-after-home-phone.jpg`.

The explainer shows the example report's own three problems (404 broken link, no description, no canonical URL), not
"missing title" or "no HTTPS": those are critical issues, and with them the real scoring function could not give 86.

Higgsfield spend for this redesign: 15 GPT Image 2.6 renders (1.25 each) and 7 background removals (1 each), about 26 credits.
