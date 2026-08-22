import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <Compass className="h-7 w-7 text-ink-muted" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        That country, corridor, or sector is not in the published dataset. Country codes
        are ISO 3166-1 alpha-3 - <span className="tabular">IND</span>, not{" "}
        <span className="tabular">IN</span> or <span className="tabular">India</span>.
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/"
          className="rounded-md border border-series-1/40 bg-series-1/10 px-3 py-1.5 text-xs hover:bg-series-1/20"
        >
          Back to the map
        </Link>
        <Link
          href="/about/data"
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-secondary hover:text-ink"
        >
          What data is covered
        </Link>
      </div>
    </div>
  );
}
