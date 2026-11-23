import { CheckoutButton, PortalButton } from "@/components/account/BillingActions";

export function BillingActions({
  isOwner,
  paid,
  currentPlanId,
  plans,
  freePlanId,
}: {
  isOwner: boolean;
  paid: boolean;
  currentPlanId: string;
  plans: { id: string; name: string; priceMonthlyCents: number }[];
  freePlanId: string;
}) {
  if (!isOwner) {
    return <p className="mt-6 text-[13px] text-fg-muted">Only the workspace owner can change the plan or payment details.</p>;
  }
  return (
    <section aria-labelledby="b-change" className="mt-6 grid gap-4">
      <h2 id="b-change" className="text-[16px] font-semibold">
        {paid ? "Change or cancel" : "Upgrade"}
      </h2>
      {paid ? (
        <div className="max-w-md">
          <PortalButton />
          <p className="mt-2 text-[12.5px] text-fg-dim">
            Switching plans, updating the card and canceling happen in Stripe&apos;s billing portal. Canceling keeps the plan until the end of
            the paid period. Charged in error, or it did not work for you in your first 14 days? Contact support within 14 days for a full refund.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          {plans
            .filter((pl) => pl.id !== freePlanId && pl.id !== currentPlanId)
            .map((pl, i) => (
              <div key={pl.id} className="border border-line rounded-[6px] p-4 grid gap-2">
                <p className="font-semibold">
                  {pl.name} · ${(pl.priceMonthlyCents / 100).toFixed(0)}/month
                </p>
                <CheckoutButton planId={pl.id} label={`Upgrade to ${pl.name}`} primary={i === 0} />
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
