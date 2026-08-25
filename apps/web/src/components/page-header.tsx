import { Crumb } from "@/components/ui";
import { VIEWS, type ViewId } from "@/lib/views";

/**
 * The standard head of every dashboard route.
 *
 * The six dashboards each grew their own header, and they diverged: some stated what the
 * page was for, some only named it, and none of them said what ONE screen of it is about.
 * A reader arriving on `/product/...` from a chart click met a title, four figures and no
 * statement that they were now looking at the whole world rather than the country they
 * came from - which is the single most common way to misread this app.
 *
 * So three things are mandatory here and optional nowhere: the trail back, the question
 * this view answers (from `lib/views.ts`, the same sentence its inbound links promise),
 * and the grain - the unit of analysis. `lede` stays free text for what is specific to
 * this instance of the view.
 */
export function PageHeader({
  crumb,
  view,
  title,
  subject,
  lede,
  meta,
  actions,
}: {
  crumb: { label: string; href?: string }[];
  view: ViewId;
  title: React.ReactNode;
  /** Flag, sector glyph or similar, sitting inside the h1 ahead of the title. */
  subject?: React.ReactNode;
  lede?: React.ReactNode;
  /** Sub-line of attributes - region, income group, HS chapters, vintage. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const def = VIEWS[view];
  const { Icon } = def;

  return (
    <header>
      <Crumb items={crumb} />

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* The view's name above the instance name. "Connection" over "India and China"
              teaches the reader which of the eight lenses they are holding, which is the
              thing the breadcrumb alone never told them. */}
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <Icon className="h-3 w-3" aria-hidden />
            {def.label}
            <span className="font-normal normal-case tracking-normal text-ink-muted/80">
              · {def.grain}
            </span>
          </p>

          <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-2xl font-semibold tracking-tight">
            {subject}
            {title}
          </h1>

          {meta && <p className="mt-1 text-xs text-ink-muted">{meta}</p>}

          {/* The view's standing question first, then whatever is specific to this
              instance. Both are prose, so they read as one paragraph. */}
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-secondary">
            <span className="font-medium text-ink">Answers:</span> {def.question}
            {lede ? <> {lede}</> : null}
          </p>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
