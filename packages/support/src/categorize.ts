/**
 * Ticket categorization: keyword rules first (deterministic, testable), then the AI's suggestion when the
 * rules found nothing. An escalation category from either source wins, so a model can never downgrade a
 * security or refund report into a routine ticket, and rules alone are enough to escalate.
 */
import { ESCALATED_CATEGORIES, isCategory, type Category, type Priority } from "./types";

const RULES: { category: Category; re: RegExp }[] = [
  {
    category: "security",
    re: /\b(vulnerab\w*|security (issue|report|hole|bug|problem)|exploit\w*|xss|csrf|sql ?injection|ssrf|rce|breach\w*|hacked|compromis\w*|account takeover|leak(ed|ing)? (data|credentials|keys?)|phishing|bug bounty|responsible disclosure|cve-\d+)\b/i,
  },
  {
    category: "legal",
    re: /\b(lawyer|attorney|legal (action|notice|claim|request)|lawsuit|sue|subpoena|court order|dmca|copyright (claim|infringement)|trademark|cease and desist|law enforcement)\b/i,
  },
  {
    category: "refund-dispute",
    re: /\b(refund\w*|charge ?back\w*|dispute\w*|money back|charged twice|double charged|unauthori[sz]ed (charge|payment)|did not authori[sz]e|fraudulent charge|overcharged|reimburse\w*)\b/i,
  },
  {
    category: "privacy",
    re: /\b(gdpr|ccpa|data (access|export|portability|subject|deletion) request|subject access|dsar|right to (be forgotten|erasure|access)|personal data|delete (all )?my (personal )?data|what data (do you|you) (hold|have|store)|copy of my data)\b/i,
  },
  {
    category: "abuse",
    re: /\b(abuse|abusive|spam(ming)?|harass\w*|malware|illegal content|report (a|an|this) (user|account|site|endpoint)|impersonat\w*|ddos|attacking (my|our) (site|server))\b/i,
  },
  {
    category: "billing",
    re: /\b(invoice|billing|bill|payment|card|subscription|subscribe|upgrade|downgrade|cancel\w*|receipt|charged?|price|pricing|plan|vat|tax)\b/i,
  },
  {
    category: "account",
    re: /\b(log ?in|sign ?in|password|2fa|verification email|verify (my )?email|confirm(ation)? email|email change|change (my )?email|locked out|invitation|invite|team member|seat|delete (my )?account|account)\b/i,
  },
  {
    category: "bug",
    re: /\b(bug|error|crash\w*|broken|doesn'?t work|does not work|not working|fails?|failed|failing|500|exception|stuck|blank page)\b/i,
  },
  {
    category: "feature-request",
    re: /\b(feature request|would be (nice|great)|could you add|please add|can you add|suggest(ion)?|wish(list)?|roadmap|support for)\b/i,
  },
];

export function categorizeByRules(text: string): Category | null {
  for (const r of RULES) if (r.re.test(text)) return r.category;
  return null;
}

export function isEscalated(c: Category): boolean {
  return ESCALATED_CATEGORIES.includes(c);
}

export function categorize(text: string, aiCategory?: unknown): Category {
  const rule = categorizeByRules(text);
  const ai = isCategory(aiCategory) ? aiCategory : null;
  if (rule && isEscalated(rule)) return rule;
  if (ai && isEscalated(ai)) return ai;
  return rule ?? ai ?? "how-to";
}

export function priorityFor(c: Category): Priority {
  if (isEscalated(c)) return "high";
  if (c === "feature-request") return "low";
  return "normal";
}

export const ESCALATION_REASONS: Partial<Record<Category, string>> = {
  security: "Security report",
  legal: "Legal matter",
  "refund-dispute": "Refund, chargeback or payment dispute",
  abuse: "Abuse report",
  privacy: "Personal data request",
};
