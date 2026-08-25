"use client";

import Link from "next/link";
import { useQueryState } from "nuqs";
import { ArrowUpRight, Layers, PackageSearch, Users } from "lucide-react";
import { ChartFrame } from "@/components/charts/chart-frame";
import { CompareBar, CompareLegend, COMPARE_TRACK_PAD } from "@/components/charts/compare-bar";
import { CountryFlag } from "@/components/country-flag";
import { SectorIcon } from "@/components/sector-icon";
import { useTheme } from "@/components/theme";
import { contextMeter, flowColors } from "@/lib/palette";
import { pairScale } from "@/lib/pairing";
import { pct, usd } from "@/lib/format";
/*
 * `import type` ONLY. `lib/needs.ts` reaches into `lib/data.ts`, which holds the whole
 * published cube in memory; a value import here would drag it into the browser bundle.
 * Every string this component needs to SAY - the coverage band, the supplier provenance -
 * is computed on the server and travels on the row.
 */
import type { SectorBalance, SupplyPicture } from "@/lib/needs";

/**
 * The needs explorer: a ranked list of sector groups, and the supply picture behind
 * whichever one is selected.
 *
 * Selection is `shallow: true` and every sector's supply picture is rendered from props.
 * The alternative - refetching on each click - would round-trip the server to swap eight
 * table rows that were already computed. The filters ABOVE this component are the
 * opposite case and use `shallow: false`, because they change which rows exist at all.
 * That is the same split the explorer page draws between its tabs and its filters.
 *
 * No new palette is introduced here, deliberately. The two directions use the app-wide
 * flow pair through `CompareBar` - which carries the arrowheads, the full-sentence titles
 * and the aria labels that pair is only legal alongside - and the coverage meter uses the
 * already-validated single hue from `contextMeter`. A ranked list is not a reason to
 * invent a ninth colour.
 */
export function NeedsExplorer({
  ranked,
  pictures,
  contents,
  countryName,
  countryIso: _countryIso,
  lens,
  reporterIso,
}: {
  /** Already ordered by the server: the lens and sort live in the URL, above this. */
  ranked: SectorBalance[];
  /** One per ranked sector, keyed by code. Sent whole so selection never refetches. */
  pictures: Record<string, SupplyPicture>;
  /** HS chapters and example contents per sector. Nomenclature, never figures. */
  contents: Record<string, { hs: string; covers: string[] }>;
  countryName: string;
  countryIso: string;
  lens: "needs" | "supplies";
  reporterIso: string;
}) {
  const [selected, setSelected] = useQueryState("sector", {
    defaultValue: "",
    clearOnDefault: true,
    shallow: true,
  });

  const active = ranked.find((row) => row.code === selected) ?? ranked[0] ?? null;
  const picture = active ? pictures[active.code] : undefined;
  const inside = active ? contents[active.code] : undefined;

  const scale = pairScale(ranked);
  const buying = lens === "needs";

  if (!ranked.length) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-ink-secondary">
          {buying
            ? `${countryName} is not a net buyer of any sector group.`
            : `${countryName} is not a net seller of any sector group.`}
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-muted">
          A group needs BOTH sides reported before it can be placed on either side of the
          balance. Switch the lens above, or read the full sector mix on the country page -
          absent data is not zero.
        </p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-5">
      {/* ---- ranked list ---- */}
      <div className="min-w-0 lg:col-span-3">
        <ChartFrame
          title={buying ? `What ${countryName} buys more of than it sells` : `What ${countryName} sells more of than it buys`}
          subtitle="Click a group for the countries behind it"
          rows={ranked}
          columns={[
            { key: "sector", label: "Sector group", render: (row) => row.name },
            {
              key: "exports",
              label: "Sells",
              align: "right",
              render: (row) => (row.exports === null ? "-" : usd(row.exports)),
            },
            {
              key: "imports",
              label: "Buys",
              align: "right",
              render: (row) => (row.imports === null ? "-" : usd(row.imports)),
            },
            {
              key: "gap",
              label: buying ? "Buys more by" : "Sells more by",
              align: "right",
              render: (row) => (row.gap === null ? "-" : usd(Math.abs(row.gap))),
            },
            {
              key: "coverage",
              label: "Covers",
              align: "right",
              render: (row) => (row.coverage === null ? "-" : pct(row.coverage, 0)),
            },
            {
              key: "share",
              label: "Of import bill",
              align: "right",
              render: (row) => (row.importShare === null ? "-" : pct(row.importShare, 1)),
            },
          ]}
          footnote={`"Covers" is exports divided by imports in the group: 100% means ${countryName} sells as much of it as it buys. It is a customs ratio and knows nothing about what ${countryName} produces for itself.`}
        >
          <div>
            <CompareLegend
              className={`${COMPARE_TRACK_PAD} pb-2`}
              exportLabel={`${countryName} sells to the world`}
              importLabel={`${countryName} buys from the world`}
            />
            <ul>
              {ranked.map((row) => (
                <SectorRow
                  key={row.code}
                  row={row}
                  scale={scale}
                  countryName={countryName}
                  selected={active?.code === row.code}
                  onSelect={() => setSelected(row.code)}
                  buying={buying}
                />
              ))}
            </ul>
          </div>
        </ChartFrame>
      </div>

      {/* ---- supply picture for the selected group ---- */}
      <div className="min-w-0 lg:col-span-2">
        {active && picture ? (
          <SupplyDetail
            row={active}
            picture={picture}
            inside={inside}
            countryName={countryName}
            reporterIso={reporterIso}
            buying={buying}
          />
        ) : null}
      </div>
    </div>
  );
}

/** One sector group: both sides on a shared scale, then the derived readings under it. */
function SectorRow({
  row,
  scale,
  countryName,
  selected,
  onSelect,
  buying,
}: {
  row: SectorBalance;
  scale: number;
  countryName: string;
  selected: boolean;
  onSelect: () => void;
  buying: boolean;
}) {
  const { resolved } = useTheme();
  const flow = flowColors(resolved);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full border-b border-hairline/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-raised/60 ${
          selected ? "bg-raised/70" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <SectorIcon code={row.code} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs font-medium text-ink">{row.name}</span>
          </span>
          {/* The gap is the headline of this page, so it is printed in words as well as
              figures - "buys $133B more" cannot be misread the way a bare signed number
              beside two bars can. */}
          <span
            className="tabular shrink-0 text-2xs font-medium"
            style={{ color: buying ? flow.import : flow.export }}
          >
            {row.gap === null ? "-" : `${buying ? "buys" : "sells"} ${usd(Math.abs(row.gap))} more`}
          </span>
        </div>

        <div className="mt-1.5">
          <CompareBar
            exportValue={row.exports}
            importValue={row.imports}
            scale={scale}
            exportLabel={`${countryName} sells ${row.name.toLowerCase()} to the world`}
            importLabel={`${countryName} buys ${row.name.toLowerCase()} from the world`}
          />
        </div>

        <div className={`${COMPARE_TRACK_PAD} mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1`}>
          <CoverageMeter coverage={row.coverage} band={row.band} />
          {row.importShare !== null && (
            <span className="tabular text-[10px] text-ink-muted">
              {pct(row.importShare, 1)} of the import bill
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

/**
 * The coverage ratio as a bar, but only where a bar means something.
 *
 * 0-100% is a real proportion with a real ceiling: how much of what it buys it also
 * sells. Above 100 there is no ceiling at all - a country can sell forty times what it
 * buys - so that case prints the multiple and draws nothing, the same rule
 * `IndicatorMeter` applies to unbounded units and the reason a negative FDI figure is
 * never drawn as a clamped bar.
 *
 * One hue, from the already-validated `contextMeter` fill. Colour carries no magnitude
 * here; the bar length does.
 */
function CoverageMeter({
  coverage,
  band,
}: {
  coverage: number | null;
  band: { label: string; blurb: string } | null;
}) {
  const { resolved } = useTheme();
  const meter = contextMeter(resolved);

  if (coverage === null) {
    return <span className="text-[10px] text-ink-muted">Coverage not computable</span>;
  }

  if (coverage > 100) {
    return (
      <span className="tabular text-[10px] text-ink-muted" title={band?.blurb}>
        Sells {(coverage / 100).toFixed(1)}x what it buys
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1.5"
      title={`Covers ${coverage.toFixed(0)}% of what it buys in this group - it ${band?.blurb ?? ""}.`}
    >
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hairline" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(coverage, 1)}%`, background: meter.fill }}
        />
      </span>
      <span className="tabular text-[10px] text-ink-muted">
        covers {coverage.toFixed(0)}%
      </span>
      {band && <span className="text-[10px] text-ink-muted">· {band.label.toLowerCase()}</span>}
    </span>
  );
}

/** Who fills the selected gap, how concentrated they are, and what sits in the group. */
function SupplyDetail({
  row,
  picture,
  inside,
  countryName,
  reporterIso,
  buying,
}: {
  row: SectorBalance;
  picture: SupplyPicture;
  inside?: { hs: string; covers: string[] };
  countryName: string;
  reporterIso: string;
  buying: boolean;
}) {
  const top = picture.suppliers[0];
  const widest = picture.suppliers.reduce((max, s) => Math.max(max, s.value), 1);

  return (
    <section className="card" aria-labelledby="supply-detail">
      <div className="border-b border-hairline px-4 pb-2.5 pt-3.5">
        <h2 id="supply-detail" className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          <Users className="h-3 w-3" aria-hidden />
          Who supplies it
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink">
          <SectorIcon code={row.code} className="h-4 w-4 shrink-0" />
          {row.name}
        </p>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">
          {picture.supplierCount === 0
            ? `No partner reports selling this group to ${countryName}.`
            : `${picture.supplierCount} countries sell it to ${countryName}${
                buying ? "" : ", even though it is a net seller of the group"
              }.`}
        </p>
      </div>

      {/* Concentration: how exposed the gap is. Stated as a number AND in words - an HHI
          on its own means nothing to most readers. */}
      {picture.hhi !== null && (
        <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline">
          <div className="bg-surface px-4 py-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-muted">Concentration</div>
            <div className="tabular mt-0.5 text-lg font-semibold leading-none">
              {Math.round(picture.hhi)}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-ink-muted">
              {picture.hhi > 2500
                ? "A few suppliers carry it"
                : picture.hhi > 1500
                  ? "Moderately concentrated"
                  : "Spread across many suppliers"}
            </p>
          </div>
          <div className="bg-surface px-4 py-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-muted">Largest supplier</div>
            <div className="mt-0.5 truncate text-lg font-semibold leading-none">
              {top ? top.name : "-"}
            </div>
            <p className="tabular mt-1 text-[10px] leading-snug text-ink-muted">
              {picture.topShare === null ? "not reported" : `${pct(picture.topShare, 0)} of the group`}
            </p>
          </div>
        </div>
      )}

      <ul className="px-2 py-1.5">
        {picture.suppliers.map((supplier) => (
          <li key={supplier.iso}>
            <Link
              href={`/corridor/${supplier.iso}/${reporterIso}`}
              className="group block rounded-md px-2 py-1.5 transition-colors hover:bg-raised"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <CountryFlag iso2={supplier.iso2} name={supplier.name} size="sm" />
                  <span className="truncate text-xs text-ink-secondary group-hover:text-ink">
                    {supplier.name}
                  </span>
                  {/* Provenance rides on the row, never in a footnote: a BUYER figure is
                      this country's own customs record, not the seller's book. */}
                  {supplier.src === "importer" && (
                    <span
                      className="chip shrink-0 border border-hairline text-ink-muted"
                      title={`${supplier.name} publishes no export figures. This is ${countryName}'s own record of the same goods.`}
                    >
                      buyer
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0 text-2xs font-medium text-ink">
                  {usd(supplier.value)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-hairline" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-series-1"
                    style={{ width: `${(supplier.value / widest) * 100}%` }}
                  />
                </span>
                <span className="tabular w-16 shrink-0 text-right text-[10px] text-ink-muted">
                  {supplier.tariff === null ? "no rate" : `${pct(supplier.tariff)} duty`}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* The honest limit of "individual products". Chapters, not figures. */}
      {inside && (
        <div className="border-t border-hairline px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <PackageSearch className="h-3 w-3" aria-hidden />
            What is inside HS {inside.hs}
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {inside.covers.map((item) => (
              <li key={item} className="chip border border-hairline text-ink-secondary">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
            These name chapters of the Harmonized System and carry <strong>no figures</strong>.
            They are examples of what the group contains, not a ranked product list - this
            build publishes trade at the section-group tier only, so there is no figure for
            any single product inside it.
          </p>
        </div>
      )}

      <div className="border-t border-hairline px-4 py-2.5">
        <Link
          href={`/product/${encodeURIComponent(row.code)}`}
          className="flex items-center gap-1 text-xs text-series-1 hover:underline"
        >
          <Layers className="h-3 w-3" aria-hidden />
          The whole world market for {row.name.toLowerCase()}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
