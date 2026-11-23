# ChangeKite round 2: ChatGPT art-director critique (condensed)

Input: `prompt.md` plus the five screenshots in this folder (production build, CI run 45137569420).

## Verdict
"Strong foundation. Needs a refinement pass." Looks like a well-executed premium template rather than a studio-designed
product: the composition gets predictable after the hero (serif heading, paragraph, white card, repeat).
Ratings: identity 8, desktop hero 8.5, type 8, layout/rhythm 7, colour 8, mobile 6.5, product demo 7.5, tool page 6.

- Hero report too subdued: the hero dial showed an empty beige ring while the score section showed a proper amber arc.
- Score calculator is the best differentiator but looks like another info card.
- Twelve-check cards read as a SaaS feature template.
- Dark band: "Yes. Keep it." Best rhythm change; fix its internal hierarchy.
- Phone: too tall; the product score is not on the first screen; the form looks like an input inside a giant input.
- Tool page weakest: a long narrow document; duplicate disclaimer.

## The 8 changes (priority order)
1. Compress the mobile hero: H1 44 px/1.02, shorter copy ("Scan up to 25 pages for broken links, missing details and
   security issues. Get a clear report in about a minute."), separate 54 px input and 52 px button with 10 px gap, no
   enclosing border, note "Free · No account · Up to 25 pages", report 32 px below.
2. Rebuild the tool page as a utility: two columns (580 / 420, gap 64), H1 60 px, form + a labelled example of the findings
   on the right, reading column 760 px, technical details in an expandable section, remove duplicate disclaimer.
3. Polish the example report: dial 120 / 96, stroke 10, track #EEE9DF, arc #B56B00, score 60 px 800, finding title 15/700,
   detail 13.5/1.45, rows ≥ 64 px. Sentence "One broken link needs fixing. Two other issues were found." Sub-line
   "Illustrative result · 25 example pages" (not "Scan completed").
4. Stricter type: H1 82 / 44, H2 48 / 34, H3 Manrope 24/750; Fraunces only for H1, major H2s and the sign-off; drop hero
   copy that repeats the checks list.
5. Score calculator as one integrated exhibit: one container (max 1120, radius 20, padding 40/20), dial 160/124 stroke 12,
   42/58 split, ruled control rows ≥ 76 px, 44 px steppers, formula 16/700, no nested cards.
6. Replace the four check cards with an editorial index: no cards, 1 px #DAD5CB top rule, small blue 01-04 index, Manrope
   24/750 category title, ruled rows (label 15/700, text 14/1.5), column gap 64.
7. Dark band: #191D29, heading #F7F3EA, body #D2D7E0, padding 88/64, 360 px + two columns, gap 56, bold 14 px labels.
8. Stronger ending: pricing band #EDF2F3, padding 88/64, cards 28 px padding radius 16, plan name 22/750, price 42/800,
   compare sites / frequency / pages from the real catalog; CTA radius 16, padding 40×48; footer wordmark fully visible.

Keep: warm paper, Fraunces/Manrope, serif hero, cobalt action, kite mark, example labelling, one dark section, score formula.
