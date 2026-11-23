import { runPipeline } from "@/lib/engine/pipeline";
import { makeStep } from "@/lib/engine/schema";

/**
 * One landing page per common cleanup task (the "one page per job" pattern of tools like ilovepdf): someone
 * searching "remove duplicates from csv" lands on a page that does exactly that, with the real cleaner on it.
 * Every "after" example is computed by the engine at render time, so a page can only show what the tool does.
 */
type Table = { columns: string[]; rows: string[][] };

export interface ToolPage {
  slug: string;
  /** <title> and search snippet: the phrase people type. */
  title: string;
  h1: string;
  description: string;
  intro: string;
  /** Which cleaning step does the job, as named in the app. */
  stepName: string;
  howTo: string[];
  example: { input: Table; steps: Parameters<typeof runPipeline>[1]; note: string };
  faq: { q: string; a: string }[];
  guide?: { href: string; label: string };
}

export const TOOLS: ToolPage[] = [
  {
    slug: "remove-duplicates-csv",
    title: "Remove duplicate rows from a CSV or Excel file (free, no upload)",
    h1: "Remove duplicate rows from a CSV or Excel file",
    description:
      "Delete repeated rows from a CSV or Excel file in your browser. Compare whole rows or only key columns like Email. Free, no account, your file is never uploaded.",
    intro:
      "Exports from shops, CRMs and sign-up forms often list the same person or order twice. GridRinse finds rows that repeat and removes them, keeping the first one, and shows you exactly which rows go before you download.",
    stepName: "Remove duplicate rows",
    howTo: [
      "Choose your CSV or Excel file above (or try the sample).",
      "Leave \"Remove duplicate rows\" on. To match on one column only, such as Email, open the step and pick it as the key.",
      "Check the highlighted rows in the review table, then download the cleaned file.",
    ],
    example: {
      input: {
        columns: ["Email", "Name", "Plan"],
        rows: [
          ["ann@example.com", "Ann Lee", "Pro"],
          ["sam@example.com", "Sam Park", "Free"],
          ["ann@example.com", "Ann Lee", "Pro"],
        ],
      },
      steps: [makeStep({ type: "dedupe" })],
      note: "The repeated row for ann@example.com is removed.",
    },
    faq: [
      { q: "Which copy is kept?", a: "The first occurrence is kept and later repeats are removed. Sort the file first if you want to keep, for example, the newest row." },
      { q: "Can it match on one column, like Email?", a: "Yes. Open the step and choose key columns; rows count as duplicates when those columns match, even if other columns differ." },
      { q: "Do \"Ann Lee\" and \"Ann  Lee \" count as the same?", a: "They do once the Trim whitespace step runs first, which it does by default." },
    ],
    guide: { href: "/guides/dedupe-strategies", label: "Guide: ways to deduplicate a spreadsheet" },
  },
  {
    slug: "remove-blank-rows-csv",
    title: "Remove blank rows from a CSV or Excel file (free, no upload)",
    h1: "Remove blank rows from a CSV or Excel file",
    description:
      "Delete empty rows from a CSV or Excel file in seconds. Rows that contain only spaces count as blank too. Free, in your browser, nothing uploaded.",
    intro:
      "Blank rows break imports, sorting and pivot tables. GridRinse removes every row where all cells are empty or only spaces, and leaves rows with any real value alone.",
    stepName: "Remove blank rows",
    howTo: [
      "Choose your CSV or Excel file above.",
      "\"Remove blank rows\" is on by default.",
      "Review the removed rows, then download.",
    ],
    example: {
      input: {
        columns: ["Customer", "Amount"],
        rows: [
          ["Maria Lopez", "1234.50"],
          ["", ""],
          ["Ethan Clark", "-45.00"],
          ["  ", ""],
        ],
      },
      steps: [makeStep({ type: "removeBlankRows" })],
      note: "Both empty rows are removed, including the one that only contains spaces.",
    },
    faq: [
      { q: "Will it delete rows that are only partly empty?", a: "No. A row is removed only when every cell is empty or only whitespace." },
      { q: "Can I undo it?", a: "Your original file is never changed. Turn the step off or download again without it." },
    ],
    guide: { href: "/guides/csv-cleanup-checklist", label: "Guide: a practical CSV cleanup checklist" },
  },
  {
    slug: "trim-spaces-csv",
    title: "Remove extra spaces from CSV and Excel cells (free, no upload)",
    h1: "Remove extra spaces from CSV and Excel cells",
    description:
      "Trim leading and trailing spaces, squeeze double spaces and remove invisible characters (non-breaking and zero-width spaces) from every cell. Free, in your browser.",
    intro:
      "Stray spaces are why \"Ann Lee\" and \"Ann Lee \" don't match in a lookup. GridRinse trims every cell, squeezes repeated spaces and turns invisible characters copied from web pages into normal ones.",
    stepName: "Trim whitespace",
    howTo: ["Choose your file above.", "\"Trim whitespace\" is on by default.", "Changed cells are highlighted in the review; download when it looks right."],
    example: {
      input: { columns: ["Name", "City"], rows: [["  Maria  Lopez ", "New York"], ["Ethan Clark​", " Austin"]] },
      steps: [makeStep({ type: "trim" })],
      note: "Leading, trailing, doubled and invisible spaces are all cleaned up.",
    },
    faq: [
      { q: "What are invisible characters?", a: "Non-breaking spaces and zero-width spaces often come along when you copy from websites or PDFs. They look like normal spaces (or nothing) but break matching." },
      { q: "Does it change spaces inside a value?", a: "Only repeated ones: two or more spaces in a row become one. Single spaces between words stay." },
    ],
    guide: { href: "/guides/csv-cleanup-checklist", label: "Guide: a practical CSV cleanup checklist" },
  },
  {
    slug: "fix-dates-csv",
    title: "Convert dates in a CSV to one format, like YYYY-MM-DD (free)",
    h1: "Convert every date in a CSV to one format",
    description:
      "Turn mixed dates like \"Jan 17, 2024\", \"17/01/2024\" and \"2024-01-17\" into one format. Unclear day/month columns are flagged, never guessed. Free, no upload.",
    intro:
      "Exports mix date styles, and Excel quietly misreads 03/04 as March or April depending on your settings. GridRinse finds date columns, rewrites them in one format, and when a column could be either day-first or month-first it asks you instead of guessing.",
    stepName: "Standardize dates",
    howTo: [
      "Choose your file above.",
      "\"Standardize dates\" is on by default. If a yellow banner asks \"Day first or month first?\", pick the order your source uses.",
      "Check the review, then download.",
    ],
    example: {
      input: { columns: ["Order", "Date"], rows: [["1001", "Jan 17, 2024"], ["1002", "2024-02-03"], ["1003", "March 9, 2024"]] },
      steps: [makeStep({ type: "formatDates" })],
      note: "Every date comes out as YYYY-MM-DD.",
    },
    faq: [
      { q: "What about 03/04/2024?", a: "If the column has no value that settles it (a day above 12), GridRinse flags the column and asks whether it is day-first or month-first. It never guesses." },
      { q: "Can I choose the output format?", a: "Yes, open the step to pick the format you need." },
    ],
    guide: { href: "/guides/fix-excel-dates", label: "Guide: fix dates Excel got wrong" },
  },
  {
    slug: "clean-numbers-csv",
    title: "Remove $ signs and commas from numbers in a CSV (free)",
    h1: "Turn \"$1,234.50\" into a real number",
    description:
      "Strip currency symbols and thousands separators, and turn accounting negatives like (45.00) into -45.00, so numbers import and add up. Free, in your browser.",
    intro:
      "Money columns from banks and accounting tools come out as text: \"$1,234.50\", \"(45.00)\". Spreadsheets and import tools can't add those up. GridRinse cleans the columns you choose into plain numbers.",
    stepName: "Clean numbers",
    howTo: [
      "Choose your file above.",
      "Open \"Clean numbers\" and pick the money or number columns (likely ones are suggested).",
      "Check the review, then download.",
    ],
    example: {
      input: { columns: ["Description", "Amount"], rows: [["Invoice 1042", "$1,234.50"], ["Refund", "(45.00)"], ["Fee", "$7"]] },
      steps: [makeStep({ type: "formatNumbers", columns: ["Amount"], decimals: 2 })],
      note: "Symbols and separators are removed and negatives in parentheses get a minus sign.",
    },
    faq: [
      { q: "Does it handle European formats like 1.234,50?", a: "Open the step to set the decimal separator your file uses; it is not guessed silently." },
      { q: "Can I fix the number of decimals?", a: "Yes, the step can round to a fixed number of decimal places." },
    ],
    guide: { href: "/guides/currency-and-number-formats", label: "Guide: currency and number formats" },
  },
  {
    slug: "merge-csv-files",
    title: "Combine multiple CSV or Excel files into one (free, no upload)",
    h1: "Combine several CSV or Excel files into one",
    description:
      "Merge monthly exports into one file. Columns are matched by name even when the order differs, and a column can record each row's source file. Free, in your browser.",
    intro:
      "Twelve monthly exports, one report. Choose several files at once and GridRinse stacks them into one table, matching columns by name, then runs the same cleanup on the result.",
    stepName: "Merge (choose more than one file)",
    howTo: [
      "Choose two or more files above (up to 3 on the free plan, 20 on Pro).",
      "Keep \"Merge into one table\" selected and check how the columns were matched.",
      "Review and download one combined file.",
    ],
    example: {
      input: { columns: ["Month", "Customer", "Amount"], rows: [["Jan", "Maria Lopez", "1234.50"], ["Feb", "Ethan Clark", "45.00"]] },
      steps: [],
      note: "Two monthly files become one table with a shared header.",
    },
    faq: [
      { q: "What if the columns are in a different order?", a: "Columns are matched by name, so order doesn't matter. You can map differently named columns by hand." },
      { q: "How many files can I combine?", a: "3 at once on the free plan, 20 on Pro and 100 on Business." },
    ],
    guide: { href: "/guides/merge-csv-files", label: "Guide: merging CSV files" },
  },
  {
    slug: "csv-to-excel",
    title: "Convert CSV to Excel (XLSX) online, free and private",
    h1: "Convert a CSV file to Excel (XLSX)",
    description:
      "Turn a CSV or TSV file into an Excel .xlsx workbook in your browser, and clean it on the way if you like. Free, no account, your file is never uploaded.",
    intro:
      "Opening a CSV straight in Excel can mangle leading zeros, long numbers and dates. GridRinse reads the CSV as text, lets you clean it, and saves a proper .xlsx file.",
    stepName: "Download as Excel (.xlsx)",
    howTo: [
      "Choose your CSV or TSV file above.",
      "Turn off any cleaning steps you don't want (or keep them to tidy the data first).",
      "In \"Download your file\", choose Excel (.xlsx).",
    ],
    example: { input: { columns: [], rows: [] }, steps: [], note: "" },
    faq: [
      { q: "Is my file uploaded to convert it?", a: "No. The conversion happens in your browser; the file never reaches our servers." },
      { q: "Can I convert several CSV files at once?", a: "Yes: choose several files and either merge them into one workbook or clean each separately and download them together (3 files on the free plan, 20 on Pro)." },
      { q: "What about semicolon-separated files?", a: "The separator is detected when the file is read, so semicolon and tab files work too." },
    ],
    guide: { href: "/guides/csv-encoding-excel", label: "Guide: CSV files and Excel encoding problems" },
  },
  {
    slug: "excel-to-csv",
    title: "Convert Excel (XLSX, XLS, ODS) to CSV online, free",
    h1: "Convert an Excel file to CSV",
    description:
      "Save an .xlsx, .xls or .ods spreadsheet as a clean CSV or TSV file, ready to import anywhere. Runs in your browser; the file is never uploaded. Free, no account.",
    intro:
      "Most import tools want CSV. GridRinse opens your Excel or OpenDocument file, tidies it if you want, and saves a CSV with the delimiter you choose.",
    stepName: "Download as CSV",
    howTo: [
      "Choose your .xlsx, .xlsm, .xls or .ods file above.",
      "Keep or turn off the cleaning steps.",
      "In \"Download your file\", choose CSV (or tab-separated) and download.",
    ],
    example: { input: { columns: [], rows: [] }, steps: [], note: "" },
    faq: [
      { q: "Which Excel formats can I open?", a: ".xlsx, .xlsm, .xls and OpenDocument .ods, plus .csv, .tsv and .txt." },
      { q: "Can I protect against formula injection?", a: "Yes. The CSV download can neutralize cells that start with =, +, @ so they can't run as formulas when someone opens the file." },
    ],
    guide: { href: "/guides/csv-encoding-excel", label: "Guide: CSV files and Excel encoding problems" },
  },
  {
    slug: "split-column-csv",
    title: "Split a column in a CSV, like full name into first and last",
    h1: "Split one column into several",
    description:
      "Split a CSV or Excel column at a separator, for example \"Lee, Ann\" into Last and First, or \"City, State\" into two columns. Free, in your browser, no upload.",
    intro:
      "Names, addresses and codes often arrive squashed into one column. GridRinse splits the column at the separator you choose into as many new columns as you name.",
    stepName: "Split a column",
    howTo: [
      "Choose your file above.",
      "Add the step \"Split a column\", pick the column, type the separator (such as a comma) and name the new columns.",
      "Check the review, then download.",
    ],
    example: {
      input: { columns: ["Name", "Email"], rows: [["Lee, Ann", "ann@example.com"], ["Park, Sam", "sam@example.com"]] },
      steps: [makeStep({ type: "splitColumn", column: "Name", separator: ", ", into: ["Last", "First"] })],
      note: "\"Lee, Ann\" becomes Last = Lee and First = Ann.",
    },
    faq: [
      { q: "Can I keep the original column?", a: "Yes, there's an option to keep it next to the new ones." },
      { q: "What if a value has more parts than columns?", a: "Name as many columns as the most parts you expect; check the review table before downloading." },
    ],
  },
  {
    slug: "combine-columns-csv",
    title: "Combine two columns in a CSV, like first + last name",
    h1: "Combine columns into one",
    description:
      "Join two or more CSV or Excel columns into one, such as First + Last into Full name, with the separator you choose. Empty parts are skipped. Free, no upload.",
    intro:
      "Many imports want a single \"Full name\" or \"Address\" field. GridRinse joins the columns you pick, in order, with a space, comma or any separator.",
    stepName: "Merge columns",
    howTo: [
      "Choose your file above.",
      "Add the step \"Merge columns\", pick the columns in order, choose the separator and name the new column.",
      "Check the review, then download.",
    ],
    example: {
      input: { columns: ["First", "Last", "Email"], rows: [["Ann", "Lee", "ann@example.com"], ["Sam", "", "sam@example.com"]] },
      steps: [makeStep({ type: "mergeColumns", columns: ["First", "Last"], separator: " ", into: "Full name" })],
      note: "First and Last become one Full name column; the empty last name is skipped, so there's no trailing space.",
    },
    faq: [
      { q: "Are the original columns removed?", a: "By default yes; turn on \"keep originals\" to keep them too." },
      { q: "Can I use a comma as the separator?", a: "Yes, any separator up to 20 characters." },
    ],
  },
  {
    slug: "find-replace-csv",
    title: "Find and replace in a CSV or Excel file (free, no upload)",
    h1: "Find and replace across a CSV or Excel file",
    description:
      "Replace text in every cell or only some columns, match whole cells only, ignore case, or use a regular expression. Preview every change. Free, in your browser.",
    intro:
      "Rename a product everywhere, fix a misspelled city, or standardize \"N/A\", \"n/a\" and \"-\" to blank. GridRinse shows every changed cell before you download.",
    stepName: "Find & replace",
    howTo: [
      "Choose your file above.",
      "Add the step \"Find & replace\", type what to find and what to replace it with, and optionally limit it to some columns or whole cells.",
      "Check the highlighted cells, then download.",
    ],
    example: {
      input: { columns: ["Product", "Status"], rows: [["Widget", "N/A"], ["Gadget", "shipped"], ["Gizmo", "n/a"]] },
      steps: [makeStep({ type: "findReplace", find: "n/a", replace: "", wholeCell: true })],
      note: "Cells that are exactly \"N/A\" in any capitalization become blank; other cells are untouched.",
    },
    faq: [
      { q: "Does it support regular expressions?", a: "Yes, switch on regex in the step." },
      { q: "Can I limit it to one column?", a: "Yes, pick the columns it should apply to; by default it applies to all." },
    ],
  },
  {
    slug: "remove-columns-csv",
    title: "Delete columns from a CSV or Excel file online (free)",
    h1: "Remove columns you don't need",
    description:
      "Drop unwanted columns from a CSV or Excel export before you import or share it, such as internal IDs or personal data. Free, in your browser, no upload.",
    intro:
      "Exports come with dozens of columns you don't need, and some you shouldn't share. GridRinse removes the columns you pick and can reorder and rename the rest.",
    stepName: "Drop columns",
    howTo: [
      "Choose your file above.",
      "Add the step \"Drop columns\" and tick the columns to remove. Add \"Reorder columns\" or \"Rename columns\" if you need them too.",
      "Check the review, then download.",
    ],
    example: {
      input: { columns: ["id", "Name", "Email", "internal_note"], rows: [["17", "Ann Lee", "ann@example.com", "VIP"], ["18", "Sam Park", "sam@example.com", ""]] },
      steps: [makeStep({ type: "dropColumns", columns: ["id", "internal_note"] })],
      note: "Only Name and Email are left.",
    },
    faq: [
      { q: "Is the original file changed?", a: "No. Your original file stays as it is; you download a new, cleaned copy." },
      { q: "Can I save these steps for next month's export?", a: "Yes. Save the steps in your browser for free, or to your account on Pro to use them anywhere." },
    ],
  },
  {
    slug: "clean-csv-headers",
    title: "Clean up CSV column headers: snake_case, Title Case (free)",
    h1: "Clean up CSV and Excel column headers",
    description:
      "Trim messy column names, convert them to snake_case, Title Case or lower case, and fix blank or duplicate headers before an import. Free, in your browser, no upload.",
    intro:
      "Importers often reject headers with stray spaces, mixed capitalization, blank names or duplicates. GridRinse tidies the header row in one step and shows which columns were renamed before you download.",
    stepName: "Tidy column headers",
    howTo: [
      "Choose your file above.",
      "Open the step \"Tidy column headers\" and pick a style: trim only, snake_case, Title Case or lower case.",
      "Check the renamed columns in the review, then download.",
    ],
    example: {
      input: { columns: ["  First Name ", "Order ID", "orderDate", ""], rows: [["Ann", "1001", "2024-01-17", "x"], ["Sam", "1002", "2024-02-03", "y"]] },
      steps: [makeStep({ type: "normalizeHeaders", style: "snake" })],
      note: "Headers become first_name, order_id and order_date; the blank header gets the name column_4.",
    },
    faq: [
      { q: "What happens to blank or duplicate headers?", a: "Blank headers get a name like column_4, and duplicate names get a _2 suffix, so every column has a unique name." },
      { q: "Can I only trim spaces and keep my capitalization?", a: "Yes, the \"trim only\" style keeps your wording and just removes stray and invisible spaces." },
      { q: "Is the data below the header changed?", a: "No. Only the header row is renamed by this step." },
    ],
    guide: { href: "/guides/csv-cleanup-checklist", label: "Guide: a CSV cleanup checklist" },
  },
  {
    slug: "rename-columns-csv",
    title: "Rename and reorder columns in a CSV or Excel file (free)",
    h1: "Rename and reorder columns in a CSV or Excel file",
    description:
      "Give CSV or Excel columns the exact names an import template expects and move them into the right order. Free, in your browser, your file is never uploaded.",
    intro:
      "Import templates want specific column names in a specific order, and exports rarely match. GridRinse renames the columns you choose, moves the ones you list to the front, and shows the result before you download.",
    stepName: "Rename columns",
    howTo: [
      "Choose your file above.",
      "Add the step \"Rename columns\" and type the new name next to each column. Add \"Reorder columns\" and list the columns that should come first.",
      "Check the new header row in the review, then download.",
    ],
    example: {
      input: { columns: ["Phone", "E-mail", "Full Name"], rows: [["555-0101", "ann@example.com", "Ann Lee"], ["555-0102", "sam@example.com", "Sam Park"]] },
      steps: [makeStep({ type: "renameColumns", map: { "E-mail": "Email", "Full Name": "Name" } }), makeStep({ type: "reorderColumns", order: ["Name", "Email"] })],
      note: "E-mail becomes Email, Full Name becomes Name, and both move in front of Phone.",
    },
    faq: [
      { q: "What if the new name already exists?", a: "The renamed column gets a _2 suffix so every column name stays unique, and you see a warning in the review." },
      { q: "What happens to columns I don't list when reordering?", a: "They follow the listed columns in their current order. Nothing is removed; use \"Drop columns\" for that." },
      { q: "Is my data changed?", a: "No. Only the header names and the column order change; the cells stay as they are." },
    ],
  },
];

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

/** The example's before/after tables, computed by the real engine. */
export function toolExample(t: ToolPage): { before: Table; after: Table } {
  const res = runPipeline(t.example.input, t.example.steps);
  return { before: t.example.input, after: res.table };
}
