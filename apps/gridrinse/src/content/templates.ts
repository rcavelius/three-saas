/**
 * Spreadsheet templates sold at /templates (one-time Stripe Checkout, instant download for 30 days).
 *
 * - Facts about each file (features, sheets, steps, screenshots) come from templates.data.json, generated from the
 *   real workbook folders by scripts/templates/extract-template-data.py. File names and sizes come from
 *   template-files.json (written by scripts/templates/upload-template-files.mjs when the files go to private storage).
 * - The paid .xlsx/.pdf files are NEVER in this repository: they live in the private KV namespace the Worker serves
 *   signed downloads from.
 * - SEO titles/descriptions below target the real search terms in the digital-products research (etsy-niches.md).
 * - Copy must stay true: no reviews, no sales counts. The hero and lifestyle images are AI-generated backgrounds with a
 *   real screenshot of the file on the screen; the gallery screenshots are real.
 */
import type { ProductDef } from "@repo/billing";
import DATA from "./templates.data.json";
import FILES from "./template-files.json";

export interface TemplateFile {
  kind: "excel" | "gsheets" | "guide";
  name: string;
  key: string;
  bytes: number;
  sha256: string;
}

interface TemplateData {
  name: string;
  priceCents: number;
  etsyTitle: string;
  intro: string;
  features: string[];
  sheets: { name: string; what: string }[];
  steps: string[];
  tips: string[];
  shots: string[];
  tags: string[];
}

interface TemplateSeo {
  slug: string;
  /** <title>, ≤ 65 characters, leads with the search term. */
  title: string;
  /** Meta description, 120–165 characters. */
  description: string;
  /** Page headline (outlined poster type, keep it short). */
  h1: string;
  /** One line under the headline. */
  tagline: string;
  /** Who it is for (one sentence). */
  forWho: string;
  /** Template-specific questions (the shared ones are added on the page). */
  faq: { q: string; a: string }[];
  /** /tools/<slug> pages this template fits (the template is linked from those pages). */
  tools: string[];
  /** /guides/<slug> pages this template fits. */
  guides: string[];
  /** Category shown on the catalogue card. */
  category: "Personal finance" | "Small business" | "Property" | "Life events";
}

export interface Template extends TemplateData, TemplateSeo {
  files: TemplateFile[];
  /** Stripe lookup key of the one-time price. */
  lookupKey: string;
}

const SEO: TemplateSeo[] = [
  {
    slug: "annual-budget-planner",
    title: "2027 Budget Planner Spreadsheet (Excel & Google Sheets)",
    description:
      "A simple 2027 budget planner spreadsheet for Excel and Google Sheets: monthly budget, annual summary and a dashboard. Instant download, no subscription.",
    h1: "2027 budget planner",
    tagline: "Type each transaction once. The dashboard shows any month, and the whole year, at a glance.",
    forWho: "Anyone who wants a monthly and annual budget without an app or a subscription.",
    faq: [
      {
        q: "Does it work for a monthly budget as well as the whole year?",
        a: "Yes. Pick any month on the dashboard to see what came in, what went out and how each category did against its budget; the Annual Summary shows all twelve months side by side.",
      },
      {
        q: "Can I import my bank transactions?",
        a: "Paste them into the Transactions sheet (date, description, amount, category). If your bank export has messy dates or numbers, clean it first with the free GridRinse tools.",
      },
    ],
    tools: ["fix-dates-csv", "clean-numbers-csv", "csv-to-excel"],
    guides: ["fix-excel-dates", "currency-and-number-formats"],
    category: "Personal finance",
  },
  {
    slug: "paycheck-budget-planner",
    title: "Paycheck Budget Spreadsheet: Biweekly Bill Planner",
    description:
      "Paycheck budget template for Excel and Google Sheets: see which bills each biweekly, weekly or monthly paycheck covers and what is left to spend. Instant download.",
    h1: "Paycheck budget planner",
    tagline: "See exactly which bills come out of which paycheck, and what is left.",
    forWho: "People paid weekly, every two weeks, twice a month or monthly who want to plan bills by paycheck.",
    faq: [
      {
        q: "Does it handle biweekly pay?",
        a: "Yes. Choose weekly, every two weeks, twice a month or monthly, and your next payday; the planner works out every payday of the year and matches each bill to the last paycheck that arrives before its due date.",
      },
      {
        q: "Is this a full budget app?",
        a: "No, on purpose. It answers one question well: which bills each paycheck must cover and what is left. For a full-year budget see the 2027 Budget Planner.",
      },
    ],
    tools: ["fix-dates-csv", "clean-numbers-csv"],
    guides: ["currency-and-number-formats"],
    category: "Personal finance",
  },
  {
    slug: "debt-payoff-planner",
    title: "Debt Snowball Spreadsheet & Avalanche Debt Payoff Planner",
    description:
      "Debt payoff spreadsheet for Excel and Google Sheets: compare debt snowball vs avalanche, see your debt-free date and the interest you save. Instant download.",
    h1: "Debt payoff planner",
    tagline: "Your debt-free date, snowball vs avalanche, and the interest you save.",
    forWho: "Anyone paying off credit cards, loans or medical bills who wants a clear plan and a date.",
    faq: [
      {
        q: "Snowball or avalanche: which does it use?",
        a: "Both. It compares snowball (smallest balance first), avalanche (highest rate first) and minimum payments only side by side, and you pick the strategy to follow. When a debt is paid off its payment rolls onto the next one.",
      },
      {
        q: "How many debts can I add?",
        a: "Up to 10 debts (credit cards, loans, store cards, medical bills), with a month-by-month schedule for up to 30 years.",
      },
    ],
    tools: ["clean-numbers-csv", "csv-to-excel"],
    guides: ["currency-and-number-formats"],
    category: "Personal finance",
  },
  {
    slug: "savings-challenge-tracker",
    title: "100 Envelope Challenge & 52 Week Savings Challenge Tracker",
    description:
      "Savings challenge tracker spreadsheet: the 100 envelope challenge, the 52 week savings challenge and your own savings goals in one Excel and Google Sheets file.",
    h1: "Savings challenge tracker",
    tagline: "100 envelopes, 52 weeks and your own goals, with a dashboard that fills in as you save.",
    forWho: "Savers who like a challenge and want to see progress without paper charts.",
    faq: [
      {
        q: "Which challenges are included?",
        a: "The 100 envelope challenge, the 52 week savings challenge, and a goals sheet for your own targets (holiday, emergency fund, a new laptop). Tick off what you save and the dashboard updates.",
      },
      {
        q: "Can I change the amounts?",
        a: "Yes. On the Dashboard set the 52 week starting amount and the envelope multiplier (0.5 halves the 100 envelope total to 2,525). The 52 weeks can run forward or in reverse.",
      },
    ],
    tools: ["csv-to-excel"],
    guides: [],
    category: "Personal finance",
  },
  {
    slug: "small-business-bookkeeping",
    title: "Small Business Bookkeeping Spreadsheet 2027 (P&L Template)",
    description:
      "Small business bookkeeping spreadsheet for 2027: income and expense tracker, monthly profit and loss, quarterly totals and mileage. Excel and Google Sheets.",
    h1: "Small business bookkeeping 2027",
    tagline: "Money in, money out, and a profit and loss that builds itself.",
    forWho: "Freelancers, sole traders and small businesses that do not need accounting software.",
    faq: [
      {
        q: "Is this a replacement for an accountant?",
        a: "No. It keeps clean records, a monthly profit and loss and quarterly totals you can hand to an accountant or use for estimated taxes. It is not tax advice.",
      },
      {
        q: "Can I paste in my bank or Stripe export?",
        a: "Yes, paste rows into the income and expense sheets. To fix dates and amounts in an export first (for example 1.234,56 or 03/04/2027), use the free GridRinse cleaning tools in your browser.",
      },
    ],
    tools: ["clean-numbers-csv", "fix-dates-csv", "merge-csv-files", "csv-to-excel"],
    guides: ["currency-and-number-formats", "fix-excel-dates", "batch-clean-exports"],
    category: "Small business",
  },
  {
    slug: "inventory-tracker",
    title: "Inventory Tracker Spreadsheet with Low Stock Alerts",
    description:
      "Inventory tracker spreadsheet for small businesses: products, stock moves, low stock alerts, stock value and margins. Excel and Google Sheets, instant download.",
    h1: "Inventory and stock tracker",
    tagline: "Live stock, stock value and low-stock alerts from one simple log.",
    forWho: "Makers, resellers and small shops that keep stock and want to know what to reorder.",
    faq: [
      {
        q: "How do I record a sale or a restock?",
        a: "Add one row to Stock Moves: date, product, type (restock, sale, return, damaged, count correction) and quantity. Stock levels, stock value and alerts update by themselves.",
      },
      {
        q: "Can I import my product list from Shopify or Etsy?",
        a: "Paste SKU, name, cost and price into the Products sheet. If the export has duplicates or messy columns, clean it first with the free GridRinse tools.",
      },
    ],
    tools: ["remove-duplicates-csv", "merge-csv-files", "remove-columns-csv", "csv-to-excel"],
    guides: ["clean-shopify-orders-export", "dedupe-strategies"],
    category: "Small business",
  },
  {
    slug: "etsy-seller-profit-tracker",
    title: "Etsy Seller Spreadsheet: Etsy Fee Calculator & Profit Tracker",
    description:
      "Etsy seller spreadsheet with an Etsy fee calculator, pricing calculator and profit tracker: see what you keep after every fee. Excel and Google Sheets.",
    h1: "Etsy seller profit tracker",
    tagline: "What you actually keep after transaction, processing, listing and ad fees.",
    forWho: "Etsy sellers who want real profit per product and per month, not just revenue.",
    faq: [
      {
        q: "Which Etsy fees does it include?",
        a: "Transaction, payment processing, listing renewal and Offsite Ads fees. The rates are preset to the standard US rates in Settings, so you can change them for your country or if Etsy changes its fees.",
      },
      {
        q: "Is this made by Etsy?",
        a: "No. It is an independent template by GridRinse and is not affiliated with or endorsed by Etsy.",
      },
    ],
    tools: ["clean-numbers-csv", "merge-csv-files", "csv-to-excel"],
    guides: ["clean-shopify-orders-export", "batch-clean-exports"],
    category: "Small business",
  },
  {
    slug: "wedding-budget-planner",
    title: "Wedding Budget Spreadsheet with Guest List & RSVP Tracker",
    description:
      "Wedding budget planner spreadsheet: budget split, vendor payments, guest list with RSVP and meals, and a planning checklist. Excel and Google Sheets.",
    h1: "Wedding budget planner",
    tagline: "Budget, vendors, guests and the checklist, in one calm place.",
    forWho: "Couples planning a wedding who want to know what is paid, what is due next and who is coming.",
    faq: [
      {
        q: "Does it work in both Excel and Google Sheets?",
        a: "Yes. You get an Excel version and a Google-Sheets-ready version of the same planner, so both partners can use what they have.",
      },
      {
        q: "Can I track RSVPs and meal choices?",
        a: "Yes. The Guest List tracks invites, RSVP, meal choice, table, gift and thank-you notes; the dashboard counts confirmed guests and meals for your caterer.",
      },
    ],
    tools: ["remove-duplicates-csv", "merge-csv-files", "remove-duplicate-emails-csv"],
    guides: ["clean-contacts-export-for-import"],
    category: "Life events",
  },
  {
    slug: "rental-property-manager",
    title: "Rental Property Spreadsheet: Landlord Rent & Expense Tracker",
    description:
      "Rental property spreadsheet for landlords: rent roll, tenant and lease tracker, expenses, cash flow and occupancy per property. Excel and Google Sheets.",
    h1: "Rental property manager",
    tagline: "Rent roll, tenants, leases and costs for every property and unit.",
    forWho: "Landlords with one to a few dozen units who want rent and costs in one workbook.",
    faq: [
      {
        q: "Does it show who has not paid rent?",
        a: "Yes. The Rent Roll shows every tenant and month: green paid, amber part-paid, red missing. The dashboard lists leases ending in the next 60 days.",
      },
      {
        q: "Is it tax or legal advice?",
        a: "No. It is a record-keeping tool. Cap rate and cash flow are there to compare properties, not to value them.",
      },
    ],
    tools: ["fix-dates-csv", "clean-numbers-csv", "csv-to-excel"],
    guides: ["fix-excel-dates", "currency-and-number-formats"],
    category: "Property",
  },
  {
    slug: "airbnb-host-tracker",
    title: "Airbnb Host Spreadsheet: Short-Term Rental Income Tracker",
    description:
      "Airbnb host spreadsheet for short-term rentals: bookings, payouts, platform fees, occupancy, ADR and RevPAR per listing. Excel and Google Sheets, instant download.",
    h1: "Short-term rental host tracker",
    tagline: "Bookings, payouts, occupancy, ADR and RevPAR for every listing.",
    forWho: "Hosts with one to eight listings on Airbnb, Vrbo, Booking.com or direct.",
    faq: [
      {
        q: "Does it work for Vrbo and Booking.com too?",
        a: "Yes. Each booking has a platform (Airbnb, Vrbo, Booking.com or direct) and its own platform fee, and the dashboard shows payout by platform.",
      },
      {
        q: "Is this made by Airbnb?",
        a: "No. It is an independent template by GridRinse and is not affiliated with Airbnb, Vrbo or Booking.com.",
      },
    ],
    tools: ["fix-dates-csv", "clean-numbers-csv", "merge-csv-files"],
    guides: ["fix-excel-dates", "batch-clean-exports"],
    category: "Property",
  },
];

const data = DATA as Record<string, TemplateData>;
const files = FILES as Record<string, TemplateFile[]>;

export const lookupKeyFor = (slug: string) => `gridrinse_template_${slug.replace(/-/g, "_")}`;

export const TEMPLATES: Template[] = SEO.map((s) => {
  const d = data[s.slug];
  const f = files[s.slug];
  if (!d) throw new Error(`templates.data.json has no entry for ${s.slug}`);
  if (!f?.length) throw new Error(`template-files.json has no files for ${s.slug}`);
  return { ...d, ...s, files: f, lookupKey: lookupKeyFor(s.slug) };
});

/** Every template in one purchase. */
export const BUNDLE = {
  id: "bundle",
  slug: "bundle",
  name: `All ${TEMPLATES.length} spreadsheet templates`,
  priceCents: 3900,
  lookupKey: "gridrinse_template_bundle",
} as const;

/** Days a buyer's download link keeps working. */
export const ACCESS_DAYS = 30;

export function getTemplate(slug: string): Template | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

/** Products for @repo/billing (one per template plus the bundle). */
export const TEMPLATE_PRODUCTS: ProductDef[] = [
  ...TEMPLATES.map((t) => ({ id: t.slug, name: `${t.name} (spreadsheet template)`, priceCents: t.priceCents, stripeLookupKey: t.lookupKey, accessDays: ACCESS_DAYS })),
  { id: BUNDLE.id, name: `GridRinse spreadsheet templates: ${BUNDLE.name.toLowerCase()}`, priceCents: BUNDLE.priceCents, stripeLookupKey: BUNDLE.lookupKey, accessDays: ACCESS_DAYS },
];

/** The templates a product id unlocks (the bundle unlocks all). */
export function templatesForProduct(productId: string): Template[] {
  if (productId === BUNDLE.id) return TEMPLATES;
  const t = getTemplate(productId);
  return t ? [t] : [];
}

export const templatesForTool = (toolSlug: string) => TEMPLATES.filter((t) => t.tools.includes(toolSlug));
export const templatesForGuide = (guideSlug: string) => TEMPLATES.filter((t) => t.guides.includes(guideSlug));

export const priceLabel = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const bundleSavingsCents = () => TEMPLATES.reduce((n, t) => n + t.priceCents, 0) - BUNDLE.priceCents;

/** Image paths under /public/templates/<slug>/ (made by scripts/templates/make-template-images.py). */
export function templateImages(t: Pick<Template, "slug" | "name" | "shots">) {
  const base = `/templates/${t.slug}`;
  return {
    hero: { src: `${base}/hero.webp`, alt: `${t.name} on a laptop: real screenshot of the dashboard; the room is an AI-generated mockup`, ai: true },
    card: { src: `${base}/card.webp`, alt: `${t.name} spreadsheet template` },
    gallery: [
      ...t.shots.map((tab, i) => ({ src: `${base}/shot-${i + 1}.webp`, alt: `Real screenshot of the ${tab} sheet of the ${t.name}, sample data shown`, caption: `${tab} (real screenshot, sample data)`, ai: false })),
      { src: `${base}/lifestyle.webp`, alt: `${t.name} on a device: real screenshot; the setting is an AI-generated mockup`, caption: "Mockup: AI-generated setting, real screenshot", ai: true },
    ],
  };
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
