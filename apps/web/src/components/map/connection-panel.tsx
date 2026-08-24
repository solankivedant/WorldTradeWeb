"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ExternalLink,
  Layers,
  Loader2,
  Percent,
  Scale,
  X,
} from "lucide-react";
import { flowColors, tariffBandFor } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { CompareBar } from "@/components/charts/compare-bar";
import { CountryFlag } from "@/components/country-flag";
import { TopSectors } from "@/components/top-sectors";
import { SectorIcon } from "@/components/sector-icon";
import { pct, usd } from "@/lib/format";
import type { ConnectionDetail } from "./types";

/**
 * The connection panel: one corridor, opened by clicking its arc on the map.
 *
 * DOCKED to the right edge, unlike the country panel which floats. The two are open at
 * the same time and have to coexist: the country panel opens top-left and is draggable,
 * so a second floating panel would land on top of it and both would need moving before
 * either could be read. Docking this one also means the arc the reader just clicked -
 * which radiates from the selected country, usually near the centre - stays visible.
 *
 * It fetches its own corridor rather than receiving it with the map payload. A map
 * payload carrying every corridor's sector split for six arcs would be several hundred
 * kilobytes of data the reader mostly never opens, refetched on every year or metric
 * change.
 */
export function ConnectionPanel({
  a,
  b,
  year,
  sector,
  onClose,
}: {
  a: string;
  b: string;
  year: number;
  /** The map's active sector lens, highlighted in the split so the panel matches the arcs. */
  sector: string;
  onClose: () => void;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const [detail, setDetail] = useState<ConnectionDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError(false);
    const params = new URLSearchParams({ a, b, year: String(year) });
    if (sector) params.set("sector", sector);
    fetch(`/api/corridor?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => setDetail(json.data))
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [a, b, year, sector]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shell =
    "absolute right-0 top-0 bottom-0 z-30 flex w-[380px] max-w-[92vw] flex-col border-l border-hairline bg-surface shadow-2xl";

  if (error) {
    return (
      <aside className={shell}>
        <PanelHeader title="Connection" subtitle={`${a} - ${b}`} onClose={onClose} />
        <p className="p-6 text-sm text-ink-muted">
          Could not load this corridor. Neither country may report bilateral trade with
          the other - absent is not zero, so nothing is shown rather than a guess.
        </p>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className={shell}>
        <PanelHeader title="Connection" subtitle={`${a} - ${b}`} onClose={onClose} />
        <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Loading corridor...
        </div>
      </aside>
    );
  }

  const { a: ca, b: cb } = detail;
  // One scale across every sector row AND both directions, so a bar's length means the
  // same thing wherever it appears in the list.
  const sectorMax = Math.max(
    ...detail.sectors.map((s) => Math.max(s.aToB ?? 0, s.bToA ?? 0)),
    detail.other ? Math.max(detail.other.aToB, detail.other.bToA) : 0,
    1,
  );
  const materialGap = detail.mirrorGapPct !== null && Math.abs(detail.mirrorGapPct) >= 10;

  return (
    <aside className={shell} aria-label={`${ca.name} to ${cb.name} trade corridor`}>
      <PanelHeader
        title="Connection"
        subtitle={`Bilateral corridor · ${detail.year}`}
        onClose={onClose}
      />

      {/* ---- who and who ---- */}
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
        <CountryFlag iso2={ca.iso2} name={ca.name} size="md" />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{ca.name}</span>
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        <CountryFlag iso2={cb.iso2} name={cb.name} size="md" />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{cb.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ---- the two directions, each named in full ---- */}
        <div className="grid grid-cols-2 gap-px bg-hairline">
          <Direction
            label={`${ca.name} sells to ${cb.name}`}
            value={detail.aToB}
            share={detail.aShareOfAExports}
            shareOf={ca.name}
            color={colors.export}
            buyerSourced={detail.buyerSourced.aToB}
            seller={ca.name}
            buyer={cb.name}
          />
          <Direction
            label={`${cb.name} sells to ${ca.name}`}
            value={detail.bToA}
            share={detail.bShareOfBExports}
            shareOf={cb.name}
            color={colors.import}
            buyerSourced={detail.buyerSourced.bToA}
            seller={cb.name}
            buyer={ca.name}
          />
        </div>

        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2 text-2xs">
          <span className="flex items-center gap-1 text-ink-muted">
            <Scale className="h-3 w-3" aria-hidden />
            Balance for {ca.iso3}
          </span>
          <span
            className={`tabular font-medium ${
              detail.balanceForA === null
                ? "text-ink-muted"
                : detail.balanceForA >= 0
                  ? "text-delta-up"
                  : "text-delta-down"
            }`}
          >
            {usd(detail.balanceForA)}
          </span>
          {detail.balanceForA !== null && (
            <span className="ml-auto text-ink-muted">
              {detail.balanceForA >= 0 ? "surplus" : "deficit"}
            </span>
          )}
        </div>

        {/* ---- mirror gap: surfaced, never smoothed ---- */}
        {detail.mirrorGapPct !== null && (
          <div
            className={`flex items-start gap-1.5 border-b border-hairline px-3 py-2 text-2xs leading-relaxed ${
              materialGap ? "bg-status-warning/5" : ""
            }`}
          >
            {materialGap && (
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0 text-status-warning"
                aria-hidden
              />
            )}
            <span className="text-ink-secondary">
              {cb.name} reports{" "}
              <span className={`tabular ${materialGap ? "text-status-warning" : "text-ink"}`}>
                {detail.mirrorGapPct > 0 ? "+" : ""}
                {detail.mirrorGapPct.toFixed(1)}%
              </span>{" "}
              {detail.mirrorGapPct > 0 ? "more" : "less"} coming in than {ca.name} reports
              going out. Both are shown; neither is corrected against the other.
            </span>
          </div>
        )}

        {/* ---- tariffs both ways ---- */}
        <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline">
          <TariffCell
            label={`${cb.iso3} charges ${ca.iso3}`}
            rate={detail.tariffBOnA}
            mode={resolved}
          />
          <TariffCell
            label={`${ca.iso3} charges ${cb.iso3}`}
            rate={detail.tariffAOnB}
            mode={resolved}
          />
        </div>

        {/* ---- what actually moves: the sector split ---- */}
        <div className="px-3 py-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              What moves in this corridor
            </h3>
          </div>

          {/* The answer first, the sixteen-row split underneath it. */}
          {(detail.topAToB || detail.topBToA) && (
            <div className="mb-2.5">
              <TopSectors
                exports={detail.topAToB}
                imports={detail.topBToA}
                reporterName={ca.name}
                variant="panel"
                exportHeading={`${ca.name} sells ${cb.name} most`}
                importHeading={`${cb.name} sells ${ca.name} most`}
                shareOf={{
                  exports: "this direction",
                  imports: "this direction",
                }}
                linkSectors={false}
              />
            </div>
          )}

          {!detail.hasSectorDetail || detail.sectors.length === 0 ? (
            <p className="text-2xs leading-relaxed text-ink-muted">
              No sector breakdown is published for this corridor. That is absent data, not
              zero trade.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-2xs">
                <span className="flex min-w-0 items-center gap-1" style={{ color: colors.export }}>
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: colors.export }}
                    aria-hidden
                  />
                  <span className="truncate text-ink-secondary">{ca.name} sells</span>
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-ink-secondary">{cb.name} sells</span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: colors.import }}
                    aria-hidden
                  />
                </span>
              </div>

              <ul className="space-y-2">
                {detail.sectors.map((row) => {
                  const lit = detail.focusSector === row.code;
                  return (
                    <li
                      key={row.code}
                      className={lit ? "-mx-1.5 rounded-md bg-series-1/10 px-1.5 py-1" : ""}
                    >
                      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-2xs">
                        <Link
                          href={`/product/${encodeURIComponent(row.code)}`}
                          className="flex min-w-0 items-center gap-1.5 truncate text-ink-secondary hover:text-ink hover:underline"
                        >
                          {lit && (
                            <Layers className="h-2.5 w-2.5 shrink-0 text-series-1" aria-hidden />
                          )}
                          <SectorIcon code={row.code} className="h-3 w-3" />
                          <span className="truncate">{row.name}</span>
                        </Link>
                        {row.net !== null && (
                          <span
                            className="tabular shrink-0"
                            style={{ color: row.net >= 0 ? colors.export : colors.import }}
                            title={
                              row.net >= 0
                                ? `${ca.name} sells ${usd(row.net)} more of this than it buys`
                                : `${ca.name} buys ${usd(Math.abs(row.net))} more of this than it sells`
                            }
                          >
                            {row.net >= 0 ? "+" : ""}
                            {usd(row.net, 0)}
                          </span>
                        )}
                      </div>
                      <CompareBar
                        exportValue={row.aToB}
                        importValue={row.bToA}
                        scale={sectorMax}
                        showValues={false}
                        height={6}
                        exportLabel={`${ca.name} sells ${row.name.toLowerCase()} to ${cb.name}`}
                        importLabel={`${cb.name} sells ${row.name.toLowerCase()} to ${ca.name}`}
                      />
                    </li>
                  );
                })}

                {detail.other && (
                  <li>
                    <div className="mb-0.5 flex items-baseline justify-between gap-2 text-2xs text-ink-muted">
                      <span className="truncate">
                        {detail.other.count} smaller sector
                        {detail.other.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <CompareBar
                      exportValue={detail.other.aToB || null}
                      importValue={detail.other.bToA || null}
                      scale={sectorMax}
                      showValues={false}
                      height={6}
                      exportLabel={`${ca.name} sells, all remaining sectors`}
                      importLabel={`${cb.name} sells, all remaining sectors`}
                    />
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-hairline p-2.5">
        <Link
          href={`/corridor/${ca.iso3}/${cb.iso3}`}
          className="flex items-center justify-center gap-1.5 rounded-md bg-series-1 px-2 py-2 text-2xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Full corridor
        </Link>
        <Link
          href={`/explore?a=${ca.iso3}&b=${cb.iso3}`}
          className="flex items-center justify-center gap-1.5 rounded-md border border-hairline px-2 py-2 text-2xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <Layers className="h-3 w-3" aria-hidden />
          Compare
        </Link>
      </div>
    </aside>
  );
}

function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline bg-raised/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          {title}
        </div>
        <div className="truncate text-2xs text-ink-muted">{subtitle}</div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close connection panel"
        className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function Direction({
  label,
  value,
  share,
  shareOf,
  color,
  buyerSourced,
  seller,
  buyer,
}: {
  label: string;
  value: number | null;
  share: number | null;
  shareOf: string;
  color: string;
  /** True when the seller publishes nothing and this is the buyer's own record. */
  buyerSourced: boolean;
  seller: string;
  buyer: string;
}) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="truncate text-2xs text-ink-muted" title={label}>
        {label}
      </div>
      <div className="tabular mt-1 flex items-center gap-1.5 text-lg font-semibold leading-none">
        <span style={{ color }}>{usd(value)}</span>
        {buyerSourced && (
          <span
            className="rounded-sm border border-hairline px-1 text-[9px] font-medium uppercase leading-[1.4] text-ink-muted"
            title={`${seller} publishes no export figures. This is ${buyer}'s own customs record of the same goods.`}
          >
            buyer
          </span>
        )}
      </div>
      <div className="mt-1 text-2xs leading-snug text-ink-muted">
        {buyerSourced
          ? `${seller} files no export report`
          : share === null
            ? "share not reported"
            : `${pct(share, 1)} of all ${shareOf} exports`}
      </div>
    </div>
  );
}

function TariffCell({
  label,
  rate,
  mode,
}: {
  label: string;
  rate: number | null;
  mode: "light" | "dark";
}) {
  const band = rate === null ? null : tariffBandFor(rate, mode);
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
              {pct(rate, 1)}
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
