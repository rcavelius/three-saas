# ChangeKite v2: three directions (2026-11-23)

Why v2: the owner judged the November redesign ("Editorial Signal") poor. Its problems: a serif headline tracked so tight that
words collide, the generic AI-SaaS template (cream page, royal-blue button, card on the right, a random teal slab), no visual
idea and nothing about a kite, small dense text everywhere, a spec-table "Twelve checks" section, list-style pricing, tools and
guides, a cliché giant footer wordmark, and a phone first screen that is only text.

## A. "High Wind": the kite is your site map

A bold colour field: a deep, saturated sky blue covers the whole first screen. One big vermilion kite flies in it, and the kite
*is* the scan. Its frame is drawn as a site map: the home page at the top vertex, the pages it links to as nodes along the spars,
and the kite's tail is a string of twelve bows, one per check. In the hero animation a scan pulse runs down the spars, each page
node lights as it is crawled, then the bows on the tail flip from grey to green, amber or red while the kite rides the wind.
Type is a heavy, wide grotesk in white at a huge size with normal tracking. Further down the page the sky turns to bright
white paper; the twelve checks become the tail of bows laid out as a big visual strip, and pricing becomes three "altitudes"
(free scan, the $9 one-time full report, monitoring plans). The kite gives the brand something no competitor has.

## B. "Field Report": an inspection magazine

Newsprint off-white, pure black and a single signal red. The page is laid out like a printed inspection report in a design
magazine: a massive condensed grotesk headline, issue-number details, and the hero is a wireframe screenshot of a website marked
up in red pen: circles around a broken link, an arrow to a missing description, a stamped "FAIL" next to a 404. The twelve
checks are a grid of twelve rubber stamps (PASS, WARN, FAIL). Pricing is a three-column order form. Strong and editorial, but the
"red pen on a page" idea is common in SEO audit marketing, and the kite plays no part in it.

## C. "Cyanotype Survey": the site as a blueprint

A Prussian-blue cyanotype field with white technical line drawing. The hero is an architect's plan of a website: pages are rooms,
links are corridors, and a scan beam sweeps across the plan, leaving small surveyor marks where it found problems. Type is a crisp
technical grotesk with a monospace for labels. The twelve checks are twelve surveyor's symbols in a legend panel; pricing is a
title-block like those on engineering drawings. It looks precise and expensive, but it reads as "engineering", colder than
ChangeKite's audience of site owners and marketers, and dark blue with fine white lines gets hard to read on a phone.

Mockups: `docs/design/v2/mockups/` (Higgsfield gpt_image_2_6, high quality; a desktop full page and a phone hero per direction).

## Critique and pick

ChatGPT was not used this round: the Chrome extension was connected and signed in, but the auto-mode permission classifier
blocked typing into chatgpt.com. Pressing Return sent an old draft left in the composer from the earlier redesign session,
together with the contact sheet; nothing else was sent. The ranking below is my own art-director read of the six mockups.

1. **A, High Wind (picked).** It is the only one where the brand name, the product and the picture are one idea: the kite is
   the site map and its tail is the checklist. A whole field of colour plus one big object reads from across a room, the phone
   first screen naturally holds the kite *and* the form, and it all draws as SVG, so it stays fast. Risk: it can turn
   childish (rainbow bows, clip-art clouds, a toy font). So: no clouds or decorative shapes, one wide grotesk at a confident
   size with normal tracking, status colours only on the bows, and every bow labelled with a real check name.
2. **B, Field Report.** The most "designed" mockup, but red-pen markup and stamps are a common audit-marketing trope, it needs
   a lot of small type (the owner's "wall of words" complaint), the kite is absent, and mono plus hairline grids are the
   house style's banned costume.
3. **C, Cyanotype Survey.** Beautiful but cold and technical for site owners, fine white lines on dark blue fail on a phone,
   and its floor plan shows pages that are not the visitor's.

Build rules taken from the pick:
- Type: Archivo (Google Fonts, variable weight + width), one family. Display at width 112-125, weight 800, tracking -0.02em,
  leading 0.92-0.98. Text at width 100, 17-18px, leading 1.5.
- Palette: sky #1F5BFF (field), kite vermilion #FF5A1F, ink #0B1230, paper #F4F6FA, white. Status colours are kept for results.
  Buttons are ink pills; links are sky.
- Hero: SVG kite whose frame is a site map of example pages. A scan pulse runs down the spars, each page node lights up,
  then the 12 bows on the tail take their example result colour, and the kite rides the wind. The string runs down to the form.
  All example data is labelled.
- 12 checks: the tail, laid out large, every bow named and glossed in a few words.
- Pricing: three altitudes rising left to right (free scan, $9 full report, monitoring).
