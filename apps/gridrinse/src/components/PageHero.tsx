/** Mint worksheet band that opens every inner page, matching the homepage hero. */
export function PageHero({
  eyebrow,
  title,
  children,
  narrow,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <section className="mint-grid border-b-2 border-ink">
      <div className={`mx-auto px-4 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-12 ${narrow ? "max-w-[900px]" : "max-w-[1400px]"}`}>
        <p className="text-[14px] font-extrabold uppercase tracking-[0.04em] sm:text-[16px]">{eyebrow}</p>
        <h1 className="display mt-3 max-w-[22ch] text-[2.5rem] sm:text-[3.6rem] lg:text-[4.2rem]">{title}</h1>
        {children && <div className="mt-5 max-w-[46rem] text-[17px] font-medium leading-snug sm:text-[20px]">{children}</div>}
      </div>
    </section>
  );
}
