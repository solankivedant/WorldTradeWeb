"use client";

import type { LucideIcon } from "lucide-react";

/**
 * A segmented control - the header's metric switch, generalised.
 *
 * Used wherever a page has two or three mutually exclusive ways of looking at the SAME
 * result set: cards against a table, one pane of the explorer against another. That is a
 * different job from a filter, which changes what the result set contains, and the two
 * must not look alike - a reader who cannot tell "this changes the data" from "this
 * changes the rendering" ends up afraid to touch either.
 *
 * Every option shows its label AND its icon, never the icon alone, because an icon-only
 * segmented control is a guessing game the first time anybody meets it.
 */

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  Icon?: LucideIcon;
  /** Shown as a title attribute. Static text only - never derived from theme state. */
  hint?: string;
  /** Optional count, e.g. how many rows this pane holds. */
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className = "",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible group name, e.g. "Explorer view". */
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "sm" ? "px-2 py-1 text-2xs" : "px-2.5 py-1.5 text-xs";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div
      role="group"
      aria-label={label}
      // Scrolls rather than stretches its container: three labelled options with counts
      // are wider than a phone, and a control that widens the page pushes every card on
      // it sideways.
      className={`inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-hairline bg-plane p-0.5 ${className}`}
    >
      {options.map(({ id, label: text, Icon, hint, count }) => {
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={on}
            title={hint}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md transition-colors ${pad} ${
              on
                ? "bg-series-1/15 font-medium text-series-1"
                : "text-ink-secondary hover:bg-raised hover:text-ink"
            }`}
          >
            {Icon && <Icon className={`${icon} shrink-0`} aria-hidden />}
            {text}
            {count !== undefined && (
              <span className="tabular text-2xs text-ink-muted">
                {count.toLocaleString("en-US")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
