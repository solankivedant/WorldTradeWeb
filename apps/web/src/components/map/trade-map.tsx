"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { type MapRef } from "react-map-gl/maplibre";
import DeckGL from "@deck.gl/react";
import { ArcLayer, GeoJsonLayer, TextLayer } from "@deck.gl/layers";
import { MapView, type PickingInfo, type ViewStateChangeParameters } from "@deck.gl/core";
import { Maximize2, Minus, Plus } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  divergingColor,
  flowColors,
  mapTheme,
  sequentialColor,
  toRGBA,
} from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd } from "@/lib/format";
import type { Flow, MapMetric, MapPayload } from "./types";

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  minZoom: number;
  maxZoom: number;
}

/**
 * The latitude band every country actually occupies.
 *
 * North stops at 81 - far enough for the top of Greenland and Svalbard - and south at
 * -56, the tip of Chile. Fitting the full Mercator range instead would spend most of the
 * viewport on Antarctica and the empty Arctic and leave the inhabited world tiny.
 */
const FIT_NORTH = 81;
const FIT_SOUTH = -56;
/** Breathing room so no coastline is flush against a viewport edge. */
const FIT_PAD = 28;
/** Below this the world is too small to read; above it something is cropped. */
const ZOOM_RANGE = { min: 0.4, max: 8 };

const FALLBACK_VIEW: ViewState = {
  longitude: 12,
  latitude: 20,
  zoom: 1.1,
  pitch: 0,
  bearing: 0,
  minZoom: ZOOM_RANGE.min,
  maxZoom: ZOOM_RANGE.max,
};

/** Normalized Web Mercator y, 0 at the north edge and 1 at the south. */
function mercatorY(lat: number): number {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI);
}

function latFromMercatorY(y: number): number {
  return ((2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * The opening view has to show every country at once, on whatever window it opens in.
 *
 * A hard-coded zoom cannot do that: the same 1.55 that framed the world on one laptop
 * cropped Greenland and Patagonia on a shorter one, and a reader who lands on a map with
 * the edges missing has no way to know what they are not seeing. So the zoom is derived
 * from the container - the tighter of "the full 360 degrees fits across" and "the
 * inhabited latitude band fits down" - and re-derived on resize until the reader takes
 * over.
 */
function fitWorld(width: number, height: number): ViewState {
  const yNorth = mercatorY(FIT_NORTH);
  const ySouth = mercatorY(FIT_SOUTH);
  const span = ySouth - yNorth;

  const usableWidth = Math.max(160, width - FIT_PAD * 2);
  const usableHeight = Math.max(160, height - FIT_PAD * 2);

  // A tile is 512px at zoom 0, so the world is 512 * 2^zoom pixels on a side.
  const zoomForWidth = Math.log2(usableWidth / 512);
  const zoomForHeight = Math.log2(usableHeight / span / 512);

  return {
    longitude: 12,
    latitude: latFromMercatorY((yNorth + ySouth) / 2),
    zoom: Math.max(ZOOM_RANGE.min, Math.min(zoomForWidth, zoomForHeight)),
    pitch: 0,
    bearing: 0,
    minZoom: ZOOM_RANGE.min,
    maxZoom: ZOOM_RANGE.max,
  };
}

/**
 * `repeat: true` is what makes the world continuous.
 *
 * Without it the projection renders exactly one copy of the globe: pan east past the
 * antimeridian and the map simply ends in empty space, cutting New Zealand and the
 * Pacific off from Asia.
 */
const VIEWS = new MapView({ id: "map", repeat: true });

interface Props {
  payload: MapPayload;
  geo: GeoJSON.FeatureCollection;
  countryNames: Record<string, string>;
  metric: MapMetric;
  focusIso: string | null;
  onFocusChange: (iso3: string | null) => void;
  /** Clicking an arc opens the connection panel. Null clears it. */
  onConnectionChange: (partnerIso: string | null) => void;
  /** The corridor currently open in the panel, so its arc can be drawn lit. */
  activeConnection: string | null;
}

export function TradeMap({
  payload,
  geo,
  countryNames,
  metric,
  focusIso,
  onFocusChange,
  onConnectionChange,
  activeConnection,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  const theme = mapTheme(resolved);
  const flowColor = flowColors(resolved);

  const [hover, setHover] = useState<{ x: number; y: number; iso3: string } | null>(null);
  const [flowHover, setFlowHover] = useState<{ x: number; y: number; flow: Flow } | null>(
    null,
  );

  const [viewState, setViewState] = useState<ViewState>(FALLBACK_VIEW);
  // Once the reader has panned or zoomed, the view is theirs. Auto-fitting after that
  // would throw away their position every time the window changed size.
  const readerDrivesView = useRef(false);

  const fitToContainer = useCallback((force = false) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || box.width < 60 || box.height < 60) return;
    if (readerDrivesView.current && !force) return;
    if (force) readerDrivesView.current = false;
    setViewState(fitWorld(box.width, box.height));
  }, []);

  useEffect(() => {
    fitToContainer();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fitToContainer());
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitToContainer]);

  const onViewStateChange = useCallback((params: ViewStateChangeParameters) => {
    readerDrivesView.current = true;
    setViewState(params.viewState as unknown as ViewState);
  }, []);

  const nudgeZoom = useCallback((delta: number) => {
    readerDrivesView.current = true;
    setViewState((v) => ({
      ...v,
      zoom: Math.max(ZOOM_RANGE.min, Math.min(ZOOM_RANGE.max, v.zoom + delta)),
    }));
  }, []);

  const basemap = useMemo(
    () => ({
      version: 8 as const,
      sources: {},
      layers: [
        { id: "bg", type: "background" as const, paint: { "background-color": theme.background } },
      ],
      // No `glyphs` key at all. MapLibre validates it as a required string when present,
      // and setting it to undefined throws "glyphs: string expected, undefined found".
    }),
    [theme.background],
  );

  /**
   * Fill color per country, precomputed into a Map.
   *
   * The deck.gl accessor runs per-feature per-frame, so it must be arithmetic only - no
   * lookups into the payload, no string building, no allocation. All of that happens once,
   * here.
   */
  const fills = useMemo(() => {
    const out = new Map<string, [number, number, number, number]>();
    for (const [iso3, value] of Object.entries(payload.values)) {
      const hex =
        metric === "balance"
          ? divergingColor(value, payload.max, resolved, payload.floor)
          : sequentialColor(value, payload.max, resolved, payload.floor);
      // A null hex means not reported - a distinct fill, never the ramp's zero end.
      out.set(iso3, hex ? toRGBA(hex, 240) : theme.noData);
    }
    return out;
  }, [payload.values, payload.max, payload.floor, metric, resolved, theme.noData]);

  const hoveredIso = hover?.iso3 ?? null;
  const activeIso = focusIso ?? hoveredIso;
  const flows = payload.detail?.flows ?? [];

  const layers = useMemo(() => {
    const built: unknown[] = [
      new GeoJsonLayer({
        id: "countries",
        data: geo,
        filled: true,
        stroked: true,
        getFillColor: (f: GeoJSON.Feature) => {
          const iso = (f.properties as { iso3: string }).iso3;
          const base = fills.get(iso) ?? theme.noData;
          // Everything except the selected country steps back so the flows read clearly.
          if (focusIso && iso !== focusIso) {
            return [base[0], base[1], base[2], 120] as [number, number, number, number];
          }
          return base;
        },
        getLineColor: (f: GeoJSON.Feature) =>
          (f.properties as { iso3: string }).iso3 === activeIso
            ? theme.borderHighlight
            : theme.border,
        getLineWidth: (f: GeoJSON.Feature) =>
          (f.properties as { iso3: string }).iso3 === activeIso ? 2.5 : 0.5,
        lineWidthUnits: "pixels",
        // Russia, Fiji and the US all have polygons crossing the antimeridian. Without
        // this they smear into bands across the full width of the map.
        wrapLongitude: true,
        pickable: true,
        autoHighlight: false,
        // updateTriggers, not new layer instances - reconstructing layers each render
        // forces full GPU buffer re-uploads and is the top cause of map jank here.
        updateTriggers: {
          getFillColor: [payload.values, payload.max, payload.floor, metric, resolved, focusIso],
          getLineColor: [activeIso, resolved],
          getLineWidth: [activeIso],
        },
      }),
    ];

    if (flows.length) {
      const maxFlow = Math.max(...flows.map((f) => f.v), 1);

      // Hot = hovered, or belonging to the corridor whose panel is open. Both directions
      // of the open corridor light up, because the panel describes both of them.
      const isHot = (d: Flow) =>
        (flowHover !== null &&
          flowHover.flow.partner === d.partner &&
          flowHover.flow.dir === d.dir) ||
        d.partner === activeConnection;

      /**
       * Exports and imports to the SAME partner run along the same great circle, so left
       * alone they are drawn exactly on top of one another and one hides the other.
       *
       * Two separations, because neither is enough alone:
       *   HEIGHT - exports ride a tall outer arc, imports a shallow inner one. This is the
       *   one that actually does the work, and it doubles as a readable convention: the
       *   outer arc is what leaves, the inner one is what arrives.
       *   TILT   - opposite lateral bows, which keeps them apart on short corridors where
       *   both arcs are too small for the height difference to register.
       *
       * Tilt alone was tried first and barely moved them: tilting rotates the arc PLANE,
       * so with a near-flat arc there is almost no bow to rotate.
       */
      const OUTER = 0.30;
      const INNER = 0.10;

      /**
       * Height is a MULTIPLE of the arc's own length in deck.gl, so a fixed value makes
       * short corridors barely bow while an India-to-US arc balloons clean off the top of
       * the viewport. Damping by span keeps every arc inside the canvas: short corridors
       * get the full height (they need the separation most, since their two directions are
       * only a few pixels apart), long ones flatten out.
       */
      const span = (d: Flow) =>
        Math.max(1, Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]));
      const damp = (d: Flow) => Math.min(1, 40 / span(d));
      const height = (d: Flow) =>
        (d.dir === "export" ? OUTER : INNER) * damp(d) + (d.dir === "export" ? 0.05 : 0.015);
      const tilt = (d: Flow) => (d.dir === "export" ? 16 : -16);

      /**
       * The arc peaks above its ground midpoint, and the taller the arc the further above.
       * The label is anchored to the ground point, so it needs pushing up by roughly the
       * same amount to stay with its own line. This tracks the damped height rather than a
       * constant, or the labels drift off the long flat arcs.
       */
      const rise = (d: Flow) => -(height(d) * 66);

      // Halo pass. A 2px line over a saturated choropleth reads as a dotted smudge; a
      // wider, softer line of the same hue underneath gives it an edge to sit against.
      built.push(
        new ArcLayer<Flow>({
          id: "flow-glow",
          data: flows,
          getSourcePosition: (d) => d.from,
          getTargetPosition: (d) => d.to,
          getSourceColor: (d) =>
            [...(d.dir === "export" ? flowColor.exportGlow : flowColor.importGlow), 55] as [
              number, number, number, number,
            ],
          getTargetColor: (d) =>
            [...(d.dir === "export" ? flowColor.exportGlow : flowColor.importGlow), 70] as [
              number, number, number, number,
            ],
          getWidth: (d) => (isHot(d) ? 16 : 8) + Math.sqrt(d.v / maxFlow) * 5,
          widthUnits: "pixels",
          widthMinPixels: 6,
          widthMaxPixels: 22,
          getHeight: height,
          getTilt: tilt,
          greatCircle: true,
          pickable: false,
          updateTriggers: {
            getSourceColor: [resolved],
            getTargetColor: [resolved],
            getWidth: [flows, flowHover, activeConnection],
          },
        }),
      );

      built.push(
        new ArcLayer<Flow>({
          id: "flows",
          data: flows,
          getSourcePosition: (d) => d.from,
          getTargetPosition: (d) => d.to,
          // Direction is carried by the arrowhead, the tilt and the label, not by the
          // gradient, so both ends take the same hue and the line reads as one colour.
          getSourceColor: (d) =>
            [...(d.dir === "export" ? flowColor.exportRGB : flowColor.importRGB), isHot(d) ? 255 : 215] as [
              number, number, number, number,
            ],
          getTargetColor: (d) =>
            [...(d.dir === "export" ? flowColor.exportRGB : flowColor.importRGB), 255] as [
              number, number, number, number,
            ],
          getWidth: (d) => (isHot(d) ? 3.4 : 1.6) + Math.sqrt(d.v / maxFlow) * 4.2,
          widthUnits: "pixels",
          widthMinPixels: 1.6,
          widthMaxPixels: 9,
          getHeight: height,
          getTilt: tilt,
          greatCircle: true,
          pickable: true,
          updateTriggers: {
            getSourceColor: [resolved, flowHover, activeConnection],
            getTargetColor: [resolved],
            getWidth: [flows, flowHover, activeConnection],
          },
        }),
      );

      /**
       * Screen-space offset that follows the arc's tilt.
       *
       * `mid` is the midpoint of the UNTILTED great circle, but the drawn arc now bows to
       * one side, so a label anchored at `mid` floats off its own line. Pushing the label
       * perpendicular to the path direction, with the sign matching the tilt, keeps it on
       * the arc it belongs to - and as a bonus separates the export and import labels for
       * the same partner, which used to overlap exactly.
       */
      const perpendicular = (d: Flow, distance: number): [number, number] => {
        const rad = (d.angle * Math.PI) / 180;
        const sign = d.dir === "export" ? -1 : 1;
        return [Math.sin(rad) * distance * sign, Math.cos(rad) * distance * sign + rise(d)];
      };

      // Arrowhead: a glyph rotated to the bearing at the midpoint, so the direction of
      // travel is legible without relying on colour.
      built.push(
        new TextLayer<Flow>({
          id: "flow-arrows",
          data: flows,
          getPosition: (d) => d.mid,
          getText: () => "▶",
          getSize: (d) => (isHot(d) ? 20 : 15),
          getAngle: (d) => d.angle,
          getPixelOffset: (d) => perpendicular(d, 14),
          getColor: (d) =>
            [...(d.dir === "export" ? flowColor.exportRGB : flowColor.importRGB), 255] as [
              number, number, number, number,
            ],
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          characterSet: ["▶"],
          pickable: false,
          updateTriggers: {
            getColor: [resolved],
            getAngle: [flows],
            getPixelOffset: [flows],
            getSize: [flowHover, activeConnection],
          },
        }),
      );

      // Value label, offset above the line so it does not sit under the arrowhead.
      built.push(
        new TextLayer<Flow>({
          id: "flow-values",
          data: flows,
          getPosition: (d) => d.mid,
          getText: (d) => usd(d.v, 0),
          getSize: 12,
          getColor: [theme.labelInk[0], theme.labelInk[1], theme.labelInk[2], 255],
          getPixelOffset: (d) => {
            const [px, py] = perpendicular(d, 14);
            return [px, py - 13];
          },
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          fontWeight: 600,
          background: true,
          getBackgroundColor: [
            theme.labelBg[0],
            theme.labelBg[1],
            theme.labelBg[2],
            230,
          ],
          backgroundPadding: [5, 2, 5, 2],
          getBorderColor: (d) =>
            [...(d.dir === "export" ? flowColor.exportRGB : flowColor.importRGB), 220] as [
              number, number, number, number,
            ],
          getBorderWidth: 1,
          pickable: true,
          updateTriggers: {
            getColor: [resolved],
            getBackgroundColor: [resolved],
            getBorderColor: [resolved],
            getPixelOffset: [flows],
          },
        }),
      );
    }

    return built;
  }, [
    geo,
    fills,
    activeIso,
    focusIso,
    flows,
    payload.values,
    payload.max,
    payload.floor,
    metric,
    resolved,
    theme,
    flowColor,
    flowHover,
    activeConnection,
  ]);

  const onHoverPick = useCallback((info: PickingInfo) => {
    if (info.layer?.id === "flows" || info.layer?.id === "flow-values") {
      setHover(null);
      setFlowHover(info.object ? { x: info.x, y: info.y, flow: info.object as Flow } : null);
      return;
    }
    setFlowHover(null);
    const iso3 = (info.object as GeoJSON.Feature | undefined)?.properties?.iso3 as
      | string
      | undefined;
    setHover(iso3 ? { x: info.x, y: info.y, iso3 } : null);
  }, []);

  const onClick = useCallback(
    (info: PickingInfo) => {
      // An arc, or its value label, opens that corridor rather than changing the
      // selection. Picking the country underneath instead would swap the whole map out
      // from under a reader who was aiming at a line drawn on top of it.
      if (info.layer?.id === "flows" || info.layer?.id === "flow-values") {
        const flow = info.object as Flow | undefined;
        if (flow) {
          onConnectionChange(flow.partner === activeConnection ? null : flow.partner);
          return;
        }
      }
      const iso3 = (info.object as GeoJSON.Feature | undefined)?.properties?.iso3 as
        | string
        | undefined;
      // Clicking a country selects it; clicking it again, or clicking empty ocean, clears.
      // Either way the open corridor no longer belongs to what is selected, so it goes.
      onConnectionChange(null);
      onFocusChange(iso3 && iso3 !== focusIso ? iso3 : null);
    },
    [onFocusChange, focusIso, onConnectionChange, activeConnection],
  );

  // Escape unwinds one layer at a time. With a corridor open it closes that (the
  // connection panel owns that key), and only a second press clears the selection -
  // otherwise one keypress would dismiss both and the reader loses their place.
  useEffect(() => {
    if (!focusIso || activeConnection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFocusChange(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIso, onFocusChange, activeConnection]);

  const hoverPair = hoveredIso ? payload.pairs[hoveredIso] : undefined;

  /**
   * Tooltip placement, and the reason it is not just `left: x + 14`.
   *
   * A tooltip pinned to the right of the cursor near the right edge overflows its
   * container. That grows the scroll width, a scrollbar appears, the canvas is resized a
   * few pixels narrower, deck.gl re-fires hover at slightly different coordinates, the
   * tooltip moves, the overflow goes away, the scrollbar disappears - and the whole cycle
   * repeats every frame. That feedback loop is what reads as the panel "vibrating".
   *
   * Two independent fixes, because either alone is fragile: the container clips overflow
   * so a tooltip can never change the scroll width, AND the tooltip flips to the other
   * side of the cursor when it would run past an edge.
   */
  const tipStyle = (x: number, y: number, width: number, height: number) => {
    const bounds = wrapRef.current?.getBoundingClientRect();
    const w = bounds?.width ?? 0;
    const h = bounds?.height ?? 0;
    const flipX = w > 0 && x + 14 + width > w;
    const flipY = h > 0 && y + 14 + height > h;
    return {
      left: flipX ? Math.max(4, x - 14 - width) : x + 14,
      top: flipY ? Math.max(4, y - 14 - height) : y + 14,
      width,
    };
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <DeckGL
        views={VIEWS}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{ dragRotate: false, touchRotate: false }}
        /**
         * A 2px arc is close to impossible to hit with a mouse, and every near-miss fell
         * through to the country underneath - so the tooltip flipped between the flow and
         * the country as the cursor wobbled. A picking radius makes the line the easier
         * target, which is the right precedence when flows are on screen.
         */
        pickingRadius={12}
        layers={layers as never}
        onHover={onHoverPick}
        onClick={onClick}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
        parameters={{ cullMode: "none" }}
      >
        <MapGL ref={mapRef} mapStyle={basemap} attributionControl={false} reuseMaps />
      </DeckGL>

      {/* Zoom and a way back. "Fit world" matters more than the +/- pair: once someone
          has zoomed into a corner, returning to the overview by dragging is fiddly. */}
      <div className="floating absolute bottom-3 right-3 z-20 flex flex-col overflow-hidden p-0">
        <button
          onClick={() => nudgeZoom(0.5)}
          aria-label="Zoom in"
          title="Zoom in"
          className="flex h-8 w-8 items-center justify-center text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={() => nudgeZoom(-0.5)}
          aria-label="Zoom out"
          title="Zoom out"
          className="flex h-8 w-8 items-center justify-center border-t border-hairline text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={() => fitToContainer(true)}
          aria-label="Fit the whole world in view"
          title="Fit the whole world in view"
          className="flex h-8 w-8 items-center justify-center border-t border-hairline text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-xl"
          style={tipStyle(hover.x, hover.y, 190, 132)}
          role="status"
        >
          <div className="font-medium text-ink">{countryNames[hover.iso3] ?? hover.iso3}</div>
          {/* The tooltip always shows BOTH sides, whichever lens is active. The map can
              only colour one number, but the reader should never have to guess the other. */}
          {hoverPair && (hoverPair.x !== null || hoverPair.m !== null) ? (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-baseline justify-between gap-4 text-2xs">
                <span className="flex items-center gap-1.5" style={{ color: flowColor.export }}>
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: flowColor.export }}
                    aria-hidden
                  />
                  Exports
                </span>
                <span className="tabular text-ink">{usd(hoverPair.x)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 text-2xs">
                <span className="flex items-center gap-1.5" style={{ color: flowColor.import }}>
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: flowColor.import }}
                    aria-hidden
                  />
                  Imports
                </span>
                <span className="tabular text-ink">{usd(hoverPair.m)}</span>
              </div>
              {hoverPair.x !== null && hoverPair.m !== null && (
                <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-1 text-2xs">
                  <span className="text-ink-muted">
                    {metric === "balance" ? "Balance" : "Total"}
                  </span>
                  <span
                    className={
                      metric === "balance" && hoverPair.x - hoverPair.m < 0
                        ? "tabular text-delta-down"
                        : "tabular text-ink"
                    }
                  >
                    {usd(
                      metric === "balance"
                        ? hoverPair.x - hoverPair.m
                        : hoverPair.x + hoverPair.m,
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-0.5 text-2xs text-ink-muted">Not reported</div>
          )}
          <div className="mt-1 text-2xs text-ink-muted">
            {focusIso === hover.iso3 ? "Click to deselect" : "Click for details"}
          </div>
        </div>
      )}

      {flowHover && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-xl"
          style={tipStyle(flowHover.x, flowHover.y, 236, flowHover.flow.src === "importer" ? 98 : 78)}
          role="status"
        >
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background:
                  flowHover.flow.dir === "export" ? flowColor.export : flowColor.import,
              }}
              aria-hidden
            />
            {flowHover.flow.dir === "export" ? "Export to" : "Import from"}{" "}
            {countryNames[flowHover.flow.partner] ?? flowHover.flow.partner}
          </div>
          <div className="tabular mt-0.5 text-ink-secondary">{usd(flowHover.flow.v)} a year</div>
          {flowHover.flow.src === "importer" && (
            <div className="mt-1 border-t border-hairline pt-1 text-2xs leading-snug text-ink-muted">
              {countryNames[flowHover.flow.partner] ?? flowHover.flow.partner} publishes no
              export figures. This is the buyer&apos;s own customs record.
            </div>
          )}
          <div className="mt-1 text-2xs text-ink-muted">Click to open this connection</div>
        </div>
      )}
    </div>
  );
}
