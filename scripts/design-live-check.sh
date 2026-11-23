#!/usr/bin/env bash
# Checks that the redesigned pages on both live sites answer 200, three passes in a row.
# Usage: bash scripts/design-live-check.sh
pages_ck="/ /pricing /tools /docs /guides /login /signup /help /support /terms /privacy /sitemap.xml /api/health /bot /tools/broken-link-checker /tools/ssl-certificate-checker /guides/find-and-fix-broken-links"
pages_wt="/ /pricing /tools /docs /guides /login /signup /help /support /terms /privacy /sitemap.xml /api/health /tools/webhook-tester /tools/replay-webhook /guides/verify-stripe-webhook-signatures"
bad=0
for pass in 1 2 3; do
  for p in $pages_ck; do c=$(curl -s -o /dev/null -w '%{http_code}' "https://changekite.com$p"); [ "$c" = 200 ] || { echo "pass $pass changekite.com$p $c"; bad=$((bad+1)); }; done
  for p in $pages_wt; do c=$(curl -s -o /dev/null -w '%{http_code}' "https://webhooktrail.com$p"); [ "$c" = 200 ] || { echo "pass $pass webhooktrail.com$p $c"; bad=$((bad+1)); }; done
done
echo "non-200 responses: $bad"
curl -s https://changekite.com/ | grep -o "example-bakery.com\|Twelve checks\|A score you can actually understand" | sort -u
curl -s https://webhooktrail.com/ | grep -o "Example inspector\|Capture. Inspect. Respond.\|Go deeper when you need to." | sort -u
