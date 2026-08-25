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
import { SectorIcon } from "@/components/sector-icon";
import { MapIntroDialog, useMapIntro } from "@/components/map-intro";
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
  const [metric, setMetric] = useQueryState("metric", { defaultValue: "volume", clearOnDefault: true });
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

  const intro = useMapIntro(Boolean(focus || link || sector));

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

        {/*
          ---- first-run orientation ----
          Suppressed whenever the URL already names a subject: that reader followed a
          permalink to see one specific thing, and an introduction on top of it is an
          interruption rather than a welcome. The way back in lives in the footer, because
          every corner of this canvas is claimed by one panel or another.
        */}
        {intro.mounted && intro.open && (
          <MapIntroDialog
            onDismiss={intro.dismiss}
            years={years}
            reportingCountries={payload?.reportingCountries ?? 0}
            meta={meta}
          />
        )}

        {/*
          ---- sector lens ----
          Labelled "Lens", not left as a bare select. An unlabelled dropdown floating on a
          canvas reads as chrome, and a reader who cannot tell a filter from a display
          option will not touch either. The sentence underneath appears only once a sector
          is chosen, and it exists because this control does something the reader has no
          way to see: it narrows the ARCS and the panel as well as the choropleth, so a
          filtered map is not the same map with fewer colours.
        */}
        <div className="floating pointer-events-auto absolute right-3 top-3 z-20 max-w-[min(20rem,calc(100vw-1.5rem))] px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Lens
            </span>
            {/* The lens swaps its own glyph in once a sector is chosen, so the control
                states what it is filtering to without the reader opening it. */}
            {sector ? (
              <SectorIcon code={sector} className="h-3.5 w-3.5" />
            ) : (
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
            )}
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              aria-label="Filter the map by sector"
              className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs text-ink focus:outline-none"
            >
              <option value="">All sectors</option>
              {/* The chapters ride along in the option itself: "Stone & glass" alone does
                  not tell a reader the lens they are about to apply covers gold. */}
              {SECTOR_CATALOG.map((s) => (
                <option key={s.code} value={s.code} title={s.covers}>
                  {s.name} (HS {s.hs})
                </option>
              ))}
            </select>
            {sector && (
              <button
                onClick={() => setSector("")}
                aria-label="Clear sector filter"
                title="Show all sectors again"
                className="shrink-0 rounded p-0.5 text-ink-muted hover:text-ink"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </div>
          {sector && (
            <p className="mt-1 border-t border-hairline pt-1 text-[10px] leading-snug text-ink-muted">
              Colours, flow lines and panel figures are all narrowed to this sector. Year
              on year is hidden while it is on - the sector cube is latest-year only.
            </p>
          )}
        </div>

        {loading && payload && (
          <div className="floating absolute right-3 top-14 z-20 flex items-center gap-1.5 px-2.5 py-1.5 text-2xs text-ink-muted">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Updating
          </div>
        )}

        {/*
          ---- where the reader is in the interaction ----
          A single rotating sentence told them what to click but never that clicking was
          part of a sequence, so the map looked like a picture with one trick rather than
          a drill-down. Numbering the steps makes the third one - the full dashboard -
          discoverable before they have taken the first.
        */}
        {payload && !connection && (
          // Hidden below sm: centred on a phone it lands on top of the sector lens, and
          // "click" is the wrong verb on the devices it would be covering.
          <div className="floating pointer-events-none absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 items-center gap-2 px-3 py-1.5 sm:flex">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-series-1" aria-hidden />
            <span className="text-2xs text-ink-secondary">
              {focusIso
                ? "Now click any flow line to open that connection"
                : "Click any country to see its trade flows"}
            </span>
            <span className="flex items-center gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i <= (focusIso ? 1 : 0) ? "bg-series-1" : "bg-baseline"
                  }`}
                />
              ))}
            </span>
            <span className="sr-only">
              Step {focusIso ? 2 : 1} of 3. The third step is opening the full dashboard
              from the panel that appears.
            </span>
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
        onMetric={(next) => setMetric(next === "volume" ? null : next)}
        hasFlows={Boolean(payload?.detail?.flows.length)}
        meta={meta}
        reportingCountries={payload?.reportingCountries ?? 0}
        onShowGuide={intro.mounted ? intro.show : null}
      />
    </div>
  );
}
