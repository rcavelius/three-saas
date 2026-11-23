You are a senior art director at a top web studio. Give me a design direction for the marketing site of a small developer SaaS called WebhookTrail (webhooktrail.com), then generate image mockups.

PRODUCT: WebhookTrail gives you a private webhook capture URL in one click (no sign-up). Point Stripe, GitHub, CI or your own service at it, and every request (any method, any sub-path, headers, query, body) appears in a live inspector that polls every 2 seconds. Views: pretty JSON tree, form decoding, raw and hex, copy as cURL. Secrets in headers are masked until you reveal them. You can set the status code and body the URL replies with. Paid plans: longer history, more endpoints, and replay of captured requests to verified destinations. Free limits: 24 h endpoint lifetime (extendable to 7 days), newest N requests stored per endpoint, monthly quota.

AUDIENCE: backend and full-stack developers debugging webhook integrations (Stripe, GitHub, Shopify, etc.), often mid-incident.

CURRENT SITE: dark graphite console, one amber signal colour, Inter Tight + JetBrains Mono. Competent but generic "dark dev tool". Structure: slim header (Docs, Pricing, Tools, Guides, Help, Log in, Sign up); hero with H1 "See exactly what the webhook sent." + paragraph + "Create endpoint" button, and a spec table (methods, url pattern, stored body, history, quota, lifetime, reply); "your endpoints" list; a 3-step "capture / inspect / respond" grid; footer. Other pages: /tools (free webhook signature checkers etc.), /guides, /pricing, docs, auth, the inspector app itself.

TREND PICKS (from Figma's 2026 web trends): dark mode, retrofuturism (flight recorder / oscilloscope / phosphor display language), motion design (requests arriving live), bold typography, restrained keyboard-first navigation hints, sustainable web design (fast, no WebGL).

CONSTRAINTS: no fake testimonials, customer logos or invented stats. The hero visual must be the real product: a request inspector with a request list and a detail pane. Must look nothing like a sister product (a warm, light, editorial website scanner). Good mobile Lighthouse, reduced-motion support. Next.js + Tailwind v4 + Google fonts.

PLEASE GIVE ME:
1. Concept name and one-paragraph idea.
2. Type pairing (Google Fonts), sizes and tracking.
3. Palette with hex values (bg, surfaces, lines, text tiers, signal, HTTP method colours, ok/warn/error) and contrast notes.
4. Home page layout section by section, desktop and phone.
5. Motion plan with durations and easing, and reduced-motion behaviour.
6. Hero idea in detail, including the product visual.
7. Three things that would make this feel award-level rather than template dev-tool.
Then generate 2 images: (a) a desktop mockup of the hero with the inspector, (b) a desktop mockup of a "how it works" section and a pricing teaser.
