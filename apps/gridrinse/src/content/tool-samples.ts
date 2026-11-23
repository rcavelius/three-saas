import { SAMPLE_CSV } from "@/lib/sample";
import type { Step } from "@/lib/engine/schema";
import { TOOLS, type ToolPage } from "./tools";

/**
 * A messy sample file (or two, for merging) for every /tools page, so visitors can try a tool without their own
 * data: downloadable at /samples/<file> and loadable straight into the cleaner on the page.
 *
 * Each bespoke sample uses the same columns as the page's example, so the page's own steps (e.g. "split Name at
 * ', '") apply to it. Tools without a bespoke sample get the general messy orders export, so a newly added tool
 * page always has a sample. All names and emails are invented (example.com/.org/.net).
 */
export interface SampleFile {
  /** File name as downloaded and as shown in the cleaner: "<slug>-sample.csv" or similar. */
  name: string;
  csv: string;
}

export interface ToolSample {
  files: SampleFile[];
  /** The tool page's own steps, applied on top of the defaults when the sample is loaded on that page. */
  steps: Step[];
  /** Also offer an Excel (.xlsx) copy of the first file (for the Excel → CSV page). */
  xlsx: boolean;
}

function csv(columns: string[], rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [columns, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const NBSP = " ";
const ZWSP = "​";

const BESPOKE: Record<string, { name: string; csv: string }[]> = {
  "remove-duplicates-csv": [
    {
      name: "remove-duplicates-csv-sample.csv",
      csv: csv(
        ["Email", "Name", "Plan", "Signed up"],
        [
          ["ann@example.com", "Ann Lee", "Pro", "2024-03-02"],
          ["sam@example.com", "Sam Park", "Free", "2024-03-04"],
          ["ann@example.com", "Ann Lee", "Pro", "2024-03-02"],
          ["li.wei@example.org", "Li Wei", "Business", "2024-03-05"],
          ["sam@example.com", "Sam Park ", "Free", "2024-03-04"],
          ["omar@example.net", "Omar Haddad", "Pro", "2024-03-07"],
          ["li.wei@example.org", "Li Wei", "Business", "2024-03-05"],
          ["nina@example.com", "Nina Rossi", "Free", "2024-03-09"],
          ["ann@example.com", "Ann  Lee", "Pro", "2024-03-02"],
          ["jo@example.com", "Jo Martin", "Free", "2024-03-11"],
        ],
      ),
    },
  ],
  "remove-blank-rows-csv": [
    {
      name: "remove-blank-rows-csv-sample.csv",
      csv: csv(
        ["Customer", "Amount", "Invoice"],
        [
          ["Maria Lopez", "1234.50", "INV-1001"],
          ["", "", ""],
          ["Ethan Clark", "-45.00", "INV-1002"],
          ["  ", " ", ""],
          ["Aiko Tanaka", "310.20", "INV-1003"],
          ["", "", ""],
          ["", "", ""],
          ["Noah Smith", "58.00", ""],
          [NBSP, "", ""],
          ["Grace Kim", "880.00", "INV-1005"],
        ],
      ),
    },
  ],
  "trim-spaces-csv": [
    {
      name: "trim-spaces-csv-sample.csv",
      csv: csv(
        ["Name", "City", "Email"],
        [
          ["  Maria  Lopez ", "New York", "maria.lopez@example.com "],
          [`Ethan Clark${ZWSP}`, " Austin", "ethan.clark@example.com"],
          [`Aiko${NBSP}Tanaka`, "Osaka  ", " aiko.t@example.net"],
          ["Liam   O'Brien", "  Dublin", "liam.obrien@example.com"],
          ["Chloé Martin ", `Paris${NBSP}`, "chloe.martin@example.org"],
          ["Noah Smith", "Chicago", "noah.smith@example.com  "],
          [" Sofia Rossi", "Milan", "sofia.rossi@example.org"],
        ],
      ),
    },
  ],
  "fix-dates-csv": [
    {
      name: "fix-dates-csv-sample.csv",
      csv: csv(
        ["Order", "Date", "Shipped"],
        [
          ["1001", "Jan 17, 2024", "18/01/2024"],
          ["1002", "2024-02-03", "05/02/2024"],
          ["1003", "March 9, 2024", "11/03/2024"],
          ["1004", "4/2/2024", "04/04/2024"],
          ["1005", "2024-04-15", "16/04/2024"],
          ["1006", "May 1, 2024", "02/05/2024"],
          ["1007", "5/20/2024", "21/05/2024"],
          ["1008", "June 3, 2024", "25/06/2024"],
        ],
      ),
    },
  ],
  "clean-numbers-csv": [
    {
      name: "clean-numbers-csv-sample.csv",
      csv: csv(
        ["Description", "Amount"],
        [
          ["Invoice 1042", "$1,234.50"],
          ["Refund", "(45.00)"],
          ["Fee", "$7"],
          ["Invoice 1043", "$12,500.00"],
          ["Invoice 1044", " $310.2 "],
          ["Chargeback", "(1,050.00)"],
          ["Invoice 1045", "$89.99"],
          ["Adjustment", "-12.5"],
        ],
      ),
    },
  ],
  "merge-csv-files": [
    {
      name: "merge-csv-files-sample-january.csv",
      csv: csv(
        ["Month", "Customer", "Amount"],
        [
          ["Jan", "Maria Lopez", "1234.50"],
          ["Jan", "Ethan Clark", "45.00"],
          ["Jan", "Aiko Tanaka", "2005.00"],
          ["Jan", "Noah Smith", "58.00"],
        ],
      ),
    },
    {
      name: "merge-csv-files-sample-february.csv",
      csv: csv(
        ["customer", "AMOUNT", "month"],
        [
          ["Sofia Rossi", "1050.00", "Feb"],
          ["Grace Kim ", "880.00", "Feb"],
          ["", "", ""],
          ["Lucas Silva", "199.95", "Feb"],
        ],
      ),
    },
  ],
  "split-column-csv": [
    {
      name: "split-column-csv-sample.csv",
      csv: csv(
        ["Name", "Email"],
        [
          ["Lee, Ann", "ann@example.com"],
          ["Park, Sam", "sam@example.com"],
          ["Lopez, Maria", "maria.lopez@example.com"],
          ["Tanaka, Aiko ", "aiko.t@example.net"],
          ["O'Brien, Liam", "liam.obrien@example.com"],
          ["Rossi,  Sofia", "sofia.rossi@example.org"],
        ],
      ),
    },
  ],
  "combine-columns-csv": [
    {
      name: "combine-columns-csv-sample.csv",
      csv: csv(
        ["First", "Last", "Email"],
        [
          ["Ann", "Lee", "ann@example.com"],
          ["Sam", "", "sam@example.com"],
          [" Maria", "Lopez ", "maria.lopez@example.com"],
          ["Aiko", "Tanaka", "aiko.t@example.net"],
          ["Liam", "O'Brien", "liam.obrien@example.com"],
          ["Sofia", "Rossi", "sofia.rossi@example.org"],
        ],
      ),
    },
  ],
  "find-replace-csv": [
    {
      name: "find-replace-csv-sample.csv",
      csv: csv(
        ["Product", "Status"],
        [
          ["Widget", "N/A"],
          ["Gadget", "shipped"],
          ["Gizmo", "n/a"],
          ["Sprocket", "N/A "],
          ["Doohickey", "pending"],
          ["Thingamajig", "N/a"],
          ["Whatsit", "shipped"],
        ],
      ),
    },
  ],
  "remove-columns-csv": [
    {
      name: "remove-columns-csv-sample.csv",
      csv: csv(
        ["id", "Name", "Email", "internal_note"],
        [
          ["17", "Ann Lee", "ann@example.com", "VIP"],
          ["18", "Sam Park", "sam@example.com", ""],
          ["19", "Maria Lopez ", "maria.lopez@example.com", "called twice"],
          ["20", "Aiko Tanaka", "aiko.t@example.net", ""],
          ["21", "Liam O'Brien", "liam.obrien@example.com", "late payer"],
        ],
      ),
    },
  ],
  "clean-csv-headers": [
    {
      name: "clean-csv-headers-sample.csv",
      csv: csv(
        ["  First Name ", "Order ID", "orderDate", ""],
        [
          ["Ann", "1001", "2024-01-17", "x"],
          ["Sam", "1002", "2024-02-03", "y"],
          ["Maria", "1003", "2024-02-09", "x"],
          ["Aiko", "1004", "2024-02-12", ""],
        ],
      ),
    },
  ],
  "rename-columns-csv": [
    {
      name: "rename-columns-csv-sample.csv",
      csv: csv(
        ["Phone", "E-mail", "Full Name"],
        [
          ["555-0101", "ann@example.com", "Ann Lee"],
          ["555-0102", "sam@example.com", "Sam Park"],
          ["555-0103", "maria.lopez@example.com", "Maria Lopez"],
          ["555-0104", "aiko.t@example.net", "Aiko Tanaka"],
        ],
      ),
    },
  ],
};

export function toolSample(t: ToolPage): ToolSample {
  const files = BESPOKE[t.slug] ?? [{ name: `${t.slug}-sample.csv`, csv: SAMPLE_CSV }];
  return { files, steps: BESPOKE[t.slug] ? [...t.example.steps] : [], xlsx: t.slug === "excel-to-csv" };
}

/** Every downloadable sample file name → its CSV text (and which tool it belongs to). */
export function sampleFileIndex(): Map<string, { slug: string; csv: string }> {
  const out = new Map<string, { slug: string; csv: string }>();
  for (const t of TOOLS) for (const f of toolSample(t).files) out.set(f.name, { slug: t.slug, csv: f.csv });
  return out;
}
