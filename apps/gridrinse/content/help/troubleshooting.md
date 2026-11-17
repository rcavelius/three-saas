---
title: Troubleshooting common problems
slug: troubleshooting
summary: Fixes for files that will not open, broken accents, wrong dates, large or slow files, missing verification emails and login problems.
category: Troubleshooting
updated: 2026-11-11
---
## The file will not open

- **"Not a CSV or Excel file"**: GridRinse opens `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xlsm`, `.xls` and `.ods`. Save or export the file in one of these formats.
- **"The file is empty" or "The sheet is empty"**: for workbooks, pick another sheet in the **Sheet** menu.
- **Everything is in one column**: check the separator shown under the file name. Separators are detected automatically (comma, semicolon, tab, pipe).
- **The first row of data became the header**: untick **First row is the header**.
- **Warnings about rows with a different number of cells**: short rows were padded with empty cells and extra cells went into `extra_` columns. Nothing was dropped; check the listed rows in the Original tab.

## Accents look wrong (Ã© instead of é)

GridRinse reads files as UTF-8 and falls back to Windows-1252 when the bytes are not valid UTF-8; the file line shows which was used. When you download a CSV for Excel, keep **Excel-friendly (UTF-8 BOM)** ticked, or download XLSX instead. If Excel puts everything in column A, use the **semicolon** separator. See the guide on [CSV encoding in Excel](/guides/csv-encoding-excel).

## Dates are wrong or not changed

- A column like `03/04/2024` that could be day-first or month-first is left unchanged and flagged in **Standardize dates**. Choose **DMY** or **MDY** for that column.
- Numbers such as `45296` are Excel date serials. Tick **Treat plain numbers as Excel date serials** in the step options and choose the column.
- For Excel files, try the file's **Dates** menu: **as shown in Excel** or **as ISO (YYYY-MM-DD)**.
- Values that cannot be read as dates are left as they were.
- Excel may re-format dates when you double-click a CSV. Download XLSX to avoid this. See [fixing Excel dates](/guides/fix-excel-dates).

## Large files, limits and slow cleaning

- **"Your plan handles files up to …"** or **"… rows per file"**: the file is over your plan's limit. See [Plans and limits](/help/plans-and-limits), or split the file.
- **"Would need about … of memory"**: the browser tab does not have enough memory. Split the file, close other tabs, remove other loaded files, or use a computer with more memory.
- **Cleaning is slow**: use **Cancel**, then change a step or press **Run again**.
- **"Processing took longer than three minutes and was stopped"**: a find & replace pattern may be too slow, or the file too large. Simplify the regular expression or split the file.
- **"The processing worker crashed"**: try again; if it keeps happening, the file may be too large for this browser.
- **Download buttons are disabled**: wait until the preview has updated; downloads unlock when the preview matches your steps.

## The verification email has not arrived

1. Check your spam or junk folder.
2. Go to [/verify-email](/verify-email), enter your email and click **Send a new link**.
3. Links last 1 hour. If a link says it is invalid or expired, request a new one.

If you request several links in a short time, you may be asked to wait a few minutes.

## I cannot log in

- **"Confirm your email address first"**: open the link in your verification email, or request a new one as above.
- **"Email or password is incorrect"**: check the address, or use [Forgot password](/forgot-password). The reset link expires in 1 hour, and resetting signs you out on all devices.
- **Too many attempts**: wait a minute and try again.
- **Signed out unexpectedly**: changing your password signs out other devices, and **Sign out everywhere** ends every session.

## Still stuck?

See [Getting help](/help/getting-help).
