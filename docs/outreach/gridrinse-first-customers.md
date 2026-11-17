# GridRinse — first-customer outreach drafts (2026-11-17)

Status: **drafts, nothing posted or sent.** Each item goes out only after Ronald approves it (his accounts, his name).
Rules we follow everywhere: say plainly that we made GridRinse, help first, no fake accounts, no asking for upvotes,
no claims we cannot back up (no user counts, no testimonials, no "trusted by").

Facts the copy relies on (checked in the code today):
- Runs in the browser; files are never uploaded. CSV, TSV, XLSX, XLSM, XLS, ODS.
- Steps: tidy headers, trim whitespace (incl. invisible characters), remove blank rows, remove duplicates (whole row or
  key columns), standardize dates (ambiguous day/month columns are flagged for you, never guessed), clean numbers
  ($1,234.50 → 1234.50, (45.00) → -45.00), find & replace, rename/reorder/drop/merge/split columns. The CSV download
  can also neutralize formulas (cells starting with =, +, @).
- Free: no account, up to 3 files at once, 5 MB, 50,000 rows. Steps can be saved in the browser or exported as JSON.
- Pro $9/month: 50 MB, 500,000 rows, 20 files at once, 50 workflows saved to your account. Business $29: 5 seats,
  shared team workflows. Cancel any time; 14-day refund rule.
- Guides that answer common questions: /guides/fix-excel-dates, /guides/dedupe-strategies,
  /guides/currency-and-number-formats, /guides/merge-csv-files, /guides/csv-encoding-excel, /guides/batch-clean-exports,
  /guides/csv-cleanup-checklist. Audience pages: /for/bookkeeping-exports, /for/ecommerce-exports, /for/crm-imports.

---

## 1. Product Hunt launch

Schedule for a Tuesday–Thursday, 12:01 am Pacific. Ronald posts as maker. Ask friends to *look and comment honestly*,
never to upvote (PH penalizes vote requests).

**Name:** GridRinse
**Tagline (≤60):** Clean messy CSV and Excel files without uploading them
**Topics:** Productivity, Spreadsheets, Privacy, Data
**Description (≤260):**
> Trim spaces, remove duplicates and blank rows, fix dates and money columns, then download a clean file. Everything
> runs in your browser, so your data never leaves your computer. Save the steps once and rerun them on next month's
> export in one click.

**Maker's first comment:**
> Hi Product Hunt, I'm Ronald, I made GridRinse.
>
> I kept getting the same messy exports every month: names with stray spaces, duplicate customers, dates that were
> half 03/04/2024 and half 2024-04-03, money columns full of "$1,234.50" that Excel treats as text. Fixing it by hand
> took 20 minutes each time, and I didn't want to upload client files to some random website to do it.
>
> So GridRinse does the cleaning in your browser. Nothing is uploaded. You pick the steps (trim, dedupe, standardize
> dates, clean numbers, split/merge columns...), check the before/after table, and download. If a date column could be
> day/month or month/day, it asks you instead of guessing.
>
> The free version needs no account. Pro ($9/month) is for people who clean the same export regularly: bigger files,
> 20 files at once and saved workflows.
>
> I'd really like to hear which export you fight with most (Shopify, QuickBooks, a CRM, a bank?). I'll use the answers
> to decide what to build next.

**Gallery (5 images, 1270×760):** 1) the workspace with a messy file loaded (use the built-in sample file, not real
data); 2) before/after table with changed cells highlighted; 3) the "Day first or month first?" prompt; 4) cleaning
steps list; 5) pricing summary. I can capture these headless from the live site once approved.

---

## 2. Reddit — help-first answers (no standalone promo posts)

Most of these subreddits remove self-promotion. So: answer an existing question fully *without* GridRinse first, then
one line disclosing it. Only reply where the question really is about cleaning data. Max a few replies per week per
subreddit, from Ronald's own long-standing account. Check each subreddit's rules before posting.

**r/excel — "Dates came in as text / some are DD/MM and some MM/DD"**
> If the column mixes both orders, Excel can't tell 03/04 apart, so check one value that is unambiguous (day above 12)
> to learn which order the source used. Then:
> 1. Select the column → Data → Text to Columns → Delimited → Next → Next → Column data format: Date, pick DMY or
>    MDY to match the source → Finish.
> 2. Format the column as yyyy-mm-dd so the result is obvious.
> 3. Anything still left-aligned didn't convert; filter for those and fix by hand.
>
> If you do this on the same export every month, I built a free browser tool for it, GridRinse (disclosure: it's
> mine). It flags day/month-ambiguous columns and asks instead of guessing, and nothing gets uploaded:
> https://gridrinse.com/guides/fix-excel-dates

**r/excel — "Remove duplicates but keep the latest row"**
> Sort by the date column newest-first, then Data → Remove Duplicates and tick only the key column (e.g. Email).
> Excel keeps the first occurrence, which after the sort is the newest. Make a copy first, since it deletes in place.
> I wrote up the other cases (whole-row vs key-column, near-duplicates with stray spaces) here, from a tool I make:
> https://gridrinse.com/guides/dedupe-strategies

**r/shopify — "Customer/order export is a mess before importing into X"**
> Usual culprits in Shopify exports: leading/trailing spaces in names and emails (break matching), the same customer
> twice with different capitalization, phone numbers stored as numbers that lose the leading zero, and prices as text.
> Trim + lowercase emails before deduping, and keep phone as text. Disclosure, I make GridRinse, which does these
> steps in the browser without uploading the file, and you can save them for next time:
> https://gridrinse.com/for/ecommerce-exports

**r/Bookkeeping — "Bank CSV won't import / amounts in parentheses"**
> Accounting exports often show negatives as (45.00) and add currency symbols and thousands separators, which import
> tools reject. Replace "(" with "-" and remove ")", "$" and "," in the amount column (Find & Replace, whole column
> only), then make sure the column is numeric. Watch for European formats where "," is the decimal separator.
> Disclosure: I make GridRinse, a browser tool that does this cleanup without uploading client data:
> https://gridrinse.com/for/bookkeeping-exports

---

## 3. AlternativeTo listing

Add GridRinse as an alternative to **OpenRefine**, **Trifacta/Alteryx Designer Cloud** and **CSV Clean** (only where it
really overlaps).

- **Name:** GridRinse
- **Website:** https://gridrinse.com
- **License / pricing:** Freemium (free without account; Pro $9/month)
- **Platforms:** Online / Web
- **Short description:** Clean CSV and Excel files in your browser: trim spaces, remove duplicates and blank rows,
  standardize dates and numbers, split and merge columns. Files are processed locally and never uploaded. Saved
  workflows rerun the same cleanup on each new export.
- **Features (tags):** Privacy focused, Works offline (after load) — **only if verified**, Data cleaning, CSV, Excel,
  No registration required
- Note to self: check "works offline" before ticking it; drop it if not true.

---

## 4. Indie Hackers post (Ronald's account, "Building in public")

**Title:** Launched a privacy-first CSV cleaner. 54 visitors and $0 so far, here's my plan

> I launched GridRinse a week ago: a browser-based cleaner for messy CSV/Excel exports (trim, dedupe, dates, money
> columns). Files never leave the browser, so bookkeepers and HR people can use it on client data.
>
> Honest numbers from week one: ~54 visitors, 4 people tried the tool, 0 signups, $0 revenue. Google hadn't even indexed
> the site until today.
>
> What I'm doing next:
> - Search: submitted to Google Search Console; writing guides for specific exports (Shopify, QuickBooks, bank CSVs).
> - Communities: answering real "how do I clean this CSV" questions, disclosing that I made the tool.
> - Pricing: Pro is $9/month for bigger files and saved workflows; free needs no account.
>
> The space is crowded (lots of free browser CSV tools). My bet is that the people who pay are the ones cleaning the
> *same* export every week, so saved workflows are the paid hook. If you've sold a small utility like this, what got
> your first 10 customers?

(Numbers must be refreshed on the day it is posted.)

---

## 5. Cold email to small bookkeeping firms (20, personal, one by one)

Find firms with a public contact address (their own website, 1–10 staff). Send from Ronald's own address, one email
each, no tracking pixels. CAN-SPAM: real sender, postal address, honest subject, and stop on any "no".

**Subject:** Cleaning client CSV exports without uploading them

> Hi {first name},
>
> I'm Ronald. I make GridRinse, a small tool for cleaning the messy CSV and Excel exports bookkeepers get from banks,
> Shopify and payroll systems: stray spaces, duplicate rows, mixed date formats, amounts like "(1,234.50)".
>
> It runs entirely in the browser, so client files are never uploaded anywhere, and you can save the cleanup steps and
> rerun them on next month's export.
>
> Would you try it on one real export and tell me what's missing? If it's useful I'll give your firm a free month of
> Pro, no card needed. Honest feedback is all I'm after, even if it's "not for us".
>
> https://gridrinse.com/for/bookkeeping-exports
>
> Thanks,
> Ronald Cavelius
> GridRinse · Media Masters LLC · 37837 Fenwick Circle, Selbyville, DE 19975
> If you'd rather not hear from me again, just reply "no" and I won't write again.

Note: a free month needs a coupon. I'd create a Stripe promotion code (100% off, 1 month, limited redemptions) and
turn on `allowPromotionCodes` for GridRinse checkout. Needs Ronald's OK because it touches live Stripe.

---

## 6. Shopify Community / QuickBooks Community answers

Same approach as Reddit: answer fully, then one disclosed link to the matching guide. Reuse the r/shopify and
r/Bookkeeping answers above, adapted to the thread.

---

## Tracking

Every link above can carry `?ref=producthunt`, `?ref=reddit`, `?ref=alternativeto`, `?ref=indiehackers`,
`?ref=email` so the funnel report shows which channel brings visitors and signups. (The analytics currently record no
referrer at all, so I'd add a `ref` capture; small code change.)
