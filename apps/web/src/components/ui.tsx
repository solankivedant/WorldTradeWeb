import Link from "next/link";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import type { Provenance } from "@/lib/types";

export function Card({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-hairline">
          <h2 className="card-title flex items-center gap-1.5">
            {icon}
            {title}
          </h2>
          {action && <div className="px-3">{action}</div>}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </section>
  );
}

/**
 * Headline stat. Uses proportional figures deliberately - tabular figures are for
 * columns that must align vertically, not for standalone hero numbers.
 */
export function Stat({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  icon,
  toneValue,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
  icon?: React.ReactNode;
  /**
   * Colors the headline VALUE itself by sign, independent of `delta` (which colors a
   * period-over-period badge). For a raw signed figure like a trade balance there is no
   * "vs last period" percentage to show, but the sign is still the useful signal. Zero and
   * null both render uncolored - per this repo's zero-vs-null rule, zero must never look
   * like either a surplus or a deficit.
   */
  toneValue?: number | null;
}) {
  const positive = delta !== null && delta !== undefined && delta > 0;
  const negative = delta !== null && delta !== undefined && delta < 0;
  const valueTone =
    toneValue === null || toneValue === undefined || toneValue === 0
      ? ""
      : toneValue > 0
        ? " text-delta-up"
        : " text-delta-down";
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold leading-none${valueTone}`}>{value}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5 text-xs">
        {delta !== null && delta !== undefined ? (
          <span className={positive ? "text-delta-up" : negative ? "text-delta-down" : "text-ink-muted"}>
            {positive ? "▲" : negative ? "▼" : "-"} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        <span className="text-ink-muted">{deltaLabel ?? hint ?? ""}</span>
      </div>
    </div>
  );
}

/** Distinct treatment from zero - see .claude/rules/data-integrity.md. */
export function NoData({ what = "Not reported", why }: { what?: string; why?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1.5 p-6 text-center">
      <div className="no-data-hatch h-8 w-16 rounded border border-hairline" aria-hidden />
      <p className="text-sm text-ink-secondary">{what}</p>
      <p className="max-w-xs text-xs text-ink-muted">
        {why ?? "This country does not report this figure to the source. Absent data is not zero."}
      </p>
    </div>
  );
}

export function Empty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1.5 p-8 text-center">
      <Info className="h-4 w-4 text-ink-muted" aria-hidden />
      <p className="text-sm text-ink-secondary">{message}</p>
      {hint && <p className="max-w-sm text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Every view carries this. Source and vintage are never more than one click away. */
export function ProvenanceBar({ meta, extra }: { meta: Provenance; extra?: string }) {
  return (
    <details className="group border-t border-hairline bg-plane/60 px-4 py-2 text-2xs text-ink-muted">
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <Info className="h-3 w-3" aria-hidden />
        <span>
          {meta.source} · vintage {meta.vintage}
          {extra ? ` · ${extra}` : ""}
        </span>
        <span className="ml-auto text-ink-muted group-open:hidden">caveats ▾</span>
      </summary>
      <ul className="mt-2 space-y-1 pl-4">
        {meta.caveats.map((caveat) => (
          <li key={caveat} className="list-disc leading-relaxed">
            {caveat}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-xs text-ink-secondary">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" aria-hidden />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * A list of caveats - short, one-per-line qualifications a reader should not miss but
 * should not have to read as a paragraph either. `items` takes nodes rather than plain
 * strings because a caveat sometimes needs an inline link (e.g. "see methodology").
 */
export function CaveatList({ items, dense }: { items: React.ReactNode[]; dense?: boolean }) {
  return (
    <ul className={dense ? "space-y-1.5" : "space-y-2.5"}>
      {items.map((item, i) => (
        <li
          key={i}
          className={`flex gap-2 leading-relaxed text-ink-secondary ${dense ? "text-2xs" : "text-xs"}`}
        >
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Icon + label + value + hint tile. Several side by side, wrapped in `FactGrid`. */
export function Fact({
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

/** Convenience grid around several `Fact` tiles - saves hand-writing the grid classes. */
export function FactGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className ?? ""}`}>{children}</div>
  );
}

/** Estimated-value marker. Estimates must never be presented as measured figures. */
export function EstimateTag() {
  return (
    <span
      className="ml-1 rounded border border-hairline px-1 py-px text-[9px] uppercase tracking-wide text-ink-muted"
      title="Estimated, not directly reported. See methodology."
    >
      est
    </span>
  );
}

export function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-muted">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
          {item.href ? (
            <Link href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink-secondary">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
