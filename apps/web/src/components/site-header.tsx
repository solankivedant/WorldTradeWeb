"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeftRight,
  Compass,
  Globe2,
  Lightbulb,
  Loader2,
  Map as MapIcon,
  Percent,
  Scale,
  Search,
  Database,
  X,
} from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { SectorIcon } from "@/components/sector-icon";
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
  | { kind: "sector"; code: string; name: string; hs: string };

const NAV = [
  { href: "/", label: "Map", Icon: MapIcon },
  { href: "/explore", label: "Explore", Icon: Compass },
  { href: "/opportunities", label: "Opportunities", Icon: Lightbulb },
  { href: "/tariffs", label: "Tariffs", Icon: Percent },
  { href: "/source", label: "Source", Icon: Database },
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
  /**
   * Below xl the search field collapses to a square icon button and opens as an overlay
   * across the header row. A text input cannot shrink below its intrinsic size, so an
   * inline one held the whole header wider than a phone viewport - which is what pushed
   * the nav and the theme toggle off the right edge. The threshold is xl rather than lg
   * so the five destination links can carry their labels from lg up; see the note on the
   * nav below for why those labels win the contested space.
   */
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [navigating, startNavigation] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
      .map((s) => ({ kind: "sector" as const, code: s.code, name: s.name, hs: s.hs }));

    return [...countryHits, ...sectorHits];
  }, [query, countries]);

  useEffect(() => setCursor(0), [query]);

  // The collapsed field is not in the DOM until it expands, so focus has to wait a render.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as Node;
      // The trigger is outside the box: without this it would close on mousedown and
      // reopen on click, so the overlay could never be opened by tapping the button.
      if (boxRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      setExpanded(false);
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setExpanded(true);
        setOpen(true);
        inputRef.current?.focus();
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
      setExpanded(false);
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
    if (event.key === "Escape") {
      setOpen(false);
      setExpanded(false);
      return;
    }
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
    // Already `sticky`, which is a containing block for absolute children - that is what
    // the collapsed search overlay anchors to when it lies across the whole row.
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-plane/95 px-2 backdrop-blur sm:px-3 lg:gap-3 lg:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        {/* Sized up alongside the wordmark - a 28px badge read as an afterthought next to
            20px type once the name grew. */}
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1/15">
          <Globe2 className="h-[18px] w-[18px] text-series-1" aria-hidden />
        </span>
        {/* Hidden below sm: the name is long enough that on a phone it would crowd out
            the controls, and the badge alone already links home. */}
        <span className="hidden text-lg font-semibold tracking-tight sm:block lg:text-xl">
          WorldTradeWeb
        </span>
      </Link>

      {/*
        ---- search ----
        Two shapes, one control. Below lg it is a square icon button the same size as the
        theme toggle beside it, because an inline text field has an intrinsic minimum
        width it will not shrink past - that was what made the header wider than the
        viewport and pushed the nav and the toggle off the right edge. Tapping it expands
        the field across the row; at lg and up the field is simply always there.
      */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setExpanded(true);
          setOpen(true);
        }}
        aria-label="Search countries or sectors"
        aria-expanded={expanded}
        title="Search countries or sectors"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline text-ink-secondary transition-colors hover:bg-raised hover:text-ink xl:hidden"
      >
        {navigating ? (
          <Loader2 className="h-4 w-4 animate-spin text-series-1" aria-hidden />
        ) : (
          <Search className="h-4 w-4" aria-hidden />
        )}
      </button>

      <div
        ref={boxRef}
        className={
          expanded
            ? "absolute inset-x-2 top-2.5 z-30 sm:inset-x-3 xl:relative xl:inset-x-auto xl:top-auto xl:z-auto xl:max-w-sm xl:flex-1"
            : "relative hidden min-w-0 xl:block xl:max-w-sm xl:flex-1"
        }
      >
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
          className="h-9 w-full rounded-lg border border-hairline bg-surface pl-9 pr-10 text-sm shadow-sm transition-colors placeholder:text-ink-muted focus:border-series-1 focus:outline-none xl:pr-12 xl:shadow-none"
        />
        {/* The shortcut hint is only true where a keyboard is; the close button is only
            needed where the field is an overlay covering the rest of the header. */}
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-hairline px-1.5 py-0.5 text-2xs text-ink-muted xl:block">
          ⌘K
        </kbd>
        <button
          type="button"
          onClick={() => {
            // Dismissing the overlay drops the query with it. Reopening a field that is
            // gone from the screen and finding half of an old search still in it is the
            // kind of state that produces "no results" for no visible reason.
            setExpanded(false);
            setOpen(false);
            setQuery("");
          }}
          aria-label="Close search"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-raised hover:text-ink xl:hidden"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>

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
                      <CountryFlag iso2={hit.iso2} name={hit.name} size="sm" />
                      <span className="flex-1 truncate">{hit.name}</span>
                      <span className="tabular text-2xs text-ink-muted">{hit.iso3}</span>
                    </>
                  ) : (
                    <>
                      <SectorIcon code={hit.code} className="h-3.5 w-3.5" />
                      <span className="flex-1 truncate">{hit.name}</span>
                      <span className="tabular text-2xs text-ink-muted">HS {hit.hs}</span>
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
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
        <span className="hidden h-6 w-px bg-hairline sm:block" aria-hidden />

        <nav aria-label="Sections">
          <ul className="flex items-center gap-0.5 rounded-xl border border-hairline bg-plane p-1 sm:gap-1">
            {NAV.map(({ href, label, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={label}
                    className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm font-medium transition-colors sm:px-2 lg:px-3 ${
                      active
                        ? "bg-surface text-ink shadow-sm ring-1 ring-hairline"
                        : "text-ink-secondary hover:bg-raised hover:text-ink"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-series-1" : ""}`}
                      aria-hidden
                    />
                    {/* Labels appear from lg, and the search field now stays collapsed
                        until xl to pay for them. That trade is deliberate: search already
                        advertises itself with a magnifier glyph and a Cmd-K hint, while
                        five bare destination icons advertise nothing at all - and on a
                        touch device there is no hover title to fall back on. Between lg
                        and xl the old arrangement showed a text field and five unlabelled
                        icons, which is precisely backwards. */}
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
