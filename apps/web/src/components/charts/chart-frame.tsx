"use client";

import { useState } from "react";
import { Table2, BarChart3 } from "lucide-react";

export interface TableColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

/**
 * Every chart in this app is wrapped in one of these.
 *
 * The table toggle is not a nicety - it is the accessibility requirement (identity
 * never carried by color alone, a table view always exists) and it is what analysts
 * actually want, because they copy the numbers out.
 */
export function ChartFrame<T>({
  title,
  subtitle,
  rows,
  columns,
  children,
  legend,
  footnote,
}: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: TableColumn<T>[];
  children: React.ReactNode;
  legend?: { color: string; label: string }[];
  footnote?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <section className="card flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-secondary">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 rounded-md border border-hairline">
          <button
            onClick={() => setView("chart")}
            aria-pressed={view === "chart"}
            aria-label="Chart view"
            className={`rounded-l-md px-2 py-1 ${view === "chart" ? "bg-raised text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            aria-label="Table view"
            className={`rounded-r-md border-l border-hairline px-2 py-1 ${view === "table" ? "bg-raised text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Legend is always present for 2+ series, so identity is never color-alone. */}
      {legend && legend.length > 1 && view === "chart" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-xs text-ink-secondary">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: item.color }}
                aria-hidden
              />
              {item.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 p-3">
        {view === "chart" ? (
          children
        ) : (
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-hairline text-ink-muted">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={`px-2 py-1.5 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-hairline/50 last:border-0">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-2 py-1.5 ${col.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {footnote && (
        <p className="border-t border-hairline px-4 py-2 text-2xs leading-relaxed text-ink-muted">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** Shared Recharts tooltip shell - dark surface, hairline ring, tabular figures. */
export function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tabular rounded-md border border-hairline bg-surface px-2.5 py-2 text-xs shadow-xl">
      {children}
    </div>
  );
}
