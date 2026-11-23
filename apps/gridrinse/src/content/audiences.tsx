import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Landing pages for people who clean the same export repeatedly. Every step named here exists in the
 * cleaner (src/lib/engine/schema.ts); example tables are illustrative data, labelled as such.
 */
export interface Audience {
  slug: string;
  /** Short label for lists and the breadcrumb. */
  label: string;
  title: string;
  summary: string;
  example: { caption: string; before: string[][]; after: string[][] };
  body: ReactNode;
  faq: { q: string; a: string }[];
}

const workflowPitch = (
  <>
    <h2>Do it once, then one click every month</h2>
    <p>
      Build the steps on this month&rsquo;s file, check the preview, and save them as a workflow. Next time, load the new export and apply the workflow: the same
      steps, in the same order, every time. The free plan keeps workflows in your browser and lets you export them as JSON; <Link href="/pricing">Pro ($9/month)</Link>{" "}
      saves up to 50 workflows to your account so they follow you between computers, and raises the limits to 50 MB files, 500,000 rows and 20 files per batch.
    </p>
  </>
);

export const AUDIENCES: Audience[] = [
  {
    slug: "bookkeeping-exports",
    label: "Bookkeeping and bank exports",
    title: "Clean bank and accounting exports before they go into your books",
    summary:
      "Bank statements and accounting exports arrive with local date formats, currency symbols, bracketed negatives and blank lines. Fix them in your browser — client data never leaves your computer.",
    example: {
      caption: "Example: a bank CSV before and after the default steps plus Standardize dates (DMY) and Clean numbers.",
      before: [
        ["Date", "Description", "Amount"],
        ["03/04/2026", "  CARD PAYMENT  OFFICE SUPPLIES ", "(45.20)"],
        ["", "", ""],
        ["04/04/2026", "TRANSFER FROM CLIENT", "£1,250.00"],
      ],
      after: [
        ["Date", "Description", "Amount"],
        ["2026-04-03", "CARD PAYMENT OFFICE SUPPLIES", "-45.20"],
        ["2026-04-04", "TRANSFER FROM CLIENT", "1250.00"],
      ],
    },
    body: (
      <>
        <p>
          Every bank and accounting system exports slightly differently, and the differences break imports: a date that your software reads as 4 March instead of 3 April,
          an amount with a currency sign that imports as text, a refund written as <code>(45.20)</code> instead of <code>-45.20</code>, a blank line that becomes an empty
          transaction. When you handle exports for several clients every month, these fixes add up to hours.
        </p>
        <h2>What GridRinse fixes</h2>
        <ul>
          <li>
            <strong>Dates:</strong> one output format for the whole file. Where a column could be day-first or month-first and the data cannot tell, GridRinse asks you
            instead of guessing (see <Link href="/guides/fix-excel-dates">why dates go wrong</Link>).
          </li>
          <li>
            <strong>Amounts:</strong> strips currency symbols and thousands separators, turns <code>(45.20)</code> into <code>-45.20</code>, and can fix the number of
            decimals (<Link href="/guides/currency-and-number-formats">number formats</Link>).
          </li>
          <li>
            <strong>Descriptions:</strong> trims stray and repeated spaces and invisible characters so matching rules in your software work.
          </li>
          <li>
            <strong>Blank and duplicate rows:</strong> removed, and every removed row is listed with the reason before you download.
          </li>
          <li>
            <strong>Columns:</strong> rename, reorder or drop columns to match the import template your software expects.
          </li>
        </ul>
        <h2>Client data stays on your computer</h2>
        <p>
          The file is read and cleaned by this web page in your browser. It is never uploaded to us or anyone else; the site&rsquo;s Content-Security-Policy blocks the page
          from sending data to other servers. That matters when the file is a client&rsquo;s bank statement.
        </p>
        {workflowPitch}
      </>
    ),
    faq: [
      {
        q: "Can it process several clients' statements at once?",
        a: "Yes. Load several files and choose batch mode: the same steps are applied to each file and you download a ZIP with one cleaned file per input (3 files at a time on the free plan, 20 on Pro, 100 on Business).",
      },
      {
        q: "Will it change the original file?",
        a: "No. The original is never modified, and 'Download original' returns the exact bytes you loaded.",
      },
      {
        q: "Which formats does it read and write?",
        a: "CSV (any common separator and encoding) and Excel XLSX, in and out.",
      },
    ],
  },
  {
    slug: "ecommerce-exports",
    label: "Shopify and e-commerce exports",
    title: "Clean Shopify and e-commerce exports for reports and re-imports",
    summary:
      "Order and product exports repeat rows per line item or variant, mix date formats and carry currency text. Turn them into clean tables in your browser, the same way every week.",
    example: {
      caption:
        "Example: an order export with one row per line item, de-duplicated to one row per order by the Name column; dates with “Keep time” switched off.",
      before: [
        ["Name", "Email", "Created at", "Total"],
        ["#1001", "ana@example.com ", "2026-03-02 10:14:00 +0100", "$84.00"],
        ["#1001", "", "2026-03-02 10:14:00 +0100", ""],
        ["#1002", "ben@example.com", "2026-03-02 11:40:00 +0100", "$19.50"],
      ],
      after: [
        ["Name", "Email", "Created at", "Total"],
        ["#1001", "ana@example.com", "2026-03-02", "84.00"],
        ["#1002", "ben@example.com", "2026-03-02", "19.50"],
      ],
    },
    body: (
      <>
        <p>
          Store exports are built for re-importing into the same store, not for reporting or for other tools. Shopify&rsquo;s order export, for example, writes one row per
          line item, with order-level fields such as email and total only on the first row of each order; product exports repeat the handle on every variant row. Spreadsheets,
          accounting software and email tools expect one clean row per order or customer.
        </p>
        <h2>What GridRinse fixes</h2>
        <ul>
          <li>
            <strong>One row per order or customer:</strong> remove duplicates by key columns you choose (order number, email), keeping the first or last occurrence;
            optionally ignoring capital letters and spaces. <Link href="/guides/dedupe-strategies">Choosing keys</Link>.
          </li>
          <li>
            <strong>Dates and times:</strong> timestamps like <code>2026-03-02 10:14:00 +0100</code> become one date format, with or without the time of day.
          </li>
          <li>
            <strong>Money:</strong> currency symbols and separators removed so totals sum correctly.
          </li>
          <li>
            <strong>Columns:</strong> drop the dozens of columns you do not need, rename the rest, merge or split columns (for example a full name into first and last
            name).
          </li>
          <li>
            <strong>Several exports at once:</strong> stack monthly files into one table, or clean each separately into a ZIP (
            <Link href="/guides/merge-csv-files">merging files</Link>).
          </li>
        </ul>
        {workflowPitch}
      </>
    ),
    faq: [
      {
        q: "Does it connect to my store?",
        a: "No. You export the CSV from your store admin as usual and open it in GridRinse. Nothing is connected and nothing is uploaded.",
      },
      {
        q: "How large can the export be?",
        a: "5 MB and 50,000 rows per file on the free plan, 50 MB and 500,000 rows on Pro, 200 MB and 2,000,000 rows on Business. Processing speed depends on your computer. Free downloads are one a day of up to 1,000 rows; a $5 24-hour pass or a paid plan has unlimited downloads.",
      },
      {
        q: "Can I keep the line items instead?",
        a: "Yes. Leave out the duplicate step (or use other key columns) and only clean dates, money and spacing.",
      },
    ],
  },
  {
    slug: "crm-imports",
    label: "CRM and mailing-list imports",
    title: "Prepare contact lists for CRM and email-tool imports",
    summary:
      "Contact lists from events, forms and old systems have duplicate emails in different capitals, stray spaces, full names in one column and inconsistent dates. Clean them before the import creates duplicates.",
    example: {
      caption: "Example: duplicates by Email (ignoring case and spaces), Full name split into First and Last name.",
      before: [
        ["Full name", "Email", "Signed up"],
        ["Maria de la Cruz", "Maria@Example.com", "Jan 5, 2026"],
        [" maria de la cruz ", "maria@example.com ", "01/05/2026"],
        ["Tom Price", "tom@example.org", "2026-01-07"],
      ],
      after: [
        ["First name", "Last name", "Email", "Signed up"],
        ["Maria", "de la Cruz", "Maria@Example.com", "2026-01-05"],
        ["Tom", "Price", "tom@example.org", "2026-01-07"],
      ],
    },
    body: (
      <>
        <p>
          Importing a messy list into a CRM or email tool is hard to undo: duplicates become separate contacts, a name in the wrong column becomes the greeting in your next
          campaign, and a date the importer cannot read is silently dropped. Cleaning the file first is faster than cleaning the CRM afterwards.
        </p>
        <h2>What GridRinse fixes</h2>
        <ul>
          <li>
            <strong>Duplicate contacts:</strong> remove duplicates by the Email column, ignoring capital letters and surrounding spaces, keeping the first or the newest row.
          </li>
          <li>
            <strong>Names:</strong> split a full-name column on the first space into first and last name (extra words stay in the last name), or merge columns the other way.
          </li>
          <li>
            <strong>Spacing:</strong> trims leading, trailing and repeated spaces and invisible characters copied from web forms.
          </li>
          <li>
            <strong>Dates:</strong> one format the importer accepts, with day/month ambiguity flagged for you to decide.
          </li>
          <li>
            <strong>Headers:</strong> rename and reorder columns to match the import template, drop the ones you do not import.
          </li>
        </ul>
        <h2>Personal data stays on your computer</h2>
        <p>
          Contact lists are personal data. GridRinse processes them in your browser and never uploads them, so cleaning a list does not add another company that holds your
          contacts.
        </p>
        {workflowPitch}
      </>
    ),
    faq: [
      {
        q: "Does it validate that email addresses exist?",
        a: "No. It removes duplicates and fixes formatting; it does not contact mail servers. That keeps your list on your computer.",
      },
      {
        q: "Which duplicate is kept?",
        a: "You choose: the first or the last occurrence of each key. Every removed row is listed in the Removed rows tab before you download.",
      },
      {
        q: "Can my team use the same steps?",
        a: "Yes. Export a workflow as JSON and share it, or on Business save shared workflows for up to 5 team members.",
      },
    ],
  },
];

export function getAudience(slug: string): Audience | undefined {
  return AUDIENCES.find((a) => a.slug === slug);
}
