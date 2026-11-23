# WebhookTrail v2: "Catch every hook" (2026-11-23)

The owner rejected the v1 "Flight Recorder" dark console (docs/design/final/wt-*) as not simple and not
good-looking, and pointed at the ChainGPT Labs homepage as the level he wants: a light grid, one giant
display word, a glossy 3D mascot, mono microcopy, an orange cut-corner action. v2 translates that to
WebhookTrail.

## Figma 2026 web design trends used

Source: Figma, "Top web design trends for 2026", https://www.figma.com/resource-library/web-design-trends/

| Trend | Where it shows up |
| --- | --- |
| Retrofuturism | The mascot is a 1980s-toy computer terminal with an orange CRT face; Silkscreen pixel display type; the black "request trace" cell reads like a phosphor terminal. |
| Bold typography | "CATCH EVERY HOOK" runs edge to edge (Silkscreen Bold, sized from the font's own advance widths with container query units, so it fits exactly with no script and no layout shift). Every page opens with one giant pixel word. |
| 3D elements | Three glossy 3D renders in one art style (mascot, hook, data packet), background removed, served as AVIF/WebP at 9-39 KB each. |
| Experimental navigation | The header is a row of grid cells: mono nav cells that invert on hover, the current section underlined in orange, a cut-corner action. Linked grid cells across the site invert like pressed keys. |
| Motion design | The mascot floats over a breathing shadow; the trace cell's requests arrive in turn on a loop with a flash, a blinking cursor and a scope pulse; sections rise in a stagger as they enter. CSS only, all off under reduced motion. |
| (Neo-)brutalist grid, from the reference | The visible thin-line architectural grid with crosshair marks and small orange corner squares. |

Not used: dark mode as the marketing theme (the light grid read better in the mockups and matches the
reference; the working app — inspector, dashboard, account, admin, auth — keeps the dark console),
maximalism, collage, neumorphism, gamification.

## Process

1. Mockups (Higgsfield gpt_image_2_6, `mockups/`): A light grid with a full-width headline, B the dark
   variant, C a split layout with a stacked headline. Two mascot candidates.
   Picked: **A's layout** (giant word edge to edge, mascot in the centre cell, black trace cell to the
   right, sender strip below), with **C's** trace cell and cut-corner button, and **mascot v2** (the hook
   antenna says "webhook", and it sits on a plinth like the reference). Light beat dark: B's dark grid
   loses the drafting-board look that makes the reference striking, and A's black cell only has
   contrast because the rest is light.
2. An art-director critique from ChatGPT was planned but the browser step was blocked by the session's
   permission classifier, so the critique rounds were done by Claude against the mockup and the
   reference (notes below).
3. Built with the design-taste-frontend, web-effects and emil-design-eng guidance where it does not
   contradict the owner's reference (the taste skill bans mono, grid lines and crosshairs; the owner's
   reference requires them, so the owner wins).
4. Screenshot rounds from the production build in CI (`.github/workflows/design-shots.yml`).

## Art

`art/<asset>/` holds the concept PNG, the background-removed cutout and a manifest with the Higgsfield
job ids. Style phrase shared by all three: "glossy retrofuturist 3D toy render, soft studio light,
cream-white plastic with warm orange and amber glow".

## Copy

Cut by well over half. Home hero: one headline, one 16-word sentence, one button, one note. Senders
(Stripe, GitHub, Shopify, CI, your app) are plain text labels that link to the matching tester page;
they are never presented as customers or partners. The trace cell and the sample values are labelled
"example".
