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
];

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

/** The example's before/after tables, computed by the real engine. */
export function toolExample(t: ToolPage): { before: Table; after: Table } {
  const res = runPipeline(t.example.input, t.example.steps);
  return { before: t.example.input, after: res.table };
}
