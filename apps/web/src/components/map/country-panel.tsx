"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  GripHorizontal,
  Layers,
  Lightbulb,
  Scale,
  Trophy,
  X,
} from "lucide-react";
import { flowColors } from "@/lib/palette";
import { CompareBar, CompareLegend } from "@/components/charts/compare-bar";
import { useTheme } from "@/components/theme";
import { growth, usd } from "@/lib/format";
import { CountryFlag } from "@/components/country-flag";
import type { CountryDetail, PartnerValue } from "./types";

const PANEL_W = 340;
const MARGIN = 12;
const HEADER_H = 56;
const FOOTER_H = 72;

/**
 * Floating, draggable country panel.
 *
 * Deliberately NOT docked to an edge. Docking it would cover a fixed slice of the map,
 * and the slice you want to see is often exactly the one the panel is sitting on -
 * selecting Japan while the panel covers the Pacific, for instance. Floating lets the
 * reader move it out of their own way.
 *
 * Position is component state rather than a URL param: where someone dragged a panel is a
 * per-view convenience, not something worth putting in a shareable link.
 */
export function CountryPanel({
  detail,
  countryNames,
  countryIso2,
  year,
  onClose,
}: {
  detail: CountryDetail;
  countryNames: Record<string, string>;
  countryIso2: Record<string, string | null>;
  year: number;
  onClose: () => void;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Open near the left edge, below the header. Set once on mount so a re-render (or a
  // new country) never yanks a panel the reader has already moved.
  useEffect(() => {
    if (pos) return;
    setPos({ x: MARGIN + 4, y: HEADER_H + MARGIN + 4 });
  }, [pos]);

  /**
   * Keep the panel inside the map area.
   *
   * The lower bound is computed from the panel's real height so it can never be dragged
   * down over the year scrubber - that bar is the map's primary control and losing it
   * behind a panel would be worse than the panel being slightly constrained.
   */
  const clamp = useCallback((x: number, y: number) => {
    const h = panelRef.current?.offsetHeight ?? 400;
    const maxY = Math.max(HEADER_H + MARGIN, window.innerHeight - FOOTER_H - h - MARGIN);
    return {
      x: Math.max(MARGIN, Math.min(x, window.innerWidth - PANEL_W - MARGIN)),
      y: Math.max(HEADER_H + MARGIN, Math.min(y, maxY)),
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!pos) return;
      drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
    },
    [clamp],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Keep the panel on screen when the window shrinks.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  if (!pos) return null;

  const balance =
    detail.exports !== null && detail.imports !== null ? detail.exports - detail.imports : null;
  const exportGrowth = growth(detail.exports, detail.prevExports);
  const lens = detail.sectorFilter;
  // One scale across every sector row and both sides, so bar length is comparable.
  const sectorMax = Math.max(
    ...detail.sectors.map((s) => Math.max(s.exports ?? 0, s.imports ?? 0)),
    1,
  );

  return (
    <div
      ref={panelRef}
      className="floating pointer-events-auto fixed z-30 flex max-h-[calc(100vh-11rem)] flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: PANEL_W }}
      role="dialog"
      aria-label={`${detail.name} trade summary`}
    >
      {/* ---- drag handle ---- */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-grab items-center gap-2 border-b border-hairline bg-raised/60 px-3 py-2 active:cursor-grabbing"
      >
        <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        <CountryFlag iso2={detail.iso2} name={detail.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight text-ink">
            {detail.name}
          </div>
          <div className="truncate text-2xs text-ink-muted">
            {detail.region ?? detail.iso3} · {year}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Under a sector lens every figure below narrows to it, so the panel says so
            once at the top rather than qualifying each number. */}
        {lens && (
          <div className="flex items-center gap-1.5 border-b border-hairline bg-series-1/10 px-3 py-1.5 text-2xs text-ink-secondary">
            <Layers className="h-3 w-3 shrink-0 text-series-1" aria-hidden />
            <span className="truncate">
              Showing <span className="font-medium text-ink">{lens.name}</span> only
            </span>
          </div>
        )}

        {/* ---- headline figures ---- */}
        <div className="grid grid-cols-2 gap-px bg-hairline">
          <Metric
            icon={<ArrowUpRight className="h-3 w-3" aria-hidden />}
            label={lens ? `Exports · ${lens.name}` : "Exports"}
            value={usd(detail.exports)}
            color={colors.export}
            delta={exportGrowth}
          />
          <Metric
            icon={<ArrowDownLeft className="h-3 w-3" aria-hidden />}
            label={lens ? `Imports · ${lens.name}` : "Imports"}
            value={usd(detail.imports)}
            color={colors.import}
            delta={growth(detail.imports, detail.prevImports)}
          />
        </div>

        <div className="flex items-center gap-3 border-b border-hairline px-3 py-2 text-2xs">
          <span className="flex items-center gap-1 text-ink-muted">
            <Scale className="h-3 w-3" aria-hidden />
            {lens ? `Balance · ${lens.name}` : "Balance"}
          </span>
          <span
            className={`tabular font-medium ${
              balance === null ? "text-ink-muted" : balance >= 0 ? "text-delta-up" : "text-delta-down"
            }`}
          >
            {usd(balance)}
          </span>
          {detail.rank && (
            <span className="ml-auto flex items-center gap-1 text-ink-muted">
              <Trophy className="h-3 w-3" aria-hidden />
              World rank <span className="tabular text-ink-secondary">#{detail.rank}</span>
            </span>
          )}
        </div>

        {/* ---- sector mix, both directions on one centre line ---- */}
        {detail.sectors.length > 0 && (
          <Section title={lens ? "Trade by sector · full mix" : "Trade by sector"}>
            <CompareLegend
              className="mb-2"
              exportLabel={`${detail.name} sells`}
              importLabel={`${detail.name} buys`}
            />
            <ul className="space-y-2">
              {detail.sectors.map((s) => (
                // The full mix stays visible under a lens - it is the context that makes
                // the filtered figure mean something - but the chosen sector is marked so
                // the two readings cannot be confused for each other.
                <li
                  key={s.code}
                  className={
                    lens?.code === s.code ? "-mx-1.5 rounded-md bg-series-1/10 px-1.5 py-1" : ""
                  }
                >
                  <div className="flex items-baseline justify-between gap-2 text-2xs">
                    <span className="min-w-0 flex-1 truncate text-ink-secondary">
                      {lens?.code === s.code && (
                        <Layers
                          className="mr-1 inline h-2.5 w-2.5 shrink-0 text-series-1"
                          aria-hidden
                        />
                      )}
                      {s.name}
                    </span>
                    {s.net !== null && (
                      <span
                        className="tabular shrink-0"
                        style={{ color: s.net >= 0 ? colors.export : colors.import }}
                      >
                        {s.net >= 0 ? "+" : ""}
                        {usd(s.net, 0)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <CompareBar
                      exportValue={s.exports}
                      importValue={s.imports}
                      scale={sectorMax}
                      showValues={false}
                      height={5}
                      exportLabel={`${detail.name} exports of ${s.name.toLowerCase()}`}
                      importLabel={`${detail.name} imports of ${s.name.toLowerCase()}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ---- partners, matching the map colors ---- */}
        <Section title="Where it trades">
          <div className="space-y-2.5">
            <PartnerBlock
              heading={`${detail.name} sells to`}
              icon={<ArrowUpRight className="h-3 w-3" aria-hidden />}
              color={colors.export}
              rows={detail.topExports}
              total={detail.exportPartnerCount}
              iso={detail.iso3}
              names={countryNames}
              iso2={countryIso2}
              direction="out"
              reporterName={detail.name}
            />
            <PartnerBlock
              heading={`${detail.name} buys from`}
              icon={<ArrowDownLeft className="h-3 w-3" aria-hidden />}
              color={colors.import}
              rows={detail.topImports}
              total={detail.importPartnerCount}
              iso={detail.iso3}
              names={countryNames}
              iso2={countryIso2}
              direction="in"
              reporterName={detail.name}
            />
          </div>
        </Section>
      </div>

      {/* ---- actions ---- */}
      <div className="flex items-center gap-2 border-t border-hairline bg-raised/40 p-2">
        <Link
          href={`/country/${detail.iso3}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-series-1 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Detailed view
        </Link>
        <Link
          href={`/opportunities?origin=${detail.iso3}`}
          title="Export opportunities"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <Lightbulb className="h-3.5 w-3.5" aria-hidden />
          Opportunities
        </Link>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  color,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  delta: number | null;
}) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wide" style={{ color }}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold leading-none text-ink">{value}</div>
      {delta !== null && (
        // Deliberately neutral ink. Rising imports are not "bad" and rising exports are
        // not "good" - the arrow carries the direction, and colour would imply a verdict.
        <div className="mt-1 text-2xs text-ink-muted">
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% yr/yr
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline px-3 py-2.5 last:border-b-0">
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PartnerBlock({
  heading,
  icon,
  color,
  rows,
  total,
  iso,
  names,
  iso2,
  direction,
  reporterName,
}: {
  heading: string;
  icon: React.ReactNode;
  color: string;
  rows: PartnerValue[];
  total: number;
  iso: string;
  names: Record<string, string>;
  iso2: Record<string, string | null>;
  direction: "out" | "in";
  /** Named in each row's tooltip - a partner list has two countries in it, so "exports"
   *  on its own never says whose. */
  reporterName: string;
}) {
  if (!rows.length) {
    return (
      <div>
        <div className="mb-1 flex items-center gap-1 text-2xs font-medium" style={{ color }}>
          {icon}
          <span className="truncate">{heading}</span>
        </div>
        <p className="text-2xs text-ink-muted">Not reported.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-2xs font-medium" style={{ color }}>
        {icon}
        <span className="truncate">{heading}</span>
        <span className="ml-auto shrink-0 font-normal text-ink-muted">{total} partners</span>
      </div>
      <ul>
        {rows.slice(0, 4).map((row) => (
          <li key={row.iso}>
            <Link
              href={
                direction === "out"
                  ? `/corridor/${iso}/${row.iso}`
                  : `/corridor/${row.iso}/${iso}`
              }
              title={
                (direction === "out"
                  ? `${reporterName} exports ${usd(row.v)} to ${names[row.iso] ?? row.iso}`
                  : `${names[row.iso] ?? row.iso} exports ${usd(row.v)} to ${reporterName}`) +
                (row.src === "importer"
                  ? ` - ${names[row.iso] ?? row.iso} publishes no export figures, so this is ${reporterName}'s own customs record of the same goods`
                  : "")
              }
              className="flex items-center gap-1.5 rounded-md px-1 py-1 text-2xs transition-colors hover:bg-raised"
            >
              <CountryFlag
                iso2={iso2[row.iso] ?? null}
                name={names[row.iso] ?? row.iso}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-ink-secondary">
                {names[row.iso] ?? row.iso}
              </span>
              {row.src === "importer" && (
                <span
                  className="shrink-0 rounded-sm border border-hairline px-1 text-[9px] uppercase leading-[1.4] text-ink-muted"
                  aria-label="figure from the buyer's own customs record"
                >
                  buyer
                </span>
              )}
              <span className="tabular shrink-0 text-ink">{usd(row.v, 0)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
