import { Suspense } from "react";
import fs from "node:fs";
import path from "node:path";
import { MapExplorer } from "@/components/map/map-explorer";
import { allCountries, dataDir, dataset, latestYear, provenance } from "@/lib/data";
import { Empty } from "@/components/ui";

export const metadata = {
  title: "World trade map - WorldTradeWeb",
};

/**
 * Geometry is read straight off disk rather than through the indexed dataset: it is a
 * single large blob with no lookups performed on it, so putting it in the in-memory index
 * would cost the memory without buying anything. It shares `lib/data.ts`'s resolved
 * directory so there is exactly one place that knows where published files live.
 */
function loadGeometry(): GeoJSON.FeatureCollection | null {
  const dir = dataDir();
  if (!dir) return null;
  try {
    const file = path.join(dir, "countries.geo.json");
    return JSON.parse(fs.readFileSync(file, "utf-8")) as GeoJSON.FeatureCollection;
  } catch (error) {
    console.error("[data] failed to read countries.geo.json:", error);
    return null;
  }
}

export default function MapPage() {
  const geo = loadGeometry();
  const { totals, ready } = dataset();

  if (!ready || !geo) {
    return (
      <div className="p-8">
        <Empty
          message="The dataset has not been built yet."
          hint="Run the pipelines: python data/etl/connectors/worldbank.py, then data/etl/connectors/wits.py, then python -m data.etl.pipelines.build --vintage <date> and python data/etl/pipelines/geo.py"
        />
      </div>
    );
  }

  const years = Array.from(
    new Set(Object.values(totals).flatMap((byYear) => Object.keys(byYear).map(Number))),
  ).sort((a, b) => a - b);

  const countryNames: Record<string, string> = {};
  const countryIso2: Record<string, string | null> = {};
  for (const country of allCountries()) {
    countryNames[country.iso3] = country.name;
    countryIso2[country.iso3] = country.iso2;
  }

  return (
    // nuqs reads useSearchParams, which bails out of static prerendering unless it sits
    // under a Suspense boundary. The fallback mirrors the explorer's frame so the shell
    // does not jump when the client component takes over.
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
          <div className="shrink-0 border-b border-hairline lg:w-64 lg:border-b-0 lg:border-r" />
          <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
            Loading map…
          </div>
        </div>
      }
    >
      <MapExplorer
        geo={geo}
        countryNames={countryNames}
        countryIso2={countryIso2}
        years={years}
        defaultYear={latestYear()}
        meta={provenance()}
      />
    </Suspense>
  );
}
