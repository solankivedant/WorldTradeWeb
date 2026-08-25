"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  MousePointerClick,
  PanelsTopLeft,
  Route,
  X,
} from "lucide-react";
import { ViewMap } from "@/components/view-map";
import { SECTOR_CATALOG } from "@/lib/sectors";
import type { Provenance } from "@/lib/types";

const SEEN_KEY = "wtw:intro-seen:v1";

/**
 * First-run orientation for the map.
 *
 * The map is the landing screen, and it used to open as a bare globe surrounded by seven
 * controls - a sector select, a metric switch, a year scrubber, four legends - with no
 * statement of what the thing was or what to do with it. That is the wrong first frame: a
 * reader meets the filters before they meet the subject, and a filter is meaningless
 * until you know what is being filtered.
 *
 * Three constraints shaped this:
 *
 * - It NEVER interrupts a permalink. `hasIntent` is true when the URL already names a
 *   country, a corridor or a sector, which means the reader followed a link to see one
 *   specific thing. Covering that with an introduction is the rudest possible greeting.
 * - It is dismissed permanently, and it stays REACHABLE. A one-shot overlay that cannot
 *   be summoned again is a help system you get exactly one chance to read.
 * - Nothing renders until `mounted`. The stored flag lives in localStorage, which the
 *   server cannot know; rendering the overlay on the server and removing it on hydration
 *   would flash it at every returning reader.
 *
 * State, trigger and dialog are three exports rather than one component, because they
 * cannot share a parent element. The trigger has no free corner of the canvas to sit in -
 * the country panel opens top-left and is draggable across the rest, the sector lens
 * holds top-right, and the connection panel docks down the whole right edge - so it
 * belongs to the footer, which is permanent chrome. A footer button cannot own state that
 * an overlay above the canvas has to read, hence the hook.
 */
export interface MapIntroState {
  /** False until localStorage has been read. Nothing intro-related renders before it. */
  mounted: boolean;
  open: boolean;
  show: () => void;
  dismiss: () => void;
}

export function useMapIntro(hasIntent: boolean): MapIntroState {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    let seen = true;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Private mode, or storage disabled. Treat it as seen rather than showing the
      // overlay on every single visit, which is worse than never showing it.
      seen = true;
    }
    if (!seen && !hasIntent) setOpen(true);
  }, [hasIntent]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to do - the overlay simply reappears next visit.
    }
  }, []);

  const show = useCallback(() => setOpen(true), []);

  return { mounted, open, show, dismiss };
}

/** The footer's way back into the guide. */
export function MapIntroTrigger({ onShow }: { onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      title="How to read this map"
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2 text-2xs font-medium text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
    >
      <BookOpen className="h-3.5 w-3.5 text-series-1" aria-hidden />
      <span aria-hidden className="hidden sm:inline">
        Guide
      </span>
      <span className="sr-only">How to read this map</span>
    </button>
  );
}

/**
 * The orientation dialog itself.
 *
 * Every figure it quotes is passed in from the live build. None is written into this file
 * - a hardcoded coverage number becomes a fabricated figure the moment the pipeline moves.
 */
export function MapIntroDialog({
  onDismiss,
  years,
  reportingCountries,
  meta,
}: {
  onDismiss: () => void;
  years: number[];
  /** Countries reporting for the year on screen. 0 until the first payload lands. */
  reportingCountries: number;
  meta: Provenance;
}) {
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  /**
   * Focus the dialog, not a control inside it.
   *
   * `autoFocus` on the primary button was worse than nothing on a phone: focusing an
   * element scrolls it into view, so the panel opened already scrolled past its own
   * title and the reader met the buttons before the sentence explaining them.
   * `preventScroll` keeps the panel where it was rendered, and focus still moves out of
   * the page behind so Escape and Tab land here.
   */
  useEffect(() => {
    shell.current?.focus({ preventScroll: true });
  }, []);

  const first = years[0];
  const last = years[years.length - 1];

  return (
    /*
      The overlay CENTRES the panel; it never scrolls itself.
      
      Centring an over-tall child inside a scroll container is the bug this replaces: with
      `align-items: center` the overflow spills equally in both directions, and the half
      that goes above the container's origin is not in its scroll range at all - so the
      title was unreachable no matter how far you scrolled, and the buttons were hidden
      behind the map footer. Capping the panel at `max-h-full` and scrolling its BODY
      keeps the top and the actions on screen at every height, which is what a reader
      needs from a panel whose whole job is to orient them.
    */
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-plane/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
    >
      <div
        ref={shell}
        tabIndex={-1}
        className="floating flex max-h-full w-full max-w-3xl flex-col overflow-hidden outline-none"
      >
        {/* ---- pinned head ---- */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2
              id="intro-title"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
            >
              World trade, mapped
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-secondary">
              What every country sells and buys, the routes between them, what
              those routes cost in tariffs, and where the unmet demand sits. One
              published build behind all of it, so any two screens can be
              compared.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/*
          ---- scrolling body ----
          `min-h-0` is load-bearing: a flex child's automatic minimum size is its content
          height, so without it this region refuses to shrink below its content and pushes
          the actions off the bottom instead of scrolling.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6">
          {/* Coverage, from the live build. A reader's first question about a dataset like
            this is how much of the world is actually in it. */}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact
              label="Reporting now"
              value={reportingCountries ? String(reportingCountries) : "-"}
              hint="countries, this year"
            />
            <Fact
              label="Sectors"
              value={String(SECTOR_CATALOG.length)}
              hint="HS section groups"
            />
            <Fact
              label="Years"
              value={first && last ? `${first}-${last}` : "-"}
              hint="the range the source covers"
            />
            {/* Vintage is the VALUE and the source list the hint, not the other way round.
              `meta.source` is every dataset in the build joined together, so as a headline
              it ran to four lines and stretched the whole row; the vintage is the shorter
              string and the one that actually identifies which figures these are. */}
            <Fact label="Build" value={meta.vintage} hint={meta.source} />
          </dl>

          {/* ---- the three interactions this canvas supports ---- */}
          <h3 className="mt-5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Reading the map
          </h3>
          <ol className="mt-2 grid gap-2 sm:grid-cols-3">
            <Step
              n={1}
              Icon={MousePointerClick}
              title="Click a country"
              body="Its biggest flows draw on the globe - green leaving, red arriving, each with an arrowhead and a value."
            />
            <Step
              n={2}
              Icon={Route}
              title="Click a flow line"
              body="That connection opens on its own, showing both directions rather than only the one you clicked."
            />
            <Step
              n={3}
              Icon={PanelsTopLeft}
              title="Open the full view"
              body="Either panel links through to the dashboard behind it, where the same figures get thirteen years of context."
            />
          </ol>

          <h3 className="mt-5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            How the rest of the site fits together
          </h3>
          <div className="mt-2">
            <ViewMap compact />
          </div>
        </div>

        {/* ---- pinned actions ---- */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center gap-1.5 rounded-lg bg-series-1 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Start exploring
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <Link
            href="/explore"
            onClick={onDismiss}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
          >
            Skip the map, list everything
          </Link>
          <span className="hidden text-2xs text-ink-muted sm:block">
            Reopen it any time from &quot;Guide&quot;, bottom left.
          </span>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-plane px-3 py-2">
      <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      {/* Wraps rather than truncating: the source name is the one value here a reader may
          not already know, so clipping it to "World Bank WITS ..." hides the half that
          identifies it. */}
      <dd className="mt-0.5 break-words text-sm font-semibold leading-tight sm:text-base">
        {value}
      </dd>
      <dd className="text-2xs text-ink-muted">{hint}</dd>
    </div>
  );
}

function Step({
  n,
  Icon,
  title,
  body,
}: {
  n: number;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-lg border border-hairline bg-plane p-3">
      <div className="flex items-center gap-2">
        <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-series-1/15 text-2xs font-semibold text-series-1">
          {n}
        </span>
        <Icon className="h-3.5 w-3.5 text-ink-muted" />
        <span className="text-xs font-medium text-ink">{title}</span>
      </div>
      <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">{body}</p>
    </li>
  );
}
