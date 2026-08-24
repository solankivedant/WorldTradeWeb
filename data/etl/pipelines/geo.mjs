/**
 * Country geometry pipeline: Natural Earth (India point-of-view) -> GeoJSON keyed by ISO3.
 *
 * SOURCE CHOICE — read this before changing it.
 *
 * Natural Earth publishes several *point-of-view* editions of its admin-0 boundaries.
 * They contain the same countries drawn as a given government depicts them, because
 * several borders are genuinely disputed and there is no neutral rendering that every
 * party accepts. This project ships the **India POV** edition
 * (`ne_10m_admin_0_countries_ind`), which shows Jammu & Kashmir in full — including
 * Pakistan-administered Kashmir / Gilgit-Baltistan and Aksai Chin — as Indian territory.
 *
 * The factual position, stated plainly because the map cannot state it itself: those two
 * areas are claimed by India and administered in practice by Pakistan and China
 * respectively. The default Natural Earth edition draws the de-facto lines instead. Both
 * renderings are widely published; which one a product ships is a jurisdiction and
 * audience decision, not a factual one, and every major mapping provider varies it the
 * same way. `/source` carries this note for readers.
 *
 * Taking the WHOLE country set from one POV edition — rather than patching India's
 * polygon into a default-edition base — is deliberate. Patching leaves Pakistan and China
 * still drawing their versions of the same ground, so the polygons overlap and the
 * disputed area flickers depending on draw order. One consistent source has no seams.
 *
 * SIMPLIFICATION: mapshaper, topology-preserving, run as a separate prepare step (see
 * `prepare-geo.sh`). Simplifying polygons independently would open gaps along every
 * shared border; mapshaper simplifies the shared arcs once. Target detail is roughly
 * Natural Earth 110m — at world zoom nobody can see coastline detail, but the GPU pays
 * for every vertex of it (.claude/rules/map-performance.md).
 *
 * Run: node data/etl/pipelines/geo.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const GEO_DIR = path.join(ROOT, "geo");
const OUT_DIR = path.join(ROOT, "processed");
const SOURCE = path.join(GEO_DIR, "ne_pov", "india_pov.geojson");
const ISO_URL =
  "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json";

/**
 * Natural Earth writes ISO_A3 as "-99" for entities whose code it considers contested or
 * absent (France and Norway are the famous cases — both have perfectly ordinary ISO
 * codes). ADM0_A3 always carries a usable code, so it is the fallback. Without this,
 * France silently disappears from the map.
 */
const NE_A3_FIXUPS = {
  FRA: "FRA",
  NOR: "NOR",
  KOS: "XKX", // Kosovo — no ISO 3166-1 numeric assignment; XKX is the user-assigned code
  SDS: "SSD", // South Sudan
  SOL: "SOM", // Somaliland folded into Somalia; it reports no trade separately
  CYN: null, // Northern Cyprus — reports no trade
  ATA: null, // Antarctica
  ATF: null, // French Southern Territories
  ESB: null, // Akrotiri/Dhekelia base areas
  WSB: null,
  KAB: null, // Baikonur
  IOA: null, // Indian Ocean Territories
  CNM: null, // Cyprus no-mans-land
  USG: null, // Guantanamo
  BJN: null, // Bajo Nuevo
  SER: null, // Serranilla
  SCR: null, // Scarborough Reef
  CLP: null, // Clipperton
  SAH: null, // Western Sahara — disputed, reports no trade
  PGA: null, // Spratly
};

function resolveIso3(props, valid) {
  const raw = (props.ISO_A3 ?? "").trim();
  const adm = (props.ADM0_A3 ?? "").trim();

  if (adm in NE_A3_FIXUPS) return NE_A3_FIXUPS[adm];
  if (raw && raw !== "-99" && valid.has(raw)) return raw;
  if (adm && adm !== "-99" && valid.has(adm)) return adm;
  return undefined;
}

async function isoCodes() {
  fs.mkdirSync(GEO_DIR, { recursive: true });
  const cached = path.join(GEO_DIR, "iso3166.json");
  let rows;
  if (fs.existsSync(cached)) {
    rows = JSON.parse(fs.readFileSync(cached, "utf-8"));
  } else {
    const response = await fetch(ISO_URL);
    if (!response.ok) throw new Error(`ISO table fetch failed: ${response.status}`);
    rows = await response.json();
    fs.writeFileSync(cached, JSON.stringify(rows));
  }
  return new Set(rows.map((r) => r["alpha-3"]));
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(
      `Simplified source not found at ${SOURCE}\nRun: bash data/etl/pipelines/prepare-geo.sh`,
    );
    process.exit(1);
  }

  const valid = await isoCodes();
  valid.add("XKX"); // user-assigned, not in the ISO table
  const collection = JSON.parse(fs.readFileSync(SOURCE, "utf-8"));

  const features = [];
  const unmatched = [];
  const seen = new Set();

  for (const f of collection.features) {
    const props = f.properties ?? {};
    const iso3 = resolveIso3(props, valid);

    if (iso3 === null) continue; // deliberately excluded, see NE_A3_FIXUPS
    if (iso3 === undefined) {
      // Never silently drop. An unmatched polygon is a country missing from the map.
      unmatched.push([props.ADM0_A3, props.ISO_A3, props.NAME]);
      continue;
    }
    if (seen.has(iso3)) continue;
    seen.add(iso3);

    features.push({
      type: "Feature",
      // Only what the map layer reads. Every extra property is bytes over the wire and
      // memory in the browser.
      properties: { iso3, name: props.NAME },
      geometry: f.geometry,
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "countries.geo.json");
  fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features }));

  fs.writeFileSync(
    path.join(GEO_DIR, "_meta.json"),
    JSON.stringify(
      {
        source: "Natural Earth 1:10m Admin 0 Countries — India point-of-view edition",
        file: "ne_10m_admin_0_countries_ind",
        url: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/",
        mirror: "https://github.com/nvkelso/natural-earth-vector",
        simplification: "mapshaper, topology-preserving, 1.2% of vertices retained",
        boundary_note:
          "Jammu & Kashmir is shown in full as Indian territory, including Gilgit-Baltistan and Aksai Chin. Those areas are claimed by India and administered in practice by Pakistan and China respectively. Natural Earth publishes point-of-view editions precisely because no single rendering of these borders is universally accepted.",
        iso_table: ISO_URL,
        retrieved_at: new Date().toISOString(),
        license: "public domain (Natural Earth)",
      },
      null,
      2,
    ),
  );

  console.log(`geometry: ${features.length} features matched to ISO3`);
  if (unmatched.length) console.log(`UNMATCHED (${unmatched.length}):`, unmatched);
  console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
