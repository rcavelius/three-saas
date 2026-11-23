import Link from "next/link";

/**
 * The one-glance explainer: sender -> your WebhookTrail URL -> the inspector -> replay to your app.
 * Real HTML (crisp text, translatable, readable by screen readers), drawn in the grid style.
 * A small orange packet travels each connector in turn (CSS only, transform-only); under reduced
 * motion the packets are hidden and the arrows stay. Sample values are labelled as examples.
 * Senders are plain text labels linking to the tester pages, never presented as customers.
 */
const SENDERS: [string, string][] = [
  ["Stripe", "/tools/stripe-webhook-tester"],
  ["GitHub", "/tools/github-webhook-tester"],
  ["Shopify", "/tools/shopify-webhook-tester"],
  ["Your app", "/tools/send-test-webhook"],
];

function Connector({ step, label }: { step: number; label?: string }) {
  return (
    <div aria-hidden="true" className="wt-flow-conn relative flex min-h-12 items-center justify-center lg:min-h-0" style={{ ["--step" as string]: step }}>
      <span className="wt-flow-line" />
      <span className="wt-flow-head" />
      <span className="wt-flow-packet" />
      {label && <span className="g-cap absolute z-[3] bg-bg px-1.5 text-signal lg:top-3">{label}</span>}
    </div>
  );
}

export function FlowDiagram({ replayNote }: { replayNote: string }) {
  return (
    <figure aria-labelledby="flow-title" className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-4 py-3 md:px-5">
        <h2 id="flow-title" className="g-cap">
          How it works: a sender posts to your URL, you read it, you replay it
        </h2>
        <span className="g-cap text-fg-faint">Example values</span>
      </figcaption>
      <div className="g-row grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_64px_minmax(0,1fr)_64px_minmax(0,1.6fr)_64px_minmax(0,1fr)]">
        {/* 1. Senders */}
        <div className="g-x p-4 md:p-5">
          <p className="g-cap text-fg-dim">1 · Any sender</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {SENDERS.map(([name, href], i) => (
              <li key={name}>
                <Link href={href} className="wt-flow-chip g-link flex h-10 items-center justify-between border border-fg px-3 text-[13px] font-bold uppercase tracking-[0.06em]" style={{ ["--i" as string]: i }}>
                  {name}
                  <span aria-hidden="true" className="arr text-[11px]">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Connector step={0} label="POST" />

        {/* 2. The capture URL */}
        <div className="flex flex-col justify-center p-4 md:p-5">
          <p className="g-cap text-fg-dim">2 · Your WebhookTrail URL</p>
          <p className="mt-3 border border-fg bg-surface px-3 py-3 font-mono text-[13px] leading-5">
            <span className="text-fg-dim">webhooktrail.com</span>
            <span className="block text-[22px] font-extrabold leading-8 tracking-[-0.01em]">/h/abc123</span>
          </p>
          <p className="mt-2 font-mono text-[12px] leading-[18px] text-fg-dim">Answers 200. Records everything.</p>
        </div>

        <Connector step={1} />

        {/* 3. The inspector */}
        <div className="theme-console bg-black! p-3 md:p-4">
          <div className="border border-line-strong/70 bg-surface font-mono text-[12px] leading-[18px]">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-signal">3 · Inspector</span>
              <span className="text-fg-dim">14:27:08</span>
            </div>
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className="border border-[color-mix(in_oklab,var(--color-m-post)_45%,transparent)] px-1.5 text-[10.5px] font-semibold text-m-post">POST</span>
              <span className="truncate">/h/abc123</span>
              <span className="ml-auto text-ok">200</span>
            </div>
            <dl className="grid grid-cols-[8.5rem_1fr] gap-x-2 gap-y-1 border-b border-line px-3 py-2">
              <dt className="text-fg-dim">content-type</dt>
              <dd className="truncate">application/json</dd>
              <dt className="text-fg-dim">user-agent</dt>
              <dd className="truncate">Stripe/1.0</dd>
              <dt className="text-fg-dim">stripe-signature</dt>
              <dd className="text-signal">••••••••</dd>
            </dl>
            <pre className="m-0 overflow-hidden whitespace-pre px-3 py-2 text-code">{`{
  "type": "checkout.session.completed",
  "amount_total": 4900
}`}</pre>
          </div>
        </div>

        <Connector step={2} label="Replay" />

        {/* 4. Replay target */}
        <div className="g-x-r flex flex-col justify-center p-4 md:p-5">
          <p className="g-cap text-fg-dim">4 · Your app</p>
          <p className="mt-3 border border-dashed border-fg px-3 py-3 font-mono text-[13px] leading-5">
            <span className="block text-[15px] font-extrabold">your app</span>
            <span className="text-fg-dim">staging.example.dev/hooks</span>
          </p>
          <p className="mt-2 font-mono text-[12px] leading-[18px] text-fg-dim">{replayNote}</p>
        </div>
      </div>
    </figure>
  );
}
