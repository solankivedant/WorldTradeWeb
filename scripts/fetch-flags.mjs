/**
 * One-off: pull an SVG flag for every country in the published reference set.
 *
 * Why local files rather than an emoji or a CDN:
 *   - Regional-indicator emoji flags (the old `flagEmoji` helper) do not render on
 *     Windows at all - the OS font has no flag glyphs, so every flag degraded to the
 *     bare two-letter code. That is what shipped, and it is the bug this fixes.
 *   - The rest of the app is self-contained: the basemap is drawn from local GeoJSON
 *     and no page reaches an external host at runtime. Hot-linking a flag CDN would
 *     make 200 network requests per table render and break that property.
 *
 * Source: flagcdn.com, which serves the public-domain flag set behind `flag-icons`.
 * Output is committed, so this runs once per reference refresh, not per build.
 *
 *   node scripts/fetch-flags.mjs
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRIES = path.join(ROOT, "data/processed/countries.json");
const OUT_DIR = path.join(ROOT, "apps/web/public/flags");
const BASE = "https://flagcdn.com";

async function main() {
  const raw = JSON.parse(await readFile(COUNTRIES, "utf8"));
  const countries = Array.isArray(raw) ? raw : (raw.countries ?? Object.values(raw));

  const codes = [
    ...new Set(
      countries
        .map((c) => c.iso2)
        .filter((c) => typeof c === "string" && c.length === 2)
        .map((c) => c.toLowerCase()),
    ),
  ].sort();

  await mkdir(OUT_DIR, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  const failed = [];

  for (const code of codes) {
    const dest = path.join(OUT_DIR, `${code}.svg`);
    if (existsSync(dest)) {
      skipped += 1;
      continue;
    }
    try {
      const res = await fetch(`${BASE}/${code}.svg`);
      if (!res.ok) {
        failed.push(`${code} (HTTP ${res.status})`);
        continue;
      }
      const svg = await res.text();
      if (!svg.trimStart().startsWith("<svg")) {
        failed.push(`${code} (not an SVG)`);
        continue;
      }
      await writeFile(dest, svg, "utf8");
      fetched += 1;
    } catch (err) {
      failed.push(`${code} (${err.message})`);
    }
  }

  const onDisk = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".svg"));

  await writeFile(
    path.join(OUT_DIR, "PROVENANCE.json"),
    `${JSON.stringify(
      {
        source: "flagcdn.com",
        license: "Public domain (the flag-icons collection, MIT-licensed packaging)",
        retrieved: new Date().toISOString().slice(0, 10),
        requested: codes.length,
        onDisk: onDisk.length,
        note: "ISO 3166-1 alpha-2, lowercase filenames. Regenerate with scripts/fetch-flags.mjs.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`flags: ${fetched} fetched, ${skipped} already present, ${onDisk.length} on disk`);
  if (failed.length) console.warn(`missing: ${failed.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
