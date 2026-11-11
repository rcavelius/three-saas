import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Privacy (draft)", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <DocPage eyebrow="Privacy policy" title="Privacy" draft lede="This draft describes what the software in this repository actually does today. It must be reviewed by a lawyer and completed with the operator's legal details before publication.">
      <h2>Who is responsible</h2>
      <p>[Operator name, address and contact email to be added.]</p>

      <h2>What we collect when you run a free scan</h2>
      <ul>
        <li>The website address you enter, and the report we produce from the public pages of that site.</li>
        <li>
          For rate limiting, a one-way hash of your IP address is kept in a counter for the current hour. The scan record
          itself does not store your IP address.
        </li>
        <li>Standard server logs (time, path, status) kept by the hosting provider.</li>
      </ul>
      <p>No account is needed for a free scan, no cookies are set for it, and no third-party analytics or advertising scripts are loaded.</p>

      <h2>Reports</h2>
      <p>
        Each report is stored under a long random link. Anyone who has the link can view the report, so share it with care.
        Reports are deleted automatically after the retention period (90 days by default).
      </p>
      <p>
        Reports contain information that was publicly available on the scanned site at the time of the scan, such as page
        addresses, titles and links.
      </p>

      <h2>Why we process this data</h2>
      <p>[Legal basis to be confirmed, e.g. providing the service you requested and preventing abuse.]</p>

      <h2>Your rights</h2>
      <p>[Access, deletion and complaint rights and how to exercise them, to be completed for the jurisdictions served.]</p>

      <h2>Processors</h2>
      <p>[Hosting and database providers to be listed once chosen.]</p>
    </DocPage>
  );
}
