"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The reader's shortlist of markets, kept across navigations.
 *
 * The opportunities page is a research tool: the useful session is "scan sixty, keep
 * four, go and look at those four". Every control on the page that narrows the list is a
 * server round-trip, so anything held in component state is gone the moment the reader
 * changes origin or sector - which is exactly when they have just found something worth
 * keeping. localStorage survives that, and the shortlist is a per-reader convenience with
 * no bearing on any figure, so it is the right home for it.
 *
 * It is deliberately NOT a URL param, unlike every filter on the page. A permalink is a
 * statement about what the data shows; a shortlist is a note about what one person is
 * thinking, and putting it in a shareable URL would confuse the two.
 *
 * `ready` exists because the server cannot know what is in a browser's storage. Anything
 * rendered from `items` before the first effect runs is a hydration mismatch - the same
 * trap the theme toggle hits - so callers render a deterministic placeholder until it
 * flips true.
 */

const KEY = "wtw.shortlist.v1";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Private windows and blocked site data throw on access, not just on write.
    return [];
  }
}

export function useShortlist() {
  const [items, setItems] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(read());
    setReady(true);
  }, []);

  const persist = useCallback((next: string[]) => {
    setItems(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked. The shortlist still works for this page view.
    }
  }, []);

  const toggle = useCallback(
    (id: string) => persist(items.includes(id) ? items.filter((v) => v !== id) : [...items, id]),
    [items, persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { items, ready, toggle, clear, has: (id: string) => items.includes(id) };
}

/** Stable id for one opportunity, used as the shortlist key and as a React key. */
export function opportunityId(origin: string, destination: string, sector: string): string {
  return `${origin}:${destination}:${sector}`;
}
