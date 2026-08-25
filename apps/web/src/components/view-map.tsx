import Link from "next/link";
import { ArrowDown, ArrowRight, Database } from "lucide-react";
import { VIEWS, type ViewId } from "@/lib/views";

/**
 * How the eight screens fit together, drawn once.
 *
 * The complaint this answers is that the product read as a pile of unrelated pages. It
 * is not - it is three moves. Start wide, narrow to one subject, then ask a costed
 * question of that subject. Saying so in a diagram takes a reader about four seconds;
 * saying it in prose takes a paragraph nobody reads.
 *
 * Built from HTML boxes and arrow glyphs rather than an SVG because the tiers have to
 * stack on a phone and reflow at every width in between - an SVG would need a second
 * hand-laid-out copy for narrow viewports, and the two would drift.
 *
 * No "use client": it renders links and static text, so it works as a server component on
 * `/source` and simply travels along in the bundle where the map's orientation panel
 * (which is client-side) uses it.
 */

const TIERS: { heading: string; caption: string; views: ViewId[] }[] = [
  {
    heading: "1 · Start wide",
    caption: "Nothing selected. Both of these show the whole cube at once.",
    views: ["map", "explore"],
  },
  {
    heading: "2 · Narrow to one subject",
    caption: "One economy, one pair, or one kind of goods. Every figure below is this cut.",
    views: ["country", "corridor", "sector"],
  },
  {
    heading: "3 · Ask a question of it",
    caption: "What it buys more of than it makes, what crossing the border costs, and who could fill the gap.",
    views: ["needs", "tariffs", "opportunities"],
  },
];

const HREF: Record<ViewId, string> = {
  map: "/",
  explore: "/explore",
  // The three subject views need a subject. These are the largest examples in the data
  // rather than invented ones, and they exist only so the diagram is clickable - the real
  // route in is a click on the map or a row in a table.
  country: "/country/CHN",
  corridor: "/corridor/CHN/USA",
  sector: "/product/84-85_MachElec",
  needs: "/needs",
  tariffs: "/tariffs",
  opportunities: "/opportunities",
  source: "/source",
};

export function ViewMap({
  compact = false,
  /** False on `/source` itself, where the base note would link to the page you are on. */
  linkToSource = true,
}: {
  compact?: boolean;
  linkToSource?: boolean;
}) {
  return (
    <div>
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
        {TIERS.map((tier, i) => (
          <li key={tier.heading} className="flex flex-col gap-2 lg:flex-1 lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1 rounded-lg border border-hairline bg-plane p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                {tier.heading}
              </p>
              {!compact && (
                <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{tier.caption}</p>
              )}
              <ul className="mt-2 space-y-1.5">
                {tier.views.map((id) => {
                  const { Icon, label, question } = VIEWS[id];
                  return (
                    <li key={id}>
                      <Link
                        href={HREF[id]}
                        className="group flex items-start gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-raised"
                      >
                        <Icon
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-series-1"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-ink group-hover:underline">
                            {label}
                          </span>
                          {!compact && (
                            <span className="block text-2xs leading-snug text-ink-muted">
                              {question}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {i < TIERS.length - 1 && (
              <span
                className="flex shrink-0 items-center justify-center self-center text-ink-muted lg:px-2"
                aria-hidden
              >
                <ArrowDown className="h-4 w-4 lg:hidden" />
                <ArrowRight className="hidden h-4 w-4 lg:block" />
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Source is not a fourth step - it sits under all three, which is why it is drawn
          as a base rather than as another box in the row. */}
      <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-plane px-3 py-2 text-2xs text-ink-muted">
        <Database className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        Every figure on all of these comes from one published build, so the same number on
        two of them really is the same number.
        {linkToSource && (
          <Link href="/source" className="font-medium text-series-1 hover:underline">
            Source, vintage and what the build dropped
          </Link>
        )}
      </p>
    </div>
  );
}
