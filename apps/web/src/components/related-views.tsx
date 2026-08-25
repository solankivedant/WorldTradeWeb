import Link from "next/link";
import { ArrowUpRight, Compass } from "lucide-react";
import { VIEWS, type RelatedLink } from "@/lib/views";

/**
 * The "where to go next" band that closes every dashboard.
 *
 * Before this, each route was a dead end. The country page offered two links, the
 * corridor page three, the sector page none at all - so the only way to learn that a
 * sector page and a corridor page were views of one dataset was to click a table row and
 * be surprised. A reader who could not see the next question could not ask it.
 *
 * Every entry names the DESTINATION concretely ("What Germany charges") and states the
 * question it answers, because a bare route name is not a reason to click. The links are
 * built by the helpers in `lib/views.ts` so the href and the sentence promising what is
 * behind it are written in the same place.
 *
 * A server component: it renders `next/link`s and nothing else, so it costs no client JS.
 */
export function RelatedViews({
  links,
  title = "Where to go next",
  hint,
}: {
  links: RelatedLink[];
  title?: string;
  /** One line saying how these views relate to the one being read. */
  hint?: string;
}) {
  if (links.length === 0) return null;

  return (
    <section className="card mt-3 p-4" aria-labelledby="related-views">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="related-views"
          className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          <Compass className="h-3 w-3" aria-hidden />
          {title}
        </h2>
        {hint && <p className="text-2xs text-ink-muted">{hint}</p>}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => {
          const { Icon, label: viewLabel } = VIEWS[link.view];
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex h-full items-start gap-2.5 rounded-lg border border-hairline bg-plane p-3 transition-colors hover:border-series-1/50 hover:bg-raised"
              >
                <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-series-1/10 text-series-1">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  {/* The view's own name rides above the specific destination, so the
                      reader learns the vocabulary of the app while using it rather than
                      having to infer it from URLs. */}
                  <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                    {viewLabel}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm font-medium text-ink">
                    <span className="min-w-0 truncate">{link.label}</span>
                    <ArrowUpRight
                      className="h-3 w-3 shrink-0 text-ink-muted transition-colors group-hover:text-series-1"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                    {link.question}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
