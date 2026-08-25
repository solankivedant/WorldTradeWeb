"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, CalendarRange, Info, Pause, Play, Scale } from "lucide-react";
import { divergingSteps, flowColors, sequentialSteps } from "@/lib/palette";
import { MapIntroTrigger } from "@/components/map-intro";
import { Segmented } from "@/components/segmented";
import { useTheme } from "@/components/theme";
import type { Provenance } from "@/lib/types";
import type { MapMetric } from "./types";

/**
 * The map's bottom bar: year scrubber on the left, legends on the right.
 *
 * Both live here rather than in a side rail because they describe the map as a whole -
 * putting them under it keeps the full width of the canvas for the data, and puts the
 * time control where the eye already is when reading a timeline.
 */
export function MapFooter({
  year,
  years,
  onYear,
  metric,
  onMetric,
  hasFlows,
  meta,
  reportingCountries,
  onShowGuide,
}: {
  year: number;
  years: number[];
  onYear: (year: number) => void;
  metric: MapMetric;
  /** Below md the header has no room for the metric switch, so it lives here instead. */
  onMetric: (metric: MapMetric) => void;
  hasFlows: boolean;
  meta: Provenance;
  reportingCountries: number;
  /**
   * Reopens the orientation panel. Null until the intro hook has read localStorage - the
   * button must not render on the server, where the stored state is unknowable.
   */
  onShowGuide: (() => void) | null;
}) {
  const { resolved } = useTheme();
  const flow = flowColors(resolved);
  const steps = metric === "balance" ? divergingSteps(resolved) : sequentialSteps(resolved);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const first = years[0];
  const last = years[years.length - 1];

  // Year playback. Stops at the end rather than looping - a timeline that silently
  // restarts makes it easy to misread which year you are looking at.
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      onYear(year >= last ? first : year + 1);
    }, 900);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, year, first, last, onYear]);

  useEffect(() => {
    if (year >= last && playing) setPlaying(false);
  }, [year, last, playing]);

  return (
    // Tagged so the floating country panel can measure it: the bar's height changes with
    // the viewport (the legends wrap, and the metric switch only exists below md), and a
    // panel clamped against a hardcoded height sat over the year scrubber on a phone.
    <div
      data-map-footer
      className="pointer-events-auto border-t border-hairline bg-plane/95 backdrop-blur"
    >
      <div className="flex flex-col gap-3 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:gap-6">
        {/*
          ---- metric switch, narrow viewports only ----
          The header carries this from md up. Below that the header has room for the nav
          and the theme toggle and nothing else, and a map whose only lens control is off
          screen is a map stuck on one meaning.
        */}
        <Segmented
          label="Map metric"
          value={metric}
          onChange={onMetric}
          size="sm"
          className="w-full justify-center md:hidden"
          options={[
            { id: "volume" as MapMetric, label: "Total trade", Icon: ArrowLeftRight },
            { id: "balance" as MapMetric, label: "Balance", Icon: Scale },
          ]}
        />

        {/* ---- year scrubber ---- */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/*
            The guide lives here rather than over the canvas because the canvas has no
            free corner: the country panel opens top-left and drags anywhere, the sector
            lens holds top-right, and the connection panel takes the whole right edge. A
            help affordance that a panel can sit on top of is a help affordance nobody can
            reach at the moment they need it.
          */}
          {onShowGuide && <MapIntroTrigger onShow={onShowGuide} />}
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause year playback" : "Play through years"}
            title={playing ? "Pause" : "Play through years"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-hairline text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>

          <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink">
            <CalendarRange className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
            <span className="tabular">{year}</span>
          </div>

          <div className="relative min-w-0 flex-1">
            <input
              type="range"
              min={first}
              max={last}
              step={1}
              value={year}
              onChange={(e) => {
                setPlaying(false);
                onYear(Number(e.target.value));
              }}
              aria-label="Year"
              className="w-full accent-series-1"
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
              <span className="tabular">{first}</span>
              <span className="tabular">{last}</span>
            </div>
          </div>
        </div>

        {/* ---- legends ---- */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-medium text-ink-muted">
              {metric === "balance" ? "Balance" : "Total trade"}
            </span>
            <span className="flex h-2 w-24 overflow-hidden rounded-full">
              {steps.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </span>
            <span className="text-[10px] text-ink-muted">
              {metric === "balance" ? "deficit to surplus" : "low to high"}
            </span>
            <span className="text-[10px] text-ink-muted">
              ({metric === "balance" ? "exports - imports" : "exports + imports"})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="no-data-hatch h-2.5 w-5 rounded-sm border border-hairline" aria-hidden />
            <span className="text-[10px] text-ink-muted">Not reported</span>
          </div>

          <div className="flex items-center gap-3 border-l border-hairline pl-4">
            <LegendFlow color={flow.export} label={hasFlows ? "Exports to" : "Exports"} />
            <LegendFlow color={flow.import} label={hasFlows ? "Imports from" : "Imports"} />
          </div>

          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] text-ink-muted hover:text-ink">
              <Info className="h-3 w-3" aria-hidden />
              Source
            </summary>
            <div className="absolute bottom-6 right-0 z-40 w-72 rounded-lg border border-hairline bg-surface p-3 text-[10px] leading-relaxed shadow-xl">
              <p className="font-medium text-ink-secondary">
                {meta.source} · vintage {meta.vintage}
              </p>
              <p className="mt-1 text-ink-muted">
                {reportingCountries} countries reporting for {year}.
              </p>
              <ul className="mt-2 space-y-1 pl-3 text-ink-muted">
                {meta.caveats.slice(0, 3).map((c) => (
                  <li key={c} className="list-disc">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

/** A short line with an arrowhead - the same encoding the map uses. */
function LegendFlow({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden className="shrink-0">
        <line x1="0" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M17 0.5 L25 4 L17 7.5 Z" fill={color} />
      </svg>
      <span className="text-[10px] text-ink-muted">{label}</span>
    </span>
  );
}
