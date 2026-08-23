import { dataset } from "@/lib/data";
import {
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  FileDown,
  Globe2,
  Landmark,
  Package,
  Ruler,
  ScrollText,
  Share2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Crumb, Warn } from "@/components/ui";

export const metadata = { title: "Data & methodology - WorldTradeWeb" };

interface FullMeta {
  vintage: string;
  built_at: string;
  latest_year: number;
  sources: { name: string; url: string; license: string; datasets?: string[] }[];
  units: Record<string, string>;
  caveats: string[];
  stats: Record<string, unknown>;
  reconciliation_warnings?: string[];
}

/**
 * The source-of-record page.
 *
 * This page is deliberately built differently from every dashboard in the app. A
 * dashboard's job is to answer a question with a figure; this page's job is to let a
 * sceptical reader audit where every figure came from, so it leads with the provenance
 * band - source, vintage, build time, detail year - before it says anything else, and it
 * shows the pipeline as a path rather than as prose because the reader's real question is
 * "what happened to the numbers between the API and this screen".
 *
 * It also states the build's own drop counts. A pipeline that reports what it discarded
 * is auditable; one that reports only what it kept is not, and the drop log is what
 * surfaced the legacy-ISO-code bug in the first place.
 */

const STAT_LABELS: Record<string, { label: string; hint: string; icon: React.ReactNode }> = {
  reporters_with_data: {
    label: "Reporting countries",
    hint: "economies that published usable figures",
    icon: <Globe2 className="h-3.5 w-3.5" aria-hidden />,
  },
  reporters_seen: {
    label: "Reporters requested",
    hint: "asked for, including those that report nothing",
    icon: <Database className="h-3.5 w-3.5" aria-hidden />,
  },
  bilateral_rows: {
    label: "Bilateral flows",
    hint: "country-to-country rows published",
    icon: <Share2 className="h-3.5 w-3.5" aria-hidden />,
  },
  no_data_files: {
    label: "Empty responses",
    hint: "requests the source answered with no rows",
    icon: <FileDown className="h-3.5 w-3.5" aria-hidden />,
  },
  partners_dropped_aggregate: {
    label: "Aggregate rows dropped",
    hint: "\"World\", regions, bunkers - would double-count",
    icon: <Filter className="h-3.5 w-3.5" aria-hidden />,
  },
  partners_dropped_territory: {
    label: "Territory rows dropped",
    hint: "non-country partner codes",
    icon: <Filter className="h-3.5 w-3.5" aria-hidden />,
  },
  products_dropped_other_scheme: {
    label: "Off-scheme product rows dropped",
    hint: "codes from overlapping classifications",
    icon: <Package className="h-3.5 w-3.5" aria-hidden />,
  },
};

const PIPELINE = [
  {
    label: "Fetch",
    icon: <FileDown className="h-4 w-4" aria-hidden />,
    body: "Raw API responses are written unmodified, with a provenance sidecar recording the URL, parameters, and retrieval time. Raw files are never edited in place, so any published figure can be re-derived from scratch.",
  },
  {
    label: "Normalize",
    icon: <ScrollText className="h-4 w-4" aria-hidden />,
    body: "SDMX responses are flattened into plain rows. A value the source reports as null is omitted entirely rather than written as zero.",
  },
  {
    label: "Conform",
    icon: <Filter className="h-4 w-4" aria-hidden />,
    body: "Trade values convert from thousands of USD to USD, exactly once. Superseded country codes map to current ISO 3166-1 alpha-3. Aggregate pseudo-countries are excluded so they cannot double-count, and the count of what was dropped is recorded rather than discarded silently.",
  },
  {
    label: "Validate",
    icon: <ShieldCheck className="h-4 w-4" aria-hidden />,
    body: "Range checks (no negative trade, no tariff above 1000%), reconciliation of sector sums against reported country totals, and anchor checks against independently published figures for major economies. A build that fails these does not publish.",
  },
  {
    label: "Publish",
    icon: <Boxes className="h-4 w-4" aria-hidden />,
    body: "Aggregates are precomputed so that everything on a default screen is a lookup rather than a live computation.",
  },
];

export default function DataPage() {
  const meta = dataset().meta as unknown as FullMeta;
  const stats = meta.stats ?? {};
  const droppedCodes = (stats.dropped_partner_codes ?? {}) as Record<string, number>;

  const builtAt = meta.built_at
    ? `${new Date(meta.built_at).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : null;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-6">
      <Crumb items={[{ label: "Map", href: "/" }, { label: "Data" }]} />

      <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Database className="h-5 w-5 text-ink-muted" aria-hidden />
        Where these numbers come from
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-secondary">
        Every figure on this site traces back to a published source and a dated snapshot.
        This page is the audit trail: the sources, what the pipeline did to them, what it
        threw away and why, and where the data is weakest. Nothing here is derived from a
        model or filled in by estimate unless it is labelled as one.
      </p>

      {/* ---- provenance band: the four facts that identify any figure on the site ---- */}
      <section className="card mt-4 grid gap-px overflow-hidden bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          icon={<Landmark className="h-3.5 w-3.5" aria-hidden />}
          label="Primary source"
          value={meta.sources?.[0]?.name ?? "unbuilt"}
          hint={meta.sources?.[0]?.license ?? ""}
        />
        <Fact
          icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
          label="Snapshot vintage"
          value={meta.vintage}
          hint="sources revise figures, so vintage is part of a number's identity"
        />
        <Fact
          icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
          label="Built"
          value={builtAt ?? "-"}
          hint="this dataset was published by the pipeline at this time"
        />
        <Fact
          icon={<Ruler className="h-3.5 w-3.5" aria-hidden />}
          label="Detail year"
          value={String(meta.latest_year)}
          hint="the year sector and partner detail is drawn from"
        />
      </section>

      {/* ---- sources ---- */}
      <Section title="The sources themselves" icon={<Landmark className="h-3 w-3" aria-hidden />}>
        <div className="grid gap-3 md:grid-cols-2">
          {meta.sources?.map((source) => (
            <a
              key={source.name}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="card group flex flex-col gap-2 p-4 transition-colors hover:bg-raised"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{source.name}</span>
                <ExternalLink
                  className="h-3.5 w-3.5 shrink-0 text-ink-muted group-hover:text-series-1"
                  aria-hidden
                />
              </div>
              {source.datasets && (
                <ul className="flex flex-wrap gap-1.5">
                  {source.datasets.map((d) => (
                    <li
                      key={d}
                      className="rounded-md bg-raised px-1.5 py-0.5 text-2xs text-ink-secondary"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-auto text-2xs text-ink-muted">
                Licensed {source.license} · {source.url.replace(/^https?:\/\//, "")}
              </p>
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          No trade figure on this site comes from anywhere else. Nothing is scraped,
          nothing is estimated to fill a hole, and no figure is averaged with another
          source to smooth a disagreement - where two published numbers conflict, both are
          shown and the gap is flagged.
        </p>
      </Section>

      {/* ---- pipeline as a path ---- */}
      <Section
        title="From the source API to this screen"
        icon={<ArrowRight className="h-3 w-3" aria-hidden />}
      >
        <ol className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {PIPELINE.map((step, i) => (
            <li key={step.label} className="card relative flex flex-col gap-2 p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-series-1/15 text-series-1">
                  {step.icon}
                </span>
                <span className="text-sm font-semibold">
                  <span className="tabular mr-1 text-2xs text-ink-muted">{i + 1}</span>
                  {step.label}
                </span>
              </div>
              <p className="text-2xs leading-relaxed text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---- what the build produced ---- */}
      <Section title="What this build produced" icon={<Boxes className="h-3 w-3" aria-hidden />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(STAT_LABELS)
            .filter(([key]) => typeof stats[key] === "number")
            .map(([key, spec]) => (
              <div key={key} className="card px-4 py-3">
                <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  {spec.icon}
                  {spec.label}
                </div>
                <div className="tabular mt-1.5 text-xl font-semibold leading-none">
                  {(stats[key] as number).toLocaleString("en-US")}
                </div>
                <div className="mt-1.5 text-2xs leading-snug text-ink-muted">{spec.hint}</div>
              </div>
            ))}
        </div>

        {Object.keys(droppedCodes).length > 0 && (
          <div className="card mt-3 p-4">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Most-dropped partner codes
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              These are not countries. They are aggregates and territories that appear as
              partner rows in the source and would double-count if summed. Counting the
              drops is not bookkeeping for its own sake - an unexpected code in this list
              is how a bug gets caught.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(droppedCodes)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => (
                  <li
                    key={code}
                    className="tabular rounded-md border border-hairline px-2 py-1 text-2xs text-ink-secondary"
                  >
                    {code} <span className="text-ink-muted">{count.toLocaleString("en-US")}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ---- units ---- */}
      <Section title="Units" icon={<Ruler className="h-3 w-3" aria-hidden />}>
        <dl className="card divide-y divide-hairline">
          {Object.entries(meta.units ?? {}).map(([key, value]) => (
            <div key={key} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
              <dt className="w-40 shrink-0 text-xs font-medium text-ink-secondary">
                {key.replace(/_/g, " ")}
              </dt>
              <dd className="flex-1 text-xs text-ink-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ---- weaknesses ---- */}
      <Section
        title="Where the data is weakest"
        icon={<TriangleAlert className="h-3 w-3" aria-hidden />}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Known limitations
            </h3>
            <ul className="mt-2.5 space-y-2">
              {meta.caveats?.map((caveat) => (
                <li
                  key={caveat}
                  className="flex gap-2 text-xs leading-relaxed text-ink-secondary"
                >
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted"
                    aria-hidden
                  />
                  {caveat}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Where the source contradicts itself
            </h3>
            {meta.reconciliation_warnings && meta.reconciliation_warnings.length > 0 ? (
              <>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  For these country-flow combinations the source&apos;s own sector-level
                  and country-level aggregations disagree. Both figures are published as
                  reported rather than adjusted, and the affected dashboards carry a
                  visible warning.
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {meta.reconciliation_warnings.map((warning) => (
                    <li
                      key={warning}
                      className="tabular rounded-md border border-hairline px-2.5 py-1.5 text-2xs leading-relaxed text-ink-secondary"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-xs text-ink-muted">
                No sector-versus-total disagreements were recorded in this build.
              </p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <Warn>
            Mirror flows disagree as a matter of course: what one country reports exporting
            to another routinely differs by 10% or more from what the partner reports
            importing. That gap is data, not error, and it is never averaged away here -
            corridor pages show both sides and flag the difference.
          </Warn>
        </div>
      </Section>

      {/* ---- editorial decisions that affect what you see ---- */}
      <Section
        title="Decisions that shape what you see"
        icon={<Globe2 className="h-3 w-3" aria-hidden />}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <article className="card p-4">
            <h3 className="text-sm font-semibold">Map boundaries</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
              Country outlines come from Natural Earth, which publishes several{" "}
              <em>point-of-view</em> editions of the same boundaries. This site uses the{" "}
              <strong>India point-of-view</strong> edition: Jammu &amp; Kashmir is drawn in
              full as Indian territory, including Gilgit-Baltistan
              (Pakistan-administered Kashmir) and Aksai Chin.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
              Stated plainly, because a map cannot state it itself: both areas are claimed
              by India and administered in practice by Pakistan and China respectively.
              Natural Earth publishes point-of-view editions precisely because no single
              rendering of these borders is accepted by every party, and every major
              mapping provider varies the depiction by audience. Which edition a product
              ships is an audience decision, not a factual claim about who administers the
              ground.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Boundaries affect only what is drawn. No trade figure on this site is
              allocated by geography - every number is attributed to the reporting country
              exactly as the source publishes it.
            </p>
          </article>

          <article className="card p-4">
            <h3 className="text-sm font-semibold">Product classification</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
              Sectors here are HS <em>section groups</em> - sixteen mutually exclusive
              bands spanning the Harmonized System, not individual HS-6 tariff lines. This
              is deliberate: section groups are stable across HS revisions H0 through H6,
              which avoids the concordance errors that quietly corrupt multi-year product
              trends. The cost is that no HS-6 drill-down is possible from this source.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
              A caution about the source: a single request returns codes from three
              overlapping classification schemes at once - HS section groups, UNCTAD
              stage-of-processing categories, and ad-hoc aggregates - with nothing
              distinguishing them. Summing all of them overstates a country&apos;s exports
              by roughly three times. Only the sixteen HS section groups are retained here,
              and they reconcile with reported country totals to within rounding.
            </p>
          </article>
        </div>
      </Section>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="tabular mt-1.5 text-base font-semibold leading-tight">{value}</div>
      <p className="mt-1 text-2xs leading-snug text-ink-muted">{hint}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-1.5 border-b border-hairline pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
