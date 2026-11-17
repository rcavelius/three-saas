/**
 * Unsolicited sales pitches sent through the public support form ("SEO packages", "register your site in
 * Google's index", "explainer videos from $195"). Spammers pick the Legal or Report-abuse category to look
 * urgent, which would page the operator. A ticket counts as a pitch only when
 *   - it comes from an anonymous visitor (signed-in customers are never filtered),
 *   - its own text does not match an escalation keyword rule (a real legal notice, security report, refund
 *     dispute, data request or abuse report always goes through), and
 *   - it has two strong sales-pitch signals, or one strong and one weak one. Weak signals alone ("are you
 *     interested", "our prices") also appear in ordinary customer questions, so they never suffice.
 * Pitches are stored closed (the operator can still read them in the queue) and send no email at all.
 */
const STRONG: RegExp[] = [
  /\bseo\b/i,
  /\b(google'?s )?search (engine )?index\b/i,
  /\b(register|list|submit) [a-z0-9-]+\.[a-z]{2,}\b/i,
  /\bonline (visibility|presence)\b/i,
  /\bprices? start(s|ing)? (from|at)\b/i,
  /\b(seo|marketing|design|video|pricing) packages?\b/i,
  /\b(samples|examples|portfolio) of (our|my) (previous |past )?work\b/i,
  /\b(explainer|animated|promo(tional)?|engaging) video\b/i,
  /\b(backlinks?|guest post(ing)?|link building|lead generation|web ?design services|app development services)\b/i,
];
const WEAK: RegExp[] = [
  /\bfirst page\b/i,
  /\b(more|increase|boost) (your )?(visitors|traffic|leads|sales|customers|conversions)\b/i,
  /\bconverting more\b/i,
  /\bour (prices|rates|agency)\b/i,
  /\b(if|are) (you('re| are)? )?interested\b/i,
];

export function pitchSignals(text: string): { strong: number; weak: number } {
  return { strong: STRONG.filter((re) => re.test(text)).length, weak: WEAK.filter((re) => re.test(text)).length };
}

export function isSalesPitch(text: string): boolean {
  const { strong, weak } = pitchSignals(text);
  return strong >= 2 || (strong >= 1 && weak >= 1);
}
