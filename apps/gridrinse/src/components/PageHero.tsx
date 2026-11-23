import { Art } from "@/components/Art";

/**
 * The cobalt grid band that opens every inner page, matching the homepage hero: poster headline in outlined white
 * condensed caps, one short line under it, and the bubble mascot on wide screens.
 * `eyebrow` is kept for callers but shown as a black fact chip rather than a small tracked label.
 */
export function PageHero({
  eyebrow,
  title,
  children,
  narrow,
  art = "mascot-wave",
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  narrow?: boolean;
  art?: "mascot-wave" | "bubbles" | "lock" | "sheet" | "trophy" | null;
}) {
  return (
    <section className="mint-grid overflow-hidden">
      <div className={`relative mx-auto px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12 ${narrow ? "max-w-[900px]" : "max-w-[1400px]"}`}>
        <div className={art && !narrow ? "lg:pr-[300px]" : ""}>
          <p className="chip rise">{eyebrow}</p>
          <h1 className="display display-out mt-5 max-w-[20ch] text-[clamp(2.9rem,11vw,6.2rem)] leading-[0.92] [animation-delay:60ms]">{title}</h1>
          {children && <div className="rise mt-5 max-w-[44rem] text-[18px] font-semibold leading-snug [animation-delay:120ms] sm:text-[21px]">{children}</div>}
        </div>
        {art && !narrow && (
          <Art name={art} className="float pointer-events-none absolute bottom-6 right-8 hidden h-auto w-[250px] lg:block" />
        )}
      </div>
    </section>
  );
}
