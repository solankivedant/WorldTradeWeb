"use client";

import { Percent } from "lucide-react";
import { useTheme } from "@/components/theme";
import { tariffBandFor } from "@/lib/palette";
import { pct } from "@/lib/format";

/**
 * One rate, one colour - see the tariff-palette rule in CLAUDE.md. Every tariff display in
 * the app reads its band edges, labels and ink from `tariffBandFor`/`TARIFF_BAND_META`
 * rather than restating them, so a rate means the same colour wherever it is shown.
 *
 * Extracted from the connection panel's original private `TariffCell`. It reads the
 * resolved theme itself (`useTheme`) rather than taking it as a prop, which is what makes
 * this a leaf client component - callers, including plain Server Components, only ever
 * hand it a label and a rate.
 */
export function TariffRateCell({ label, rate }: { label: string; rate: number | null }) {
  const { resolved } = useTheme();
  const band = rate === null ? null : tariffBandFor(rate, resolved);
  return (
    <div className="bg-surface px-3 py-2">
      <div className="flex items-center gap-1 truncate text-2xs text-ink-muted">
        <Percent className="h-2.5 w-2.5 shrink-0" aria-hidden />
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {band ? (
          <>
            <span
              className="tabular rounded px-1.5 py-0.5 text-2xs font-semibold"
              style={{ background: band.color, color: band.ink }}
            >
              {pct(rate as number, 1)}
            </span>
            <span className="truncate text-2xs text-ink-muted">{band.label}</span>
          </>
        ) : (
          <span className="text-2xs text-ink-muted">not published</span>
        )}
      </div>
    </div>
  );
}
