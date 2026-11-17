---
title: Getting started with GridRinse
slug: getting-started
summary: Clean your first CSV or Excel file in three steps: load it, choose cleaning steps, check the preview and download. No account needed.
category: Getting started
updated: 2026-11-11
---
GridRinse cleans CSV and Excel files inside your web browser. You do not need an account to use the cleaner, and your file is never uploaded. Open the cleaner on the [home page](/) to begin.

## Step 1: Load a file

1. Drag a CSV or Excel file onto the drop area, or click **Choose file…**.
2. If you just want to look around, click **Try a sample file** instead.

The file is read by your browser. Under the file name you will see its size, the number of rows and columns, the detected separator for CSV files, and the text encoding if it was not UTF-8. For workbooks with several sheets, pick the **Sheet** to clean. Untick **First row is the header** if your file has no header row.

## Step 2: Choose cleaning steps

When the first file loads, GridRinse adds a set of default steps that run from top to bottom:

- **Tidy column headers**
- **Trim whitespace**
- **Remove blank rows**
- **Remove duplicate rows** (whole rows must match)
- **Standardize dates**
- **Clean numbers** (switched on only when number columns were detected)

Each step has a checkbox to switch it on or off, arrows to move it up or down, a remove button and an **Options** link. Use **Add step** to add more, such as Find & replace or Split a column. Steps marked **removes data** delete rows or columns. **Reset** puts the default steps back. See [Cleaning steps explained](/help/cleaning-steps) for what each step does.

## Step 3: Check the result, then download

The preview updates as you change steps. At the top you see rows before and after, rows removed, cells changed and columns before and after. Three tabs help you check the work:

- **Cleaned**: the result, with changed cells highlighted. Tick **Only changed rows** or **Show old values** to focus on changes.
- **Original**: your file as loaded, with cells that will change highlighted and stray spaces shown as dots.
- **Removed rows**: every row a step deleted, with its original row number and the step that removed it.

When the preview matches your steps, the download buttons unlock. Choose **Download cleaned CSV** or **Download cleaned XLSX**. **Download original** gives you back the exact file you loaded.

## Working with several files

Add more files to the same page and choose **Merge** to stack them into one table, or **Batch** to clean each file separately with the same steps. Batch mode offers a ZIP of CSVs, a ZIP of XLSX files, or one XLSX with a sheet per file.

## Next steps

- Save your steps as a workflow to reuse them: see [Saved workflows](/help/saved-workflows).
- Check what your plan allows: see [File formats and limits](/help/file-formats-and-limits).
- Read the [guides](/guides) for help with dates, duplicates, numbers, encodings and merging.

**Start over** clears everything from the page. Nothing is kept.
