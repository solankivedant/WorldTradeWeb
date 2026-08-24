"use client";

import { ordinalRamp } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import type { ScoreComponent } from "@/lib/types";

/**
 * A score, drawn as the five parts it is actually made of.
 *
 * The card used to carry a plain progress meter: one bar, one hue, filled to the score.
 * That answers "how big" and nothing else, so two cards both scoring 61 looked identical
 * when one was a huge market the origin cannot supply and the other a small market it
 * dominates - which is the whole distinction a reader is trying to draw. The parts are
 * already computed and already shown in the expandable breakdown; putting them on the
 * spine means the composition can be compared ACROSS cards at a glance, which a
 * per-card disclosure can never do.
 *
 * Composition of one total, so a single stacked bar is the right form - this is not five
 * categories being compared with each other, it is one number taken apart. The remainder
 * up to 100 stays visible as a recessive track, because "61" only means something against
 * the 100 it could have been.
 *
 * Colour is ORDINAL, not categorical: the components have a permanent rank (their weight
 * caps, 30 down to 8), and the card already spends a categorical hue on its sector. One
 * hue at five monotone steps, validated on the card surface - see `ordinalRamp`.
 *
 * Order is the engine's order and never sorted by value, so a given band sits in the same
 * place on every card in the grid. A stack that reorders itself per card is unreadable in
 * aggregate.
 */

/**
 * 2px of card between segments, per the mark spec - adjacent fills need a spacer.
 *
 * Drawn as a border rather than a margin. Borders sit INSIDE the declared width under
 * `border-box`, so the filled run still measures exactly `score` percent of the track; a
 * margin would push four spacers on top of it and quietly draw every score three points
 * longer than it is.
 */
const GAP = 2;

export function ScoreSpine({
  components,
  score,
  height = 10,
}: {
  components: ScoreComponent[];
  score: number;
  height?: number;
}) {
  const { resolved } = useTheme();
  const ramp = ordinalRamp(resolved, components.length);

  return (
    <div
      className="flex w-full items-stretch overflow-hidden rounded-full bg-hairline/70"
      style={{ height }}
      role="img"
      aria-label={`Score ${score} of 100: ${components
        .map((c) => `${c.label} ${c.points} of ${c.max}`)
        .join(", ")}.`}
    >
      {components.map((component, i) => (
        <span
          key={component.label}
          title={`${component.label}: ${component.points} of ${component.max} points. ${component.reason}`}
          style={{
            width: `${component.points}%`,
            background: ramp[i],
            borderRight:
              i === components.length - 1 ? undefined : `${GAP}px solid rgb(var(--surface))`,
          }}
          // A zero-point component still occupies its gap, so the bands stay in the same
          // rhythm across cards instead of sliding whenever one scores nothing.
          className="min-w-0 shrink-0 first:rounded-l-full"
        />
      ))}
    </div>
  );
}

/**
 * The spine's key, shown ONCE above a grid of cards rather than on every card.
 *
 * Five labels repeated across sixty cards is five hundred words of chrome. One legend
 * above the grid does the same job, and each segment keeps its own tooltip for the reader
 * who arrives at a card mid-scroll.
 */
export function ScoreSpineLegend({
  components,
  className = "",
}: {
  /** Label and weight cap of each component, in engine order. */
  components: { label: string; max: number }[];
  className?: string;
}) {
  const { resolved } = useTheme();
  const ramp = ordinalRamp(resolved, components.length);

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`}>
      <span className="text-2xs font-medium text-ink-secondary">Score is built from</span>
      {components.map((component, i) => (
        <span key={component.label} className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: ramp[i] }}
            aria-hidden
          />
          {component.label}
          <span className="tabular text-ink-muted/80">{component.max}</span>
        </span>
      ))}
    </div>
  );
}
