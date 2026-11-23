import Link from "next/link";
import { Art } from "@/components/Art";

export default function NotFound() {
  return (
    <section className="mint-grid">
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <Art name="bubbles" eager className="float h-auto w-[160px]" />
        <p className="chip mt-6">404</p>
        <h1 className="display display-out mt-4 text-[clamp(3rem,12vw,6rem)] leading-[0.92]">That page washed away.</h1>
        <p className="mt-4 text-[19px] font-semibold">This address does not exist. The cleaner is one click away.</p>
        <p className="mt-8">
          <Link href="/" className="btn-pop">
            Open the cleaner
          </Link>
        </p>
      </div>
    </section>
  );
}
