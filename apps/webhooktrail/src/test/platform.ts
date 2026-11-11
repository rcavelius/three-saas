/** Test platform: in-memory PGlite + FakeStripe (signed webhooks verified by the real Stripe SDK). */
import { FakeStripe } from "@repo/billing/testing";
import * as checkoutRoute from "@/app/api/billing/checkout/route";
import * as webhookRoute from "@/app/api/billing/webhook/route";
import { CATALOG } from "@/lib/plans";
import { createPlatform, installPlatformForTests, type Platform, type PlatformOptions } from "@/lib/platform";
import { apiRequest, ORIGIN, type TestUser } from "./helpers";

export const WEBHOOK_SECRET = "whsec_test_webhooktrail_0123456789abcdef";

export async function setupPlatform(over: Partial<PlatformOptions> = {}): Promise<{ p: Platform; fake: FakeStripe }> {
  const fake = new FakeStripe({ webhookSecret: WEBHOOK_SECRET, catalogs: [CATALOG] });
  const p = await createPlatform({
    databaseUrl: "pglite:memory",
    appUrl: ORIGIN,
    sessionSecret: "test-session-secret-0123456789-0123456789-abcdef",
    stripe: fake,
    webhookSecret: WEBHOOK_SECRET,
    emailFrom: "WebhookTrail <noreply@webhooktrail.invalid>",
    clientIp: { mode: "fly" },
    ...over,
  });
  installPlatformForTests(p);
  return { p, fake };
}

/** Delivers every queued FakeStripe event to the APP's webhook route (raw body + Stripe-Signature). */
export async function deliverWebhooks(fake: FakeStripe): Promise<number[]> {
  const statuses: number[] = [];
  for (const e of fake.takeEvents()) {
    const res = await webhookRoute.POST(
      new Request(`${ORIGIN}/api/billing/webhook`, {
        method: "POST",
        headers: { "stripe-signature": e.header, "content-type": "application/json" },
        body: e.payload,
      }),
    );
    statuses.push(res.status);
  }
  return statuses;
}

/** Owner checks out through the app's route, pays on (fake) Stripe, webhooks hit the app. */
export async function subscribe(fake: FakeStripe, owner: TestUser, planId: string): Promise<string> {
  const res = await checkoutRoute.POST(apiRequest("POST", "/api/billing/checkout", { jar: owner.jar, body: { planId } }));
  if (res.status !== 200) throw new Error(`checkout ${res.status} ${await res.text()}`);
  const { url } = (await res.json()) as { url: string };
  const session = [...fake.sessionsById.values()].find((s) => s.url === url);
  if (!session) throw new Error("no fake checkout session");
  const subId = fake.completeCheckout(session.id as string);
  const statuses = await deliverWebhooks(fake);
  if (statuses.some((s) => s !== 200)) throw new Error(`webhook statuses ${statuses.join(",")}`);
  return subId;
}
