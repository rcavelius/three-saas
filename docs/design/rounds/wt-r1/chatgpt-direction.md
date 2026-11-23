# WebhookTrail round 1: ChatGPT's design direction (condensed)

Source: chatgpt.com (signed-in ChatGPT, "Extra High" thinking), 2026-11-23. Prompt: `prompt.md`.
First reply: two image mockups (`chatgpt-mockup-hero.jpg`, `chatgpt-mockup-how-pricing.jpg`).
Second reply: canvas "WebhookTrail — Marketing Site Design Direction", condensed here.

## 1. Concept: "Flight Recorder"
A precision instrument for seeing what happened. Oscilloscope / recorder cues (calibrated lines, event markers, restrained amber)
against oversized confident type. 80% modern engineering software, 20% retrofuturist instrumentation; never cyberpunk.
"Amber means pay attention", not decoration. Target feeling: "the tool I want open when something breaks."

## 2. Type
Space Grotesk (display, body, UI) + JetBrains Mono (code, paths, timestamps, labels, method badges, kbd).
H1 76/76 desktop, 40/42 phone, 700, -0.055em; H2 48/52, 700, -0.045em; body 16/25; mono labels 11 px +0.12em caps;
code 12.5/20. Highlight only "sent." in amber. Tabular numerals for timestamps, statuses, quotas.

## 3. Palette
bg #090D12, surface #10161D, raised #161F28, line #2C3944, line-strong #5D6E7C, text #F7FAFC / #C3CDD7 / #97A7B6 / #7B8D9C,
signal #FFB44D (hover #FFC46D, ink #1B1206), code #C7D9E9. Methods: GET #68E1AA, POST #FFC169, PUT #82C6FF, PATCH #D3A8FF,
DELETE #FF8C92. Status ok #69DFB1, warn #FFD07B, error #FF8995. 2 px amber focus ring.

## 4. Layout
Max 1320, gutters 48/32/20, sections 112/76, cards radius 14, app frame 16, buttons 10.
Header 72 px; "Create endpoint" is the header action (no-signup is the point); phone Menu button.
Hero 42/58: mono eyebrow, H1, paragraph, Create endpoint + Read the docs, "No signup required"; right: the inspector.
Capability strip (six cells) → "Capture. Inspect. Respond." three cards with mini real UI → "Every request, down to the byte."
→ recent endpoints (only when they exist) → pricing teaser Free / Developer / Pro from the real config, no "most popular"
→ tools and guides → "Your next webhook is one click away."

## 5. Motion
Hover 120 ms, press 90 ms scale .985, new real request 220 ms rise 6 px, section reveal 350 ms 8 px, signal trace 450 ms once.
Easing standard cubic-bezier(.2,0,0,1), entrance (.22,1,.36,1). The example inspector must NOT simulate arrivals; no infinite
heartbeat loops. Reduced motion: no translation, reveals or waveform drawing.

## 6. Hero inspector
Label "Example inspector — sample data, not live", slug /e/example-7f2a (use the real route shape), four sample requests
(POST /stripe/checkout 200, POST /github/events 200, PUT /shopify/orders/42 422, GET /ci/build/14 200), first selected with an
amber left rule; detail with JSON/Form/Raw/Hex tabs, an example Stripe event, masked stripe-signature with Reveal, Copy as cURL,
and the endpoint's reply config. Keyboard hints only j/k, ↑/↓, Enter. Phone: list → detail with "Back to requests".

## 7. Award-level moves
1. Own instrument language: one amber trace motif recurring (hero, steps, footer), static SVG.
2. Art-direct the real product UI: editorial-scale type vs. dense, correct technical detail.
3. Incident-speed clarity: Create endpoint → copy URL → send → inspect, no account wall.
Plus: reduce the mockups' orange outlines and waveforms by 60-70%; quiet background.
