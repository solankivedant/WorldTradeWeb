import { notFound } from "next/navigation";
import {
  allCountries,
  getCountry,
  latestYear,
  productsFor,
  provenance,
} from "@/lib/data";
import { sectorName, SECTOR_CATALOG } from "@/lib/sectors";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Package, Users } from "lucide-react";
import { Card, Crumb, ProvenanceBar, Stat } from "@/components/ui";
import { PartnerCompare } from "@/components/charts/partner-compare";
import type { PartnerPair } from "@/lib/pairing";
import { pct, usd } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `${sectorName(decodeURIComponent(code))} - global market | WorldTradeWeb` };
}

export default async function ProductPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  if (!SECTOR_CATALOG.some((s) => s.code === code)) notFound();

  const name = sectorName(code);
  const year = latestYear();

  /**
   * One row per country carrying BOTH sides of this sector.
   *
   * A country is very often a large exporter and a large importer of the same sector -
   * Germany in machinery, the US in transport - and two separate ranked lists hide that
   * entirely. Pairing them puts the country's real position in the sector on one row.
   */
  const rows: PartnerPair[] = [];
  for (const country of allCountries()) {
    const x = productsFor(country.iso3, "x").find((p) => p.code === code)?.value ?? null;
    const m = productsFor(country.iso3, "m").find((p) => p.code === code)?.value ?? null;
    if (x === null && m === null) continue;
    rows.push({
      iso3: country.iso3,
      name: country.name,
      iso2: country.iso2,
      exports: x,
      imports: m,
      net: x !== null && m !== null ? x - m : null,
    });
  }

  const worldExports = rows.reduce((sum, r) => sum + (r.exports ?? 0), 0);
  const worldImports = rows.reduce((sum, r) => sum + (r.imports ?? 0), 0);

  const exporters = rows.filter((r) => r.exports !== null).sort((a, b) => (b.exports ?? 0) - (a.exports ?? 0));
  const importers = rows.filter((r) => r.imports !== null).sort((a, b) => (b.imports ?? 0) - (a.imports ?? 0));
  const byTotal = [...rows].sort(
    (a, b) => (b.exports ?? 0) + (b.imports ?? 0) - ((a.exports ?? 0) + (a.imports ?? 0)),
  );

  // Herfindahl-Hirschman index over exporter shares: how concentrated is supply.
  const hhi = worldExports
    ? exporters.reduce((sum, r) => sum + Math.pow(((r.exports ?? 0) / worldExports) * 100, 2), 0)
    : null;
  const top5Share = worldExports
    ? (exporters.slice(0, 5).reduce((s, r) => s + (r.exports ?? 0), 0) / worldExports) * 100
    : null;

  const meta = provenance();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <Crumb items={[{ label: "Map", href: "/" }, { label: name }]} />

      <div className="mt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Package className="h-5 w-5 text-ink-muted" aria-hidden />
          {name}
        </h1>
        <p className="mt-1 text-xs text-ink-muted">
          HS section group <span className="tabular">{code}</span> · global market · {year}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<ArrowUpFromLine className="h-3 w-3" aria-hidden />}
          label="World exports"
          value={usd(worldExports)}
          hint={`${exporters.length} reporting exporters`}
        />
        <Stat
          icon={<ArrowDownToLine className="h-3 w-3" aria-hidden />}
          label="World imports"
          value={usd(worldImports)}
          hint={`${importers.length} reporting importers`}
        />
        <Stat
          icon={<Users className="h-3 w-3" aria-hidden />}
          label="Top 5 supplier share"
          value={top5Share === null ? "-" : pct(top5Share, 0)}
          hint="of world exports"
        />
        <Stat
          icon={<Boxes className="h-3 w-3" aria-hidden />}
          label="Supply concentration"
          value={hhi === null ? "-" : String(Math.round(hhi))}
          hint={
            hhi === null
              ? ""
              : hhi > 2500
                ? "highly concentrated"
                : hhi > 1500
                  ? "moderately concentrated"
                  : "competitive"
          }
        />
      </div>

      <div className="mt-3">
        <PartnerCompare
          rows={byTotal}
          variant="country"
          title="Who trades this sector"
          subtitle={`${year} · each country's own exports against its own imports, ranked by the two combined`}
          limit={14}
        />
      </div>

      <div className="mt-3">
        <Card title="Reading this page" icon={<Package className="h-3 w-3" aria-hidden />}>
          <div className="space-y-2 px-4 pb-4 pt-1 text-xs leading-relaxed text-ink-muted">
            <p>
              World totals here are the sum of what reporting countries declare. They are
              not an authoritative world figure: roughly a quarter of economies do not
              report at this level, and their trade is simply absent rather than estimated.
            </p>
            <p>
              This is an HS <em>section group</em> covering many distinct products.
              &quot;{name}&quot; can span thousands of tariff lines with different prices,
              buyers, and trade barriers. Treat concentration figures as describing the
              group, not any single product within it.
            </p>
            <p>
              Exporter and importer totals will not match. They are drawn from different
              reporters using different valuation bases, and the gap is left visible rather
              than reconciled.
            </p>
          </div>
        </Card>
      </div>

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`${name} · ${year}`} />
      </div>
    </div>
  );
}
