"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeftRight,
  Globe2,
  Lightbulb,
  Loader2,
  Map as MapIcon,
  Package,
  Percent,
  Scale,
  Search,
  Database,
} from "lucide-react";
import { flagEmoji } from "@/lib/format";
import { startRouteProgress } from "@/lib/nav-progress";
import { SECTOR_CATALOG } from "@/lib/sectors";
import { ThemeToggle } from "./theme";

interface CountryRef {
  iso3: string;
  iso2: string | null;
  name: string;
}

type Hit =
  | { kind: "country"; iso3: string; iso2: string | null; name: string }
  | { kind: "sector"; code: string; name: string };

const NAV = [
  { href: "/", label: "Map", Icon: MapIcon },
  { href: "/opportunities", label: "Opportunities", Icon: Lightbulb },
  { href: "/tariffs", label: "Tariffs", Icon: Percent },
  { href: "/about/data", label: "Data", Icon: Database },
];

/**
 * Both lenses COMPARE exports against imports. There is deliberately no "exports only" or
 * "imports only" view: seeing one side without the other invites reading a big number as
 * a good number, and for trade the pair is the whole point.
 *   Volume  = exports + imports, how much a country trades
 *   Balance = exports - imports, which way the relationship leans
 */
const METRICS = [
  { id: "volume", label: "Total trade", Icon: ArrowLeftRight, hint: "Exports plus imports" },
  { id: "balance", label: "Balance", Icon: Scale, hint: "Exports minus imports" },
] as const;

/**
 * One search bar for everything, plus the map's metric switch.
 *
 * The metric lives up here rather than in a map rail because it is the single control
 * that changes what the whole map means, and putting it in the header frees the entire
 * canvas below.
 *
 * Search is also the keyboard-only path into every view, which is why the map is never
 * the sole route to a piece of information (docs/PRD.md §7).
 */
export function SiteHeader({ countries }: { countries: CountryRef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [navigating, startNavigation] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onMap = pathname === "/";
  const metric = searchParams.get("metric") ?? "volume";

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const countryHits: Hit[] = countries
      .filter((c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().startsWith(q))
      .sort((a, b) => {
        // Prefix matches rank above substring matches - typing "ind" should surface India
        // before "British Indian Ocean Territory".
        const aStarts = a.name.toLowerCase().startsWith(q) || a.iso3.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q) || b.iso3.toLowerCase().startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6)
      .map((c) => ({ kind: "country" as const, iso3: c.iso3, iso2: c.iso2, name: c.name }));

    const sectorHits: Hit[] = SECTOR_CATALOG.filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map((s) => ({ kind: "sector" as const, code: s.code, name: s.name }));

    return [...countryHits, ...sectorHits];
  }, [query, countries]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  /**
   * A country result SELECTS it on the map rather than jumping straight to its dashboard.
   * Selection keeps the reader in context - they see where the country is and who it
   * trades with - and the panel's "Detailed view" is one click from there.
   */
  const go = useCallback(
    (hit: Hit) => {
      setOpen(false);
      setQuery("");
      startRouteProgress();
      startNavigation(() => {
        if (hit.kind === "sector") {
          router.push(`/product/${encodeURIComponent(hit.code)}`);
          return;
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set("focus", hit.iso3);
        router.push(`/?${params.toString()}`);
      });
    },
    [router, searchParams],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (!hits.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(hits[cursor]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function setMetric(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "volume") params.delete("metric");
    else params.set("metric", id);
    startRouteProgress();
    startNavigation(() => router.push(`/${params.toString() ? `?${params}` : ""}`));
  }

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-plane/95 px-3 backdrop-blur lg:gap-4 lg:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-series-1/15">
          <Globe2 className="h-4 w-4 text-series-1" aria-hidden />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight sm:block">TradeCenter</span>
      </Link>

      {/* ---- search ---- */}
      <div ref={boxRef} className="relative max-w-sm flex-1">
        {navigating ? (
          <Loader2
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-series-1"
            aria-hidden
          />
        ) : (
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search countries or sectors..."
          aria-label="Search countries or sectors"
          aria-busy={navigating}
          aria-expanded={open && hits.length > 0}
          role="combobox"
          aria-controls="search-results"
          className="h-9 w-full rounded-lg border border-hairline bg-surface pl-9 pr-12 text-sm transition-colors placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-hairline px-1.5 py-0.5 text-2xs text-ink-muted sm:block">
          ⌘K
        </kbd>

        {open && hits.length > 0 && (
          <ul
            id="search-results"
            role="listbox"
            className="floating absolute left-0 right-0 top-11 overflow-hidden p-1"
          >
            {hits.map((hit, i) => (
              <li key={hit.kind === "country" ? hit.iso3 : hit.code}>
                <button
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(hit)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    i === cursor ? "bg-raised" : ""
                  }`}
                >
                  {hit.kind === "country" ? (
                    <>
                      <span aria-hidden>{flagEmoji(hit.iso2)}</span>
                      <span className="flex-1 truncate">{hit.name}</span>
                      <span className="tabular text-2xs text-ink-muted">{hit.iso3}</span>
                    </>
                  ) : (
                    <>
                      <Package className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                      <span className="flex-1 truncate">{hit.name}</span>
                      <span className="text-2xs text-ink-muted">sector</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- metric switch, map only ---- */}
      {onMap && (
        <div
          className="hidden items-center rounded-lg border border-hairline bg-plane p-0.5 md:flex"
          role="group"
          aria-label="Map metric"
        >
          {METRICS.map(({ id, label, Icon, hint }) => {
            const active = metric === id;
            return (
              <button
                key={id}
                onClick={() => setMetric(id)}
                aria-pressed={active}
                title={hint}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-series-1/15 font-medium text-series-1"
                    : "text-ink-secondary hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/*
        The four destinations used to sit as bare text in a 2px-gapped row next to the
        metric switch and the theme button, so "Map Opportunities Tariffs Data" read as
        one continuous strip and nobody could tell which words were the same control.
        Three fixes, all needed: the group gets its OWN inset container so its boundaries
        are visible, a rule separates it from the map controls to its left, and the
        current page is a raised pill with an accent icon rather than a slightly
        different grey. Loading feedback is NOT here - every one of these routes has a
        `loading.tsx`, so the transition commits instantly and a per-link spinner would
        never get a frame to render in. The top progress bar and the route skeleton do
        that job.
      */}
      <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
        <span className="hidden h-6 w-px bg-hairline sm:block" aria-hidden />

        <nav aria-label="Sections">
          <ul className="flex items-center gap-1 rounded-xl border border-hairline bg-plane p-1">
            {NAV.map(({ href, label, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={label}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors lg:px-3 ${
                      active
                        ? "bg-surface text-ink shadow-sm ring-1 ring-hairline"
                        : "text-ink-secondary hover:bg-raised hover:text-ink"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-series-1" : ""}`}
                      aria-hidden
                    />
                    <span className="hidden lg:inline">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <span className="hidden h-6 w-px bg-hairline sm:block" aria-hidden />
        <ThemeToggle />
      </div>
    </header>
  );
}
