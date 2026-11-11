import Link from "next/link";
import type { ReactNode } from "react";

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  body: ReactNode;
}

export const GUIDES: Guide[] = [
  {
    slug: "fix-excel-dates",
    title: "Fixing dates that Excel mangled",
    summary: "Why 03/04/2024 is two different days, how Excel turns dates into numbers like 45296, and how to get one clean format back.",
    body: (
      <>
        <p>
          Dates are the most common thing that goes wrong when a spreadsheet moves between people, apps and countries. Almost every broken date falls into one of four
          patterns, and each has a safe fix.
        </p>
        <h2>1. Day/month or month/day?</h2>
        <p>
          <code>03/04/2024</code> is 3 April in the UK and most of Europe and March 4 in the US. Nothing in the text says which. A tool that silently picks one will be wrong
          for half the world, and the error is invisible: every value still looks like a valid date.
        </p>
        <p>The only reliable evidence is inside the column itself:</p>
        <ul>
          <li>
            If any value has a first number above 12 (<code>25/04/2024</code>), the column is day-first.
          </li>
          <li>
            If any value has a second number above 12 (<code>04/25/2024</code>), it is month-first.
          </li>
          <li>If both happen in one column, two sources were pasted together and each part needs its own fix.</li>
          <li>If neither happens, the data cannot tell you. Ask whoever exported it, or check a row you know (an order you remember, a public holiday).</li>
        </ul>
        <p>
          DataPolish follows exactly these rules. When a column is undecidable it leaves it untouched and asks you to choose <strong>DMY</strong> or <strong>MDY</strong>
          for that column, instead of guessing.
        </p>
        <h2>2. Dates that turned into numbers</h2>
        <p>
          Excel stores a date as the number of days since 30 December 1899, so <code>45296</code> is 5 January 2024. If a date column loses its formatting (copying values,
          some CSV exports, a database import) you see the raw number. Excel also keeps a famous bug from Lotus 1-2-3: it believes 1900 was a leap year, so serials before
          1 March 1900 are off by one.
        </p>
        <p>
          To fix them, choose the column explicitly in <em>Standardise dates</em> and tick <em>Treat plain numbers as Excel date serials</em>. It is off by default because a
          column of quantities or IDs would otherwise turn into dates. A fractional part is the time of day: <code>45296.5</code> is noon.
        </p>
        <h2>3. The same date written five ways</h2>
        <p>
          Data typed by hand or merged from several systems mixes <code>2024-01-05</code>, <code>Jan 5, 2024</code>, <code>5 Jan 2024</code> and <code>1/5/2024</code>.
          Unambiguous forms (ISO and those with a month name) can be read safely in any column. Pick one output format for everything.
          <code>YYYY-MM-DD</code> is the best choice for data you will process further: it sorts correctly as text and every tool reads it.
        </p>
        <h2>4. Excel re-formats dates when it opens your CSV</h2>
        <p>
          Opening a CSV by double-clicking lets Excel re-interpret dates using your computer&rsquo;s regional settings, and saving writes them back in that new form. To avoid
          it, import the CSV with <em>Data → From Text/CSV</em> and set the column type to Text, or download the cleaned file as XLSX instead of CSV.
        </p>
        <h2>Checklist</h2>
        <ol>
          <li>Load the file and look at each date column in the Original tab.</li>
          <li>Let the date step detect columns; answer DMY or MDY for any flagged column.</li>
          <li>Check the warning count: values that could not be read are listed and left unchanged.</li>
          <li>Download as XLSX if the file will be opened in Excel.</li>
        </ol>
        <p>
          <Link href="/">Open the cleaner</Link>
        </p>
      </>
    ),
  },
  {
    slug: "dedupe-strategies",
    title: "Removing duplicates without losing the rows you need",
    summary: "Exact duplicates, duplicates by key, keeping the newest record, and the near-duplicates that whitespace and capital letters hide.",
    body: (
      <>
        <p>
          &ldquo;Remove duplicates&rdquo; sounds like one operation, but it is really a decision: <em>which</em> columns decide that two rows are the same, and{" "}
          <em>which</em> of them to keep. Getting either wrong silently deletes real data.
        </p>
        <h2>Exact duplicates</h2>
        <p>
          The safe default: a row is removed only if every cell matches an earlier row. This catches the classic export accident where the same block of rows was pasted
          twice. It will never remove two different orders from the same customer.
        </p>
        <h2>Duplicates by key</h2>
        <p>
          Often a row is the &ldquo;same&rdquo; record if one or two columns match, e.g. the email address in a contact list, or the order ID in an orders export. Choose
          those columns in <em>Compare by</em>. Be careful with keys that are not truly unique: deduplicating an orders file by customer email keeps only one order per
          customer.
        </p>
        <h2>Keep first or keep last?</h2>
        <ul>
          <li>
            <strong>Keep first</strong> when the file is in the order things happened and the first record is the original (sign-ups, first contact).
          </li>
          <li>
            <strong>Keep last</strong> when later rows are updates of earlier ones, e.g. a CRM export appended to over time, so the last row has the newest phone number.
          </li>
        </ul>
        <p>The kept row stays where it was in the file; rows are not re-sorted.</p>
        <h2>Near-duplicates</h2>
        <p>
          <code>NOAH.SMITH@example.com</code> and <code>noah.smith@example.com </code> (with a trailing space) are the same person but not equal text. Turn on{" "}
          <em>Ignore upper/lower case</em> and <em>Ignore extra spaces</em> for the comparison. The kept row keeps its original text; run <em>Trim whitespace</em> first if
          you also want the output tidied.
        </p>
        <p>
          Spelling variants (&ldquo;Jon&rdquo; vs &ldquo;John&rdquo;) are not duplicates by any rule a tool can apply safely. Treat those by hand.
        </p>
        <h2>Always look before you download</h2>
        <p>
          DataPolish lists every removed row in the <em>Removed rows</em> tab with its original row number and the step that removed it. Glance through it before
          downloading; if something there should stay, change the key columns or switch the step off.
        </p>
        <p>
          <Link href="/">Open the cleaner</Link>
        </p>
      </>
    ),
  },
  {
    slug: "currency-and-number-formats",
    title: "Turning “$1,234.50” and “(45.00)” into numbers",
    summary: "Currency symbols, thousands separators, accounting negatives, percentages and the decimal comma.",
    body: (
      <>
        <p>
          Numbers exported from accounting tools, shops and banks are formatted for people, not for formulas. A cell that shows <code>$1,234.50</code> is text to most
          tools, so sums ignore it and sorting puts <code>$9</code> after <code>$10</code>.
        </p>
        <h2>What the number step removes</h2>
        <ul>
          <li>
            Currency symbols and codes: <code>$ € £ ¥ ₹</code>, <code>USD</code>, <code>EUR</code> and others.
          </li>
          <li>
            Thousands separators: commas, apostrophes (<code>1&apos;234.50</code>) and spaces, including the non-breaking spaces French and German exports use.
          </li>
          <li>
            Accounting negatives: <code>(45.00)</code> and the trailing minus <code>45.00-</code> both become <code>-45.00</code>.
          </li>
        </ul>
        <p>
          Grouping is checked strictly: <code>1,5</code> is not read as 15 or as 1.5 unless you say the file uses a decimal comma. Values that cannot be read are left
          unchanged and counted in a warning, so nothing becomes a wrong number silently.
        </p>
        <h2>Decimal comma files</h2>
        <p>
          Much of Europe writes one thousand two hundred and thirty-four point five as <code>1.234,5</code>. Tick <em>Input uses a decimal comma</em> and the step reads it
          correctly. Output always uses a decimal point, which is what databases and most software expect.
        </p>
        <h2>Percentages</h2>
        <p>
          Choose whether <code>12.5%</code> stays as it is, becomes <code>12.5</code>, or becomes the fraction <code>0.125</code> (what spreadsheet formulas use).
        </p>
        <h2>Rounding</h2>
        <p>
          With <em>Decimals</em> set, values are rounded half away from zero on the digits themselves, not through floating point, so <code>1.005</code> becomes{" "}
          <code>1.01</code> and long IDs are never altered. Leave it at <em>Keep as written</em> to only strip formatting.
        </p>
        <h2>Leave IDs alone</h2>
        <p>
          ZIP codes, phone numbers and account numbers look numeric but are identifiers: <code>02134</code> must keep its leading zero. The cleaner only suggests columns
          that carry formatting such as currency symbols and never suggests columns with leading zeros. When you download XLSX, values with leading zeros stay text.
        </p>
        <p>
          <Link href="/">Open the cleaner</Link>
        </p>
      </>
    ),
  },
  {
    slug: "merge-csv-files",
    title: "Merging monthly exports into one table",
    summary: "Stacking files whose columns do not quite match, and keeping track of which row came from where.",
    body: (
      <>
        <p>
          Twelve monthly exports rarely have identical columns. Someone renamed <code>Email</code> to <code>E-mail</code> in March, a new <code>Region</code> column
          appeared in June. Copy-pasting them under each other shifts data into the wrong columns without any error.
        </p>
        <h2>Line columns up by name, not by position</h2>
        <p>
          DataPolish merges by header name. The result has every column that appears in any file; rows from a file without that column get an empty cell, and a warning
          says which files were missing which columns.
        </p>
        <h2>Small differences in headers</h2>
        <p>
          With <em>Match headers that differ only in case or punctuation</em> on, <code>E-mail</code>, <code>email</code> and <code>EMAIL </code> become one column. Real
          renames (<code>Full Name</code> vs <code>Name</code>) need you: open <em>Column matching</em> and point each source column at the right target, or choose{" "}
          <em>leave out</em>.
        </p>
        <h2>Keep the source</h2>
        <p>
          Tick <em>Add a column with the source file name</em> so every row remembers which file it came from. It is invaluable when one month turns out to be wrong.
        </p>
        <h2>Clean after merging</h2>
        <p>
          The cleaning steps run on the merged table, so duplicates <em>across</em> files (the same order in the January and February exports) are found too. To clean
          files separately with the same steps instead, choose <em>Batch</em>.
        </p>
        <p>
          <Link href="/">Open the cleaner</Link>
        </p>
      </>
    ),
  },
  {
    slug: "csv-encoding-excel",
    title: "Why Excel shows “Ã©” instead of “é” in your CSV",
    summary: "What UTF-8, Windows-1252 and the byte order mark are, why Excel guesses wrong, and how to export a CSV that opens correctly everywhere.",
    body: (
      <>
        <p>
          A CSV file is just text, and text on disk is bytes. The file does not say which <em>encoding</em> turns those bytes back into letters, so every program has to
          guess. When it guesses wrong, accented letters and symbols turn into pairs of strange characters.
        </p>
        <h2>The two encodings you will meet</h2>
        <ul>
          <li>
            <strong>UTF-8</strong> can store every character in every language. <code>é</code> is two bytes. Most web apps, databases and exports use it today.
          </li>
          <li>
            <strong>Windows-1252</strong> (often called &ldquo;ANSI&rdquo;) stores one byte per character and only knows Western European letters. Older Excel versions and
            many accounting tools still save CSVs this way.
          </li>
        </ul>
        <p>
          <code>Ã©</code> is what the two UTF-8 bytes of <code>é</code> look like when a program reads them as Windows-1252. The data is not damaged; it is being read with
          the wrong key.
        </p>
        <h2>Why Excel gets it wrong</h2>
        <p>
          When you double-click a CSV, Excel on Windows assumes your system&rsquo;s legacy encoding unless the file starts with a <em>byte order mark</em> (BOM), three
          invisible bytes that say &ldquo;this is UTF-8&rdquo;. Many exporters leave the BOM out, so Excel guesses Windows-1252 and the accents break.
        </p>
        <h2>The fix</h2>
        <ol>
          <li>Open the file in DataPolish. It tries strict UTF-8 first and falls back to Windows-1252 when the bytes are not valid UTF-8, and tells you which one it used.</li>
          <li>Clean it as usual.</li>
          <li>
            Download as CSV with <em>Excel-friendly (UTF-8 BOM)</em> ticked (the default). Excel then opens accents correctly, and other tools ignore the BOM. If a system
            you upload to rejects the BOM, untick it, or download XLSX, which has no encoding question at all.
          </li>
        </ol>
        <h2>Separators are a related trap</h2>
        <p>
          In countries that write decimals with a comma, Excel expects semicolons between columns. If everything lands in column A, export with the <em>semicolon</em>{" "}
          separator, or use XLSX.
        </p>
        <p>
          <Link href="/">Open the cleaner</Link>
        </p>
      </>
    ),
  },
  {
    slug: "batch-clean-exports",
    title: "Cleaning a folder of exports the same way, every month",
    summary: "Apply one set of cleaning steps to many files at once, download them as a ZIP, and save the steps as a workflow for next time.",
    body: (
      <>
        <p>
          Monthly exports from the same system usually have the same problems: stray spaces, a blank line at the end, dates in a local format. Fixing each file by hand is
          slow and easy to get slightly different every time. Batch cleaning applies exactly the same steps to every file.
        </p>
        <h2>1. Load the files together</h2>
        <p>
          Drop several CSV or Excel files on the cleaner (the free plan takes 3 at once; paid plans take more). Choose <em>Batch: clean each file separately</em>. Merge
          is the other option, for stacking files into one table.
        </p>
        <h2>2. Build the steps on one file</h2>
        <p>
          Pick any file to preview. Every change is highlighted, removed rows are listed with the reason, and the batch table above the preview shows rows in and out for every
          file, so you can spot a file that behaves differently before downloading.
        </p>
        <h2>3. Download a ZIP</h2>
        <p>
          <em>All files → ZIP of CSVs</em> (or of XLSX) builds one archive in your browser with a cleaned file per input, named after the original with{" "}
          <code>-clean</code> added. Nothing is uploaded to build it. If you prefer one workbook, <em>All files → one XLSX</em> puts each file on its own sheet.
        </p>
        <h2>4. Save the steps as a workflow</h2>
        <p>
          Give the steps a name and save them. Next month, load the new exports and apply the workflow in one click. Workflows are lists of steps, not data. You can export
          one as a JSON file to share it with a colleague, or (on Pro and Business) save it to your account so it follows you between computers and, on Business, your
          team.
        </p>
        <h2>What a workflow contains</h2>
        <p>
          The settings you typed into steps are stored as typed: column names, find &amp; replace text, separators. Keep find &amp; replace values short and generic
          (<code>N/A</code>, <code>-</code>); they are limited to 1 KB so a workflow never becomes a place where data is stored.
        </p>
        <p>
          <Link href="/">Open the cleaner</Link>
        </p>
      </>
    ),
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
