import Link from "next/link";
import type { ReactNode } from "react";

export type GuideCategory = "cleaning" | "dates-numbers" | "privacy";

export const GUIDE_CATEGORIES: { id: GuideCategory; label: string }[] = [
  { id: "cleaning", label: "Cleaning guides" },
  { id: "dates-numbers", label: "Dates & numbers" },
  { id: "privacy", label: "Privacy & help" },
];

export interface Guide {
  slug: string;
  category: GuideCategory;
  title: string;
  summary: string;
  body: ReactNode;
}

export const GUIDES: Guide[] = [
  {
    slug: "fix-excel-dates",
    category: "dates-numbers",
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
          GridRinse follows exactly these rules. When a column is undecidable it leaves it untouched and asks you to choose <strong>DMY</strong> or <strong>MDY</strong>
          for that column, instead of guessing.
        </p>
        <h2>2. Dates that turned into numbers</h2>
        <p>
          Excel stores a date as the number of days since 30 December 1899, so <code>45296</code> is 5 January 2024. If a date column loses its formatting (copying values,
          some CSV exports, a database import) you see the raw number. Excel also keeps a famous bug from Lotus 1-2-3: it believes 1900 was a leap year, so serials before
          1 March 1900 are off by one.
        </p>
        <p>
          To fix them, choose the column explicitly in <em>Standardize dates</em> and tick <em>Treat plain numbers as Excel date serials</em>. It is off by default because a
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
    category: "cleaning",
    title: "Removing duplicates without losing the rows you need",
    summary: "Exact duplicates, duplicates by key, keeping the newest record, and the near-duplicates that whitespace and capital letters hide.",
    body: (
      <>
        <p>
          <strong>Try it on your file:</strong> <Link href="/tools/remove-duplicates-csv">remove duplicate rows from a CSV</Link> or{" "}
          <Link href="/tools/remove-duplicates-by-column-csv">remove duplicates by a key column</Link>. Both run in your browser and list every removed row.
        </p>
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
          GridRinse lists every removed row in the <em>Removed rows</em> tab with its original row number and the step that removed it. Glance through it before
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
    category: "dates-numbers",
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
    category: "cleaning",
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
          GridRinse merges by header name. The result has every column that appears in any file; rows from a file without that column get an empty cell, and a warning
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
    category: "cleaning",
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
          <li>Open the file in GridRinse. It tries strict UTF-8 first and falls back to Windows-1252 when the bytes are not valid UTF-8, and tells you which one it used.</li>
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
    category: "cleaning",
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
  {
    slug: "csv-cleanup-checklist",
    category: "cleaning",
    title: "A practical CSV cleanup checklist",
    summary: "Eight checks to run on any export before you import, share or analyse it: spaces, blanks, duplicates, dates, numbers, headers, encoding and a final review.",
    body: (
      <>
        <p>
          Most broken imports and wrong totals come from the same short list of problems. Run through these checks in order on any CSV or Excel export before it goes
          anywhere else. Each one takes seconds once you know what to look for.
        </p>
        <h2>1. Extra spaces</h2>
        <p>
          A trailing space makes <code>Maria Lopez </code> a different value from <code>Maria Lopez</code>, so lookups miss and duplicates hide. Trim leading and trailing
          spaces and collapse double spaces inside text.
        </p>
        <h2>2. Blank rows</h2>
        <p>Exports often end with an empty line, or have blank rows between sections. Remove rows where every cell is empty; they count as records in many tools.</p>
        <h2>3. Duplicate rows</h2>
        <p>
          Decide what &ldquo;the same&rdquo; means: every cell identical, or one key column such as an email or order ID. Then decide which copy to keep. Our{" "}
          <Link href="/guides/dedupe-strategies">duplicates guide</Link> covers the choices.
        </p>
        <h2>4. Dates</h2>
        <p>
          Look for mixed formats in one column (<code>Jan 17, 2024</code> next to <code>1/15/2024</code>) and for columns that could be day-first or month-first. Convert to
          one format, usually <code>YYYY-MM-DD</code>, and settle ambiguous columns by hand. See <Link href="/guides/fix-excel-dates">fixing dates</Link>.
        </p>
        <h2>5. Numbers stored as text</h2>
        <p>
          Currency symbols, thousands separators and accounting negatives like <code>(45.00)</code> stop formulas from adding things up. Turn them into plain numbers such
          as <code>-45.00</code>. See <Link href="/guides/currency-and-number-formats">number formats</Link>.
        </p>
        <h2>6. Headers</h2>
        <p>Check that there is exactly one header row, that no two columns share a name, and that the names match what the importing system expects.</p>
        <h2>7. Encoding</h2>
        <p>
          If accented letters show up as <code>Ã©</code>, the file was read with the wrong character encoding. Save it as UTF-8. See{" "}
          <Link href="/guides/csv-encoding-excel">the encoding guide</Link>.
        </p>
        <h2>8. Review before you export</h2>
        <p>
          Compare row counts before and after, and look at what changed. Every removed row should have a reason you agree with. GridRinse highlights each changed cell and lists
          removed rows, so this step is a quick read rather than a hunt.
        </p>
        <p>
          <Link href="/how-it-works">Run the checklist on your own file</Link>: the default steps cover checks 1 to 5, in your browser.
        </p>
      </>
    ),
  },
  {
    slug: "clean-shopify-orders-export",
    category: "cleaning",
    title: "How to clean a Shopify orders export (CSV)",
    summary: "Shopify's orders CSV has one row per line item, stray spaces and text-formatted amounts. Here is how to tidy it for a spreadsheet, accountant or import without losing rows.",
    body: (
      <>
        <p>
          A Shopify orders export opens fine, but it is not ready for totals or an import. The most common surprise: an order with three products appears on three rows, so
          a careless &ldquo;remove duplicates&rdquo; can delete real data. This guide walks through a safe order of steps. It all runs in your browser, so customer names and
          emails are never uploaded.
        </p>
        <h2>1. Know what one row means</h2>
        <p>
          In an orders export, each row is a line item, and the order-level columns (such as the order name and email) repeat on every line of the same order. Before you
          dedupe, decide whether you want to count orders or line items.
        </p>
        <h2>2. Trim stray spaces first</h2>
        <p>
          Customer-typed fields like names, addresses and notes often carry leading or trailing spaces, or non-breaking spaces copied from other apps. Use the{" "}
          <Link href="/tools/trim-spaces-csv">trim spaces tool</Link> so that matching and lookups work.
        </p>
        <h2>3. Remove duplicates carefully</h2>
        <ul>
          <li>Comparing whole rows only removes rows that are identical in every column, so separate line items of one order are kept.</li>
          <li>Comparing by a single key such as the order name would keep only one line per order. Use that only when you want one row per order.</li>
        </ul>
        <p>
          The <Link href="/tools/remove-duplicates-csv">duplicate remover</Link> lets you choose between whole rows and key columns, and lists every row it removes so you
          can check. More options are in the <Link href="/guides/dedupe-strategies">duplicates guide</Link>.
        </p>
        <h2>4. Turn amounts into real numbers</h2>
        <p>
          If amounts arrive with currency symbols or thousands separators, spreadsheets treat them as text and will not sum them. The{" "}
          <Link href="/tools/clean-numbers-csv">number cleaner</Link> strips those and turns <code>(45.00)</code> into <code>-45.00</code>. See also{" "}
          <Link href="/guides/currency-and-number-formats">currency and number formats</Link>.
        </p>
        <h2>5. Standardize the dates</h2>
        <p>
          Put every date in one format with the <Link href="/tools/fix-dates-csv">date fixer</Link>. If a column could be day-first or month-first, GridRinse flags it for
          you to decide rather than guessing. Check the result on a few rows you know.
        </p>
        <h2>6. Drop columns you do not need</h2>
        <p>
          Exports contain dozens of columns. Remove the ones your accountant or import does not need with the{" "}
          <Link href="/tools/remove-columns-csv">column remover</Link>, which also reduces how much personal data you pass around.
        </p>
        <h2>7. Save the steps for next month</h2>
        <p>
          The same steps work on every new export. You can save them in your browser for free; Pro adds saving them to your account and cleaning up to 20 files at once.{" "}
          <Link href="/">Open the cleaner</Link> to try it on your own file.
        </p>
      </>
    ),
  },
  {
    slug: "clean-contacts-export-for-import",
    category: "cleaning",
    title: "How to clean a contacts export before importing it (CRM or mailing list)",
    summary: "Contact exports from a CRM, form tool or old mailing list repeat people, use odd column names and carry stray spaces. Here is a safe order of steps to get one tidy file ready for import.",
    body: (
      <>
        <p>
          <strong>Try it on your file:</strong> <Link href="/tools/remove-duplicate-emails-csv">remove duplicate emails from a CSV</Link> or{" "}
          <Link href="/tools/rename-columns-csv">rename columns to match your import template</Link>. Both run in your browser, so the list is never uploaded.
        </p>
        <p>
          Before you import contacts into a CRM or email tool, the file usually needs a tidy-up: the same person appears twice, column names do not match the import
          template, and names carry stray spaces. This guide gives an order that avoids losing good rows. Everything runs in your browser, so the list is never uploaded.
        </p>
        <h2>1. Trim stray spaces first</h2>
        <p>
          A trailing space makes <code>ann@example.com </code> a different value from <code>ann@example.com</code>, so duplicates slip through. Run the{" "}
          <Link href="/tools/trim-spaces-csv">trim spaces tool</Link> before anything else.
        </p>
        <h2>2. Remove repeated email addresses</h2>
        <p>
          Pick the email column as the key and turn on ignore case, so <code>Ann@Example.com</code> and <code>ann@example.com</code> count as one person. Choose whether the first
          or the last row wins; the last is handy when newer rows are more up to date. The{" "}
          <Link href="/tools/remove-duplicate-emails-csv">duplicate email remover</Link> shows which rows go before you download. It does not check whether an address is valid.
        </p>
        <h2>3. Match the import template</h2>
        <p>
          Import templates expect exact column names in a set order. Rename the columns and move the required ones to the front with the{" "}
          <Link href="/tools/rename-columns-csv">rename and reorder columns tool</Link>. Only headers and column order change; the cells stay as they are.
        </p>
        <h2>4. Drop columns you do not need</h2>
        <p>
          Removing unneeded columns with the <Link href="/tools/remove-columns-csv">column remover</Link> also means less personal data travels with the file.
        </p>
        <h2>5. Check before you import</h2>
        <p>
          Open the cleaned file and look at a few rows you know. For wider options on duplicates, see the <Link href="/guides/dedupe-strategies">duplicates guide</Link>.
        </p>
        <h2>Repeat it next time</h2>
        <p>
          The same steps work on every new export. You can save them in your browser for free; Pro adds saving them to your account and cleaning up to 20 files at once.{" "}
          <Link href="/">Open the cleaner</Link> and try it on your own file.
        </p>
      </>
    ),
  },
  {
    slug: "browser-privacy",
    category: "privacy",
    title: "How browser-based privacy works",
    summary: "What it means that GridRinse cleans files in your browser, what is and is not sent to our server, and how to check it yourself.",
    body: (
      <>
        <p>
          Most online file tools upload your file to their server, process it there, and send a result back. GridRinse works differently: the cleaning code is downloaded to
          your browser once, and your file is read and cleaned on your own computer.
        </p>
        <h2>What happens when you choose a file</h2>
        <ul>
          <li>Your browser reads the file from your disk into memory. It is not sent anywhere.</li>
          <li>The cleaning steps run in a background thread of the page (a Web Worker), on your device.</li>
          <li>The cleaned file is built in your browser and saved straight to your downloads.</li>
        </ul>
        <h2>What is sent to our server</h2>
        <p>
          Anonymous usage counts, for example that a file was cleaned, how many files and steps were used, and which download format was chosen. These never contain file
          names, column names or cell values. If you have an account, we also store your email, your plan and any workflows you save to it. A workflow is the list of
          steps, not your data.
        </p>
        <h2>What the browser itself enforces</h2>
        <p>
          The site sends a Content-Security-Policy that only allows the page to talk to gridrinse.com. Even a bug in our code could not quietly send your data to another
          server: the browser would block the request.
        </p>
        <h2>How to check it yourself</h2>
        <ol>
          <li>Open your browser&apos;s developer tools (F12) and go to the Network tab.</li>
          <li>Load a file in the cleaner, change some steps, and download the result.</li>
          <li>Look at the requests: you will see the page&apos;s own scripts and small usage events, and no request that carries your file.</li>
        </ol>
        <h2>What this means for you</h2>
        <p>
          You can clean customer lists, bank exports and other sensitive files without handing them to a third party. Closing the tab clears the file from memory; nothing is
          kept. See the <Link href="/privacy">privacy policy</Link> for the full details.
        </p>
      </>
    ),
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
