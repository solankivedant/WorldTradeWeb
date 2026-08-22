# Rule: Map performance

The map is the product. If it stutters, nothing else matters. Target: 45+ fps with 10k arcs
on a mid-range laptop.

## Never send GeoJSON for flow arcs

Arcs go over the wire as flat typed arrays — `[originLon, originLat, destLon, destLat, value,
sectorId]` — not GeoJSON features. GeoJSON for 10k arcs is megabytes of redundant JSON keys
and blocks the main thread during parse.

## Level of detail is mandatory

Never render every corridor in the dataset. At world zoom, cap to the top N by value. As the
user zooms, request corridors intersecting the current bounding box. A request for arcs
without a `limit` or a `bbox` is a bug.

## Geometry and data are separate loads

Country polygons load once as PMTiles and stay cached. Changing year, metric, or product
refetches only the data join, never the geometry. If a filter change triggers a geometry
request, that is a regression.

## Everything visual runs on the GPU

Use deck.gl layers for anything drawn per-datum. Do not hand-render markers as DOM elements
or SVG — a few hundred DOM nodes over a moving map destroys frame rate. Hover uses deck.gl
picking, not CPU hit-testing.

## Do not re-create layers on every render

deck.gl layers must be memoized against their real dependencies. Constructing new layer
instances each React render forces full GPU buffer re-uploads. This is the single most common
cause of map jank in this codebase — check it first when performance regresses.

## Animate by interpolation, not refetch

Year-over-year playback prefetches adjacent years and interpolates between them. Fetching per
animation frame is never acceptable.

## Respect reduced motion

Check `prefers-reduced-motion`. When set, arcs render static and year transitions cut rather
than tween.

## Measure before optimizing

Claims about map performance need a profile, not intuition. Use the deck.gl FPS overlay and
Chrome performance traces. State the measured before/after in any PR that claims a perf win.
