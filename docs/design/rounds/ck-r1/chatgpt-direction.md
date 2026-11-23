# ChangeKite round 1: ChatGPT's design direction (condensed)

Source: chatgpt.com (signed-in ChatGPT, "Extra High" thinking), conversation "Design direction and mockups", 2026-11-23.
Prompt: `prompt.md`. First reply: two image mockups (`chatgpt-mockup-hero.jpg`, `chatgpt-mockup-checks-pricing.jpg`).
Second reply (asked to write items 1-7 out): a canvas document "ChangeKite — Marketing Site Design Direction". Condensed here.

## 1. Concept: "Editorial Signal"
A beautifully designed website health report brought to life. Keep the warmth and editorial confidence; replace the dated
document look with oversized expressive type, disciplined cobalt accents, precise layout and a polished product interface.
Product-first storytelling: the real report is the hero. Avoid dark UI, glassmorphism, floating SaaS tiles, stock illustration,
big gradients, 3D. A simple geometric kite mark that works at 16 px.

## 2. Type
Fraunces (headings) + Manrope (everything else). H1 64-92 px desktop / 42-52 phone, Fraunces 650, -0.05em, lh 1.0.
H2 44-64 / 34-40, 600, -0.04em. H3 Manrope 750 26-30. Body 16-18 Manrope. Score 72 px Manrope 800 -0.06em.
Keep the H1 wording, four deliberate lines on wide desktop, left aligned. SOFT 0 / WONK 0.

## 3. Palette
Background #F7F3EA, surface #FFFEFB, elevated #FFFFFF, ink #171A25, secondary ink #505B68, accent #2246D2 (hover #1937B3),
accent tint #E7ECFF, aqua decoration #DDF2F5, hairline #E5E1D9. Status: pass #15643B/#E5F5EB, warning #8A4B00/#FFF0CE,
critical #AE232D/#FDE7E8, notice #245AA8/#E8F1FF. Blue = brand/interaction, never "passed". Every status has icon + text.

## 4. Layout
Max 1280, gutters 48/32/20, sections 112 desktop / 72 phone, cards radius 20, inputs/buttons 12.
Header 76 px, not sticky; phone 64 px with a Menu button (no horizontal scrolling nav).
Hero 44/56 split: eyebrow, H1, copy, 56 px URL form + "Scan free", note; right: example report with a pale aqua angular wash.
Then: "A score you can actually understand" (score + equation, real scoring rules) → "Twelve checks. No technical translation
required." (four grouped cards × 3 checks, no pass/fail badges on the feature list) → "A useful first look. Not a mystery
audit." → Monitoring "Your website changes. Your watch doesn't have to." (Scan → Compare → Notify, three example alerts) →
"Two plans for staying ahead." (from the real catalog) → Tools and guides (plain links) → "See your website more clearly."

## 5. Motion
Hero text 500 ms rise 12 px; report 650 ms, +120 ms; score ring 700 ms once; finding rows 320 ms, 40 ms stagger; sections 400 ms
once; easing cubic-bezier(.22,1,.36,1). Real scan progress only from real backend events. Reduced motion: no transforms, no
arc animation, final state immediately.

## 6. Hero visual
example-bakery.com, permanent "Example report · illustrative data" label, 1 critical / 1 warning / 1 notice = 86, grade from
the real function. 112 px dial, grade chip, summary sentence, three severity counts, three finding rows, three passed checks.
White surface, 1 px #E5E1D9 border, radius 20, shadow 0 16px 48px rgba(23,26,37,.07). Rendered from real UI + example object.

## 7. Award-level moves
1. Make the real report interface the visual identity (dial, findings, severity palette consistent on home, tools, report,
   dashboard); let a visitor expand one example finding to see why it matters and what to do.
2. Make the twelve checks an editorial index, not twelve icon cards.
3. (truncated in capture) precision and honesty in every number.

## What was used / changed in the build
- Used: concept, Manrope + Fraunces, the full palette, layout order and headlines, header with phone menu, hero example spec,
  score section (made interactive: set the counts, read the real score), grouped checks, monitoring and pricing teasers.
- Changed: the example's counts are chosen from real severities (alt text is a *warning* in the scanner, so the notice is
  "no canonical declared"). The labels/eyebrows are sentence case, not tracked caps.
