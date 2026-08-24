"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { Loader2, MousePointerClick, SlidersHorizontal, X } from "lucide-react";
import { SECTOR_CATALOG } from "@/lib/sectors";
import type { Provenance } from "@/lib/types";
import type { MapMetric, MapPayload } from "./types";
import { CountryPanel } from "./country-panel";
import { ConnectionPanel } from "./connection-panel";
import { MapFooter } from "./map-footer";

// deck.gl touches window/WebGL at module scope, so the map cannot server-render.
const TradeMap = dynamic(() => import("./trade-map").then((m) => m.TradeMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-plane">
      <Loader2 className="h-5 w-5 animate-spin text-ink-muted" aria-hidden />
    </div>
  ),
});

interface Props {
  geo: GeoJSON.FeatureCollection;
  countryNames: Record<string, string>;
  countryIso2: Record<string, string | null>;
  years: number[];
  defaultYear: number;
  meta: Provenance;
}

/**
 * The map explorer.
 *
 * The map owns the whole viewport now. There is no permanent side rail: the metric lives
 * in the header, time and legends live in the footer, and country detail arrives as a
 * floating panel only once something is selected. Nothing occupies screen space until it
 * has something to say.
 *
 * Every filter is a URL search param via nuqs, so any view a reader can reach is a
 * permalink and browser back/forward works (docs/DESIGN.md §2).
 */
export function MapExplorer({
  geo,
  countryNames,
  countryIso2,
  years,
  defaultYear,
  meta,
}: Props) {
  const [year, setYear] = useQueryState("year", {
    defaultValue: String(defaultYear),
    clearOnDefault: true,
  });
  const [metric] = useQueryState("metric", { defaultValue: "volume", clearOnDefault: true });
  const [sector, setSector] = useQueryState("sector", { defaultValue: "", clearOnDefault: true });
  const [focus, setFocus] = useQueryState("focus", { defaultValue: "", clearOnDefault: true });
  // The open corridor is the SELECTED country plus this partner. Storing only the partner
  // keeps it consistent with `focus` by construction - a corridor whose origin disagreed
  // with the selection would draw arcs for one country and a panel for another.
  const [link, setLink] = useQueryState("link", { defaultValue: "", clearOnDefault: true });

  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const focusIso = focus || null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ year, metric });
    if (sector) params.set("sector", sector);
    if (focus) params.set("focus", focus);
    fetch(`/api/map?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => setPayload(json.data))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [year, metric, sector, focus]);

  const onFocusChange = useCallback((iso3: string | null) => setFocus(iso3 ?? ""), [setFocus]);
  const onYear = useCallback((y: number) => setYear(String(y)), [setYear]);
  const onConnectionChange = useCallback(
    (partner: string | null) => setLink(partner ?? ""),
    [setLink],
  );

  // A corridor only means anything against a selected origin. If the selection is cleared
  // or changed by any route - the panel's close button, a URL edit, browser back - the
  // open corridor has to go with it rather than describing a country nobody selected.
  useEffect(() => {
    if (!focus && link) setLink("");
  }, [focus, link, setLink]);

  const connection = focus && link ? { a: focus, b: link } : null;

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="relative flex-1">
        {payload ? (
          <TradeMap
            payload={payload}
            geo={geo}
            countryNames={countryNames}
            metric={metric as MapMetric}
            focusIso={focusIso}
            onFocusChange={onFocusChange}
            onConnectionChange={onConnectionChange}
            activeConnection={link || null}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-plane text-sm text-ink-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Loading trade data...
          </div>
        )}

        {/* ---- floating sector filter ---- */}
        <div className="floating pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-2 px-2.5 py-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            aria-label="Filter by sector"
            className="cursor-pointer bg-transparent text-xs text-ink focus:outline-none"
          >
            <option value="">All sectors</option>
            {SECTOR_CATALOG.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          {sector && (
            <button
              onClick={() => setSector("")}
              aria-label="Clear sector filter"
              className="rounded p-0.5 text-ink-muted hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>

        {loading && payload && (
          <div className="floating absolute right-3 top-14 z-20 flex items-center gap-1.5 px-2.5 py-1.5 text-2xs text-ink-muted">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Updating
          </div>
        )}

        {/* ---- hint, which changes once there is something else to click ---- */}
        {payload && !connection && (
          <div className="floating pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 px-3 py-1.5 text-2xs text-ink-secondary">
            <MousePointerClick className="h-3.5 w-3.5 text-series-1" aria-hidden />
            {focusIso
              ? "Click any flow line to open that connection"
              : "Click any country to see its trade flows"}
          </div>
        )}

        {/* ---- floating country panel ---- */}
        {payload?.detail && (
          <CountryPanel
            key={payload.detail.iso3}
            detail={payload.detail}
            countryNames={countryNames}
            countryIso2={countryIso2}
            year={payload.year}
            onClose={() => setFocus("")}
          />
        )}

        {/* ---- docked connection panel ---- */}
        {connection && (
          <ConnectionPanel
            key={`${connection.a}-${connection.b}`}
            a={connection.a}
            b={connection.b}
            year={Number(year)}
            sector={sector}
            onClose={() => setLink("")}
          />
        )}
      </div>

      <MapFooter
        year={Number(year)}
        years={years}
        onYear={onYear}
        metric={metric as MapMetric}
        hasFlows={Boolean(payload?.detail?.flows.length)}
        meta={meta}
        reportingCountries={payload?.reportingCountries ?? 0}
      />
    </div>
  );
}
