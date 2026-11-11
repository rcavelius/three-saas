# DataPolish

A spreadsheet cleaner that runs entirely in the browser. Files are read by the page, cleaned in a Web Worker and downloaded locally; nothing is uploaded. There is no AI in it: every step is a deterministic, unit-tested rule.

## Run

```bash
# from the repo root (dependencies are installed at the root)
npm run dev:datapolish          # http://localhost:3002
cd apps/datapolish
npx vitest run                  # unit + component tests
npx tsc -p tsconfig.json --noEmit
```

No environment variables are needed (see `.env.example`).

## What works

- **Load**: CSV/TSV/TXT (delimiter auto-detected: comma, semicolon, tab, pipe; BOM stripped; quoted commas/newlines; UTF-8 with Windows-1252 fallback; ragged rows padded and reported, extra cells kept as `extra_N` columns) and XLSX/XLS/ODS (choose sheet; dates as displayed or ISO; formulas read as cached values). "Try a sample file" loads a realistic messy orders export.
- **Steps** (ordered, toggleable, reorderable, each with a plain explanation): tidy headers (trim / snake_case / Title Case / lower, dedupe names with `_2`), trim whitespace (collapse runs, NBSP and zero-width characters), remove blank rows, remove duplicates (whole row or key columns, case/space-insensitive, keep first/last), standardise dates (ISO, US, EU, d.m.y, month names, Excel serials on request; ambiguous columns are flagged and left unchanged until you pick DMY or MDY), clean numbers (currency, separators, accounting negatives, %, decimal comma input, fixed decimals with exact string rounding), find & replace (literal/regex, whole cell, case, column scope, nested-quantifier rejection and a time budget), rename / reorder / drop / merge / split columns.
- **Preview**: cleaned grid with changed cells highlighted and optional old values, original grid with stray whitespace made visible and to-be-changed cells marked, removed rows with original row number and reason. Downloads unlock only when the preview matches the current steps.
- **Download**: cleaned CSV (separator, UTF-8 BOM, CRLF/LF, optional formula neutralising) or XLSX; the original file's exact bytes.
- **Several files** (free limit 3): merge (align by header name, loose header matching, explicit column matching, optional source-file column) or batch (same steps on each; one multi-sheet XLSX or one CSV per file).
- **Workflows**: saved to localStorage (guarded; private mode falls back to export only), export/import as versioned JSON validated with zod.
- **Limits**: 5 MB per file, 50,000 rows per file, 3 files, all in `src/lib/limits.ts`.
- **Pages**: `/` (tool), `/pricing`, `/signup` (placeholder, no checkout), `/guides` + 4 guides, `/privacy` and `/terms` (drafts marked as needing legal review).
- **Security headers** in `next.config.ts`: CSP with `connect-src 'self'` (the browser blocks sending data elsewhere), `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy.

## Layout

- `src/lib/engine/` pure TypeScript engine (no DOM): `parse`, `ops/*`, `pipeline` (runner with row/column provenance), `schema` (zod steps and workflows), `export`, `merge`.
- `src/lib/worker/` worker protocol and client (falls back to the main thread where Workers are unavailable, e.g. tests; a request over 60 s terminates the worker).
- `src/components/` the cleaner UI.

## Known gaps

- The 50,000-row limit is per file; a merge of three full files can reach 150,000 rows.
- No zip download for batch mode (no zip library installed); batch exports one multi-sheet XLSX or sequential CSV downloads.
- The regex safety check is a heuristic; the worker time-out is the backstop for patterns it misses.
- Two-digit years use a fixed pivot (00–49 → 20xx).
