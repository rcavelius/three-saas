---
title: Cleaning steps explained
slug: cleaning-steps
summary: What each of the 12 GridRinse cleaning steps does to your data, and the options you can set for each one.
category: Getting started
updated: 2026-11-11
---
Steps run from top to bottom, and each step works on the result of the one before. Every step is a fixed, predictable rule; there is no AI guessing. Open a step's **Options** to change its settings. Steps marked **removes data** delete rows or columns, and every removed row appears in the **Removed rows** tab with the step that removed it.

## Tidy column headers

Trims header names, names blank headers and gives duplicate names a `_2` suffix. **Header style** can keep names as they are (trim only), or convert them to snake_case, Title Case or lower case. Later steps keep pointing at the same columns when you change the style.

## Trim whitespace

Removes spaces at the start and end of cells. Options: **Squeeze repeated spaces inside cells** and **Fix invisible characters (non-breaking, zero-width)**, both on by default. Choose columns, or leave none ticked to trim all columns.

## Remove blank rows

Deletes rows where every cell is empty or only spaces.

## Remove duplicate rows

Deletes repeated rows. **Compare by** lets you tick key columns such as Email; with none ticked, the whole row must match. Choose whether to keep the **first** or **last** copy, and whether to **Ignore upper/lower case** and **Ignore extra spaces** (on by default). See the guide on [removing duplicates](/guides/dedupe-strategies).

## Standardize dates

Finds date columns and rewrites every date in one output format: `YYYY-MM-DD` (the default), `MM/DD/YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`, `D MMM YYYY` or `MMM D, YYYY`.

- **Ambiguous dates like 03/04/2024**: by default the step decides per column from the data. If a column could be day-first or month-first, it is left unchanged and flagged so you can choose **DMY** or **MDY**. You can also force day first or month first for all columns.
- **Keep times after the date** is on by default.
- **Treat plain numbers as Excel date serials** (45296 = 2024-01-05) is off by default; tick it and choose the column explicitly.
- Two-digit years 00 to 49 become 20xx; 50 to 99 become 19xx.
- Values that cannot be read are left unchanged.

See the guide on [fixing Excel dates](/guides/fix-excel-dates).

## Clean numbers

Strips currency symbols and thousands separators and turns `(45.00)` into `-45.00`. Tick the columns that hold amounts. Options: number of **Decimals**, **Percentages** (keep the % sign, drop it, or convert to a fraction), **Input uses a decimal comma (1.234,50)** and **Add thousands separators to the output**. See the guide on [currency and number formats](/guides/currency-and-number-formats).

## Find & replace

Replaces text. Options: **Whole cell must match**, **Match case**, **Regular expression**, and which columns to search (none ticked means all columns). Very slow regular expressions are caught by a safety check, and any processing that runs longer than three minutes is stopped.

## Rename columns

Type a new name next to any column. Leave it blank to keep the name.

## Reorder columns

Moves the columns you tick to the front, in the order you tick them.

## Drop columns

Removes the columns you tick.

## Merge columns

Joins two or more columns into one, for example First + Last into Full name. Set the separator and the new column name. Options: **Keep the original columns** and **Skip empty parts**.

## Split a column

Splits one column into several at a separator, for example "Lee, Ann" into Last and First. Enter the new names separated by commas. Option: **Keep the original column**.

## Tips

Untick a step's checkbox to switch it off without deleting it. If a step cannot run, its card shows "Not applied" with the reason. Save your steps as a [workflow](/help/saved-workflows).
