/**
 * The illustrative report shown on the home page. It is clearly labelled as example data on every surface
 * (example-bakery.com is a reserved-style example name, not a customer). Its score and grade come from the
 * real scoring function, so the marketing visual can never disagree with what the scanner would say.
 */
import type { Issue } from "@/lib/scanner/types";
import { computeScore } from "@/lib/scanner/score";

export const EXAMPLE_HOST = "example-bakery.com";

export const EXAMPLE_ISSUES: Issue[] = [
  {
    id: "internal-link-broken",
    check: "internal-links",
    severity: "critical",
    page: `https://${EXAMPLE_HOST}/menu`,
    message: "Broken internal link to /order-now",
    detail: "Linked from the menu page; the server answers 404.",
    howToFix: "Point the link at the page that replaced it, or redirect /order-now there.",
  },
  {
    id: "meta-description-missing",
    check: "meta-description",
    severity: "warning",
    page: `https://${EXAMPLE_HOST}/menu`,
    message: "The menu page has no meta description",
    detail: "Search results will show whatever text the engine picks.",
    howToFix: "Write a one-sentence summary of the page.",
  },
  {
    id: "canonical-missing",
    check: "canonical",
    severity: "notice",
    page: `https://${EXAMPLE_HOST}/`,
    message: "The home page declares no canonical URL",
    detail: "Search engines have to guess which address is the main one.",
    howToFix: "Add <link rel=\"canonical\"> pointing at the preferred address.",
  },
];

export const EXAMPLE_PASSED = ["HTTPS certificate valid", "XML sitemap present", "robots.txt found"];

export const EXAMPLE_PAGES = 25;

export function exampleScore() {
  return computeScore(EXAMPLE_ISSUES);
}
