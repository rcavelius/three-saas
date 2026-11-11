---
title: Supported file formats and size limits
slug: file-formats-and-limits
summary: Which files DataPolish can open and export, how CSV and Excel files are read, and the file size, row and batch limits on each plan.
category: Getting started
updated: 2026-11-11
---
## Files you can open

- **Text files**: `.csv`, `.tsv` and `.txt`
- **Workbooks**: `.xlsx`, `.xlsm`, `.xls` and `.ods`

Other file types are refused with a message saying the file is not a CSV or Excel file.

### How CSV and text files are read

- The separator is detected automatically: comma, semicolon, tab or pipe. A `.tsv` file is always read as tab separated.
- The text is read as UTF-8 first. If the file is not valid UTF-8, it is read as Windows-1252 (common for older Excel exports) and the file shows a warning.
- If some rows have fewer cells than the header, they are padded with empty cells. If some rows have more, extra columns named `extra_1`, `extra_2` and so on are added, so no data is lost. A warning lists the affected rows.
- Blank header names become `column_1`, `column_2` and so on, and duplicate header names get a `_2` suffix.

### How workbooks are read

- The first sheet is read by default. Use the **Sheet** menu to choose another.
- Formulas are read as the values Excel last calculated. Nothing is recalculated.
- The **Dates** menu chooses whether date cells are read **as shown in Excel** or **as ISO (YYYY-MM-DD)**.

## Files you can download

- **CSV**: comma, semicolon or tab separator (tab downloads as `.tsv`). Options: **Excel-friendly (UTF-8 BOM)** and **Windows line endings (CRLF)**, both on by default, and **Neutralise formulas (=, +, @)**, off by default.
- **XLSX**: plain numbers are stored as real numbers; values with leading zeros such as `00123` stay as text.
- **Batch mode**: a ZIP of CSVs, a ZIP of XLSX files, or one XLSX with one sheet per file.

## Plan limits

These limits apply to files processed in your browser:

- **Free**: files up to 5 MB, 50,000 rows per file, 3 files at once
- **Pro**: files up to 50 MB, 500,000 rows per file, 20 files at once
- **Business**: files up to 200 MB, 2,000,000 rows per file, 100 files at once

The drop area shows the limits for your current plan. If a file is too big, you see a message such as "your plan handles files up to 5.0 MB" and a link to see plans with larger limits. The row limit applies per file, so merging several full files can produce a larger table.

## Browser safety limits on every plan

Because cleaning happens in your browser tab, DataPolish also protects the tab from running out of memory. Even on Business:

- one file can be at most 256 MB
- all loaded files together can be at most 512 MB
- one file can have at most 2,000,000 rows and 40 million cells (rows times columns)
- all loaded files together can have at most 60 million cells

Before reading a file, DataPolish estimates how much memory it needs compared with what your device has. If it is too much, the file is not opened and you are told why. If it is close to the limit, you get a warning that cleaning may be slow. See [Troubleshooting](/help/troubleshooting) for tips on large files.
