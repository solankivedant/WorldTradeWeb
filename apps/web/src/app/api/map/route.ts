import { NextRequest, NextResponse } from "next/server";
import {
  allCountries,
  dataset,
  diversificationHHI,
  exportRank,
  getCountry,
  latestYear,
  productsFor,
  provenance,
  totalsFor,
} from "@/lib/data";

export const dynamic = "force-dynamic";

/** How many corridors get drawn per direction. Beyond this the labels crowd. */
const FLOWS_PER_DIRECTION = 6;

/**
 * Where along each arc its label sits, cycled by index.
 *
 * Every flow from one country radiates from the same point, so labels placed at a fixed
 * fraction all pile up in the same patch of screen near the origin. Staggering the
 * fraction pushes each label to a different distance along its own arc, which separates
 * them without any collision-detection pass.
 */
// Index 0 is deliberately NOT 0.5. The largest flow is drawn first, and at t=0.5 its
// label lands on the arc apex - which on a long corridor is the highest point on screen
// and slid under the header. Starting off-centre keeps the biggest label clear.
const LABEL_STOPS = [0.36, 0.62, 0.46, 0.7, 0.3, 0.54];

/**
 * A point at fraction `t` along the great circle from 1 to 2, plus the bearing there.
 *
 * The label and arrowhead sit ON the drawn line, and the line is a great circle, so
 * interpolating lon/lat linearly puts them visibly off the path on long routes (India to
 * the US is out by several hundred kilometres). Spherical interpolation is the correct
 * form and costs a handful of trig calls.
 */
function greatCirclePoint(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  t: number,
): { lon: number; lat: number; angle: number } {
  const toRad = Math.PI / 180;
  const la1 = lat1 * toRad;
  const lo1 = lon1 * toRad;
  const la2 = lat2 * toRad;
  const lo2 = lon2 * toRad;

  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((la2 - la1) / 2) ** 2 +
            Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
        ),
      ),
    );

  const at = (f: number) => {
    // Degenerate case: coincident endpoints have no defined arc, so return the origin.
    if (d < 1e-9) return { lat: la1, lon: lo1 };
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(la1) * Math.cos(lo1) + b * Math.cos(la2) * Math.cos(lo2);
    const y = a * Math.cos(la1) * Math.sin(lo1) + b * Math.cos(la2) * Math.sin(lo2);
    const z = a * Math.sin(la1) + b * Math.sin(la2);
    return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)), lon: Math.atan2(y, x) };
  };

  const here = at(t);
  // Bearing taken from a point slightly further along, which is stable at any t.
  const ahead = at(Math.min(1, t + 0.02));
  const dLon = ahead.lon - here.lon;
  const y = Math.sin(dLon) * Math.cos(ahead.lat);
  const x =
    Math.cos(here.lat) * Math.sin(ahead.lat) -
    Math.sin(here.lat) * Math.cos(ahead.lat) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) / toRad;

  // deck.gl measures text angle counter-clockwise from east; compass bearing runs
  // clockwise from north.
  let angle = 90 - bearing;
  // Keep labels upright: past vertical, flip rather than render text upside down.
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;

  return { lon: ((here.lon / toRad + 540) % 360) - 180, lat: here.lat / toRad, angle };
}

/** Shortest-path longitude, so a Pacific corridor does not wrap the long way round. */
function unwrap(originLon: number, destLon: number): number {
  const delta = destLon - originLon;
  if (delta > 180) return destLon - 360;
  if (delta < -180) return destLon + 360;
  return destLon;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const year = Number(params.get("year")) || latestYear();
  const metric = (params.get("metric") ?? "volume") as "volume" | "balance";
  const sector = params.get("sector") ?? "";
  const focus = (params.get("focus") ?? "").toUpperCase();

  const countries = allCountries();

  // --- choropleth values ---------------------------------------------------
  //
  // Both lenses are COMPARISONS of exports and imports rather than one or the other:
  //   volume  = exports + imports, how much a country trades in total
  //   balance = exports - imports, which way the relationship leans
  // There is deliberately no "exports only" or "imports only" view - seeing one without
  // the other invites reading a big number as a good number, and the pair is the point.
  //
  // Absent stays absent. A country that does not report is not a zero, and the client
  // renders it as a hatch rather than as the bottom of the ramp. A country reporting only
  // one side of the pair is also absent here: half a comparison is not a comparison.
  const values: Record<string, number | null> = {};
  const pairs: Record<string, { x: number | null; m: number | null }> = {};

  for (const country of countries) {
    let x: number | null;
    let m: number | null;

    if (sector) {
      x = productsFor(country.iso3, "x").find((r) => r.code === sector)?.value ?? null;
      m = productsFor(country.iso3, "m").find((r) => r.code === sector)?.value ?? null;
    } else {
      const totals = totalsFor(country.iso3, year);
      x = totals.x ?? null;
      m = totals.m ?? null;
    }

    pairs[country.iso3] = { x, m };
    values[country.iso3] =
      x === null || m === null ? null : metric === "balance" ? x - m : x + m;
  }

  const reported = Object.values(values).filter((v): v is number => v !== null);
  const magnitudes = reported.map(Math.abs).filter((v) => v > 0).sort((a, b) => a - b);
  const max = magnitudes.length ? magnitudes[magnitudes.length - 1] : 0;
  // Color-domain floor = 5th percentile, not the true minimum. One microstate reporting
  // $40k of trade would otherwise stretch the log domain across nine orders of magnitude
  // and flatten every real difference above it.
  const floor = magnitudes.length ? magnitudes[Math.floor(magnitudes.length * 0.05)] : 1e6;

  // --- the selected country -------------------------------------------------
  const selected = focus ? getCountry(focus) : undefined;
  let detail: unknown = null;

  if (selected) {
    const { bilateral, byIso } = dataset();
    const exports: { iso: string; v: number }[] = [];
    const imports: { iso: string; v: number }[] = [];

    for (const row of bilateral) {
      if (row.y !== year || row.f !== "x") continue;
      // Both directions taken from the EXPORTER's own report, so the two sides are
      // measured the same way rather than one being a mirror of the other.
      if (row.r === focus) exports.push({ iso: row.p, v: row.v });
      else if (row.p === focus) imports.push({ iso: row.r, v: row.v });
    }
    exports.sort((a, b) => b.v - a.v);
    imports.sort((a, b) => b.v - a.v);

    const flows: {
      from: [number, number];
      to: [number, number];
      mid: [number, number];
      angle: number;
      v: number;
      dir: "export" | "import";
      partner: string;
    }[] = [];

    const addFlows = (rows: { iso: string; v: number }[], dir: "export" | "import") => {
      rows.slice(0, FLOWS_PER_DIRECTION).forEach((row, i) => {
        const partner = byIso.get(row.iso);
        if (!partner?.lat || !partner?.lon || !selected.lat || !selected.lon) return;

        // Arcs always run selected -> partner for exports and partner -> selected for
        // imports, so the arrowhead direction is the physical direction of the goods.
        const a = dir === "export" ? selected : partner;
        const b = dir === "export" ? partner : selected;
        const fromLon = a.lon as number;
        const fromLat = a.lat as number;
        const toLon = unwrap(fromLon, b.lon as number);
        const toLat = b.lat as number;

        // Exports and imports use offset stops so an outbound and an inbound arc to the
        // same partner do not land their labels on top of each other.
        const stop = LABEL_STOPS[(i + (dir === "import" ? 3 : 0)) % LABEL_STOPS.length];
        const at = greatCirclePoint(fromLon, fromLat, toLon, toLat, stop);

        flows.push({
          from: [fromLon, fromLat],
          to: [toLon, toLat],
          mid: [unwrap(fromLon, at.lon), at.lat],
          angle: at.angle,
          v: row.v,
          dir,
          partner: row.iso,
        });
      });
    };
    addFlows(exports, "export");
    addFlows(imports, "import");

    const totals = totalsFor(focus, year);
    const prev = totalsFor(focus, year - 1);
    // Sector mix carries BOTH directions, ranked by total trade in the sector, so the
    // panel never shows one side of a sector without the other.
    const sectorExports = productsFor(focus, "x");
    const sectorImports = productsFor(focus, "m");
    const sectorMap = new Map<
      string,
      { code: string; name: string; exports: number | null; imports: number | null }
    >();
    for (const row of sectorExports) {
      sectorMap.set(row.code, {
        code: row.code,
        name: row.name,
        exports: row.value,
        imports: null,
      });
    }
    for (const row of sectorImports) {
      const existing = sectorMap.get(row.code);
      if (existing) existing.imports = row.value;
      else
        sectorMap.set(row.code, {
          code: row.code,
          name: row.name,
          exports: null,
          imports: row.value,
        });
    }
    const sectors = [...sectorMap.values()]
      .sort(
        (a, b) =>
          (b.exports ?? 0) + (b.imports ?? 0) - ((a.exports ?? 0) + (a.imports ?? 0)),
      )
      .slice(0, 5)
      .map((row) => ({
        ...row,
        net:
          row.exports !== null && row.imports !== null ? row.exports - row.imports : null,
      }));

    detail = {
      iso3: selected.iso3,
      iso2: selected.iso2,
      name: selected.name,
      region: selected.region,
      exports: totals.x ?? null,
      imports: totals.m ?? null,
      prevExports: prev.x ?? null,
      prevImports: prev.m ?? null,
      rank: exportRank(focus, year),
      hhi: diversificationHHI(focus),
      sectors,
      topExports: exports.slice(0, 6),
      topImports: imports.slice(0, 6),
      exportPartnerCount: exports.length,
      importPartnerCount: imports.length,
      flows,
    };
  }

  return NextResponse.json(
    {
      data: {
        year,
        metric,
        sector: sector || null,
        values,
        // Both sides travel with every country so the tooltip can compare them without a
        // second request.
        pairs,
        max,
        floor,
        reportingCountries: reported.length,
        detail,
      },
      meta: provenance(),
    },
    {
      // The dataset is a published snapshot, not live. Long cache, invalidated by the ETL
      // publishing a new vintage.
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    },
  );
}
