# ChangeKite + WebhookTrail redesign (November 2026)

Source for trends: Figma, "Top Web design trends for 2026"
(https://www.figma.com/resource-library/web-design-trends/), read 2026-11-23. It lists 13 trends:
3D and immersive elements, experimental navigation, vibrant colour palettes, bold typography, dark mode,
motion design and animation, gamified design, neumorphism, retrofuturism, maximalism, collage,
neo-brutalism / anti-design, and sustainable web design (plus AI trends: chatbots, voice, progressive lead nurturing).

Rule for both sites: the product itself is the hero visual. No stock 3D blobs, no invented customers, logos or numbers.
Every number shown in a product visual is labelled as an example, or comes from the real scoring rules in the code.

## ChangeKite: website health scan and monitoring (site owners, marketers)

Picked:

| Trend | Why it fits | How it shows up |
| --- | --- | --- |
| Bold typography | Marketers buy on clarity and confidence; the product's output is a written report, so type *is* the product. | Oversized variable serif display (Fraunces, optical sizing) set against a quiet grotesk; headline set like a magazine cover line. |
| Vibrant colour palettes (controlled) | The old paper-and-ink look read as "archive". A saturated signal colour makes it feel alive and current without becoming a toy. | One vivid "kite" colour on warm paper; red/amber/green stay reserved for status. |
| Motion design / scrollytelling | A scan is a process over time: crawl, check, score. Motion can tell that story honestly. | Hero report "assembles": pages counted, checks tick through, score dial fills using the real scoring formula. CSS only, reduced-motion respected. |
| Gamified design (light touch) | The report already has a 0-100 score and three grades. A visible score dial and grade make fixing issues feel like progress. | Score ring + grade chip in the hero report and the real report header. No points, streaks or fake leaderboards. |
| Sustainable web design | Mobile Lighthouse and the "plain-spoken" brand promise. | No WebGL, no images in the hero, system of CSS gradients and SVG; fonts already self-hosted by next/font. |

Rejected: 3D/immersive (heavy, nothing 3D about the product), neumorphism (low contrast, poor a11y), maximalism and collage
(fights a report's legibility), retrofuturism (belongs to WebhookTrail's developer world), neo-brutalism (too cold for marketers).

## WebhookTrail: webhook capture and replay (developers)

Picked:

| Trend | Why it fits | How it shows up |
| --- | --- | --- |
| Dark mode | Developers live in dark editors and terminals; the inspector is a tool you keep open next to them. | Deep graphite-blue console as the only theme, tuned contrast (WCAG AA on every text tier). |
| Retrofuturism | Webhooks are signals in transit. A flight-recorder / oscilloscope / phosphor-display language gives it a memorable identity that no other request bin has. | Phosphor-green signal colour, scanline and trace motifs, a "trace" line that pulses when a request lands; mono display type. |
| Motion design | Live capture *is* motion: requests arrive. | Hero inspector streams example requests in, with arrival flash and a moving trace; reduced-motion shows a static list. |
| Bold typography | Developer sites drown in grey body text. A tight, big grotesk headline plus mono labels reads as an instrument panel. | Inter Tight display at heavy weight, JetBrains Mono for every machine value. |
| Experimental navigation (restrained) | Developers like keyboard-first tools. | Keyboard hint chips (kbd) in the hero and inspector, not a novelty menu. |
| Sustainable web design | Fast mobile load for a tool people open from a phone mid-incident. | CSS-only effects, no WebGL, no hero images. |

Rejected: vibrant/dopamine palettes (noise in a console), neumorphism, collage, maximalism, gamification (inappropriate for a debugging tool).

## Distinct identities

- ChangeKite = **"The Inspector's Report"**: light, warm paper, editorial serif, one vivid kite colour, printed-document craft.
- WebhookTrail = **"Flight Recorder"**: dark instrument panel, mono-heavy, phosphor signal colour, live trace motion.

They share no layout, palette or type, only engineering rules (tokens in `globals.css`, reduced motion, accessible contrast).

## Process

Design direction and critique rounds were run with ChatGPT (chatgpt.com, signed in, via Claude in Chrome, "Extra High"
thinking). Each round's prompt, ChatGPT's answer and the screenshots it reviewed are in `docs/design/rounds/`.
Screenshots of every round came from the production build in CI (`.github/workflows/design-shots.yml`), so no browser or
build ran on the owner's machine while he was gaming.

| Round | ChangeKite | WebhookTrail |
| --- | --- | --- |
| before | `rounds/before/` (live site, 2026-11-23) | same |
| 1: direction + mockups | "Editorial Signal" (`ck-r1/`) | "Flight Recorder" (`wt-r1/`) |
| 2: critique of the build | 8 changes, ratings 6-8.5 (`ck-r2/`) | 7.5/10, 8 changes (`wt-r2/`) |
| 3: final critique | 8.8/10, "approve the art direction", 6 polish items (`ck-r3/`) | 8.7/10, "stop exploring", 6 polish items (`wt-r3/`) |
| after round 3 + pricing/paywall merge | `rounds/after-r3/` | same |

ChatGPT's final advice for both: freeze the visual design now; further experimentation risks making it worse.

Mobile Lighthouse (CI, production build, home pages) after round 3: ChangeKite 87-92 performance / 100 accessibility /
100 best practices / 100 SEO; WebhookTrail 91 / 100 / 100 / 100.

Final live screenshots are in `docs/design/final/`.
