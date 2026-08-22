"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { startRouteProgress, subscribeRouteProgress } from "@/lib/nav-progress";

/** Never reaches 100 on its own - the arrival of the new route is what completes it. */
const CEILING = 92;
/** A navigation that never resolves must not leave a bar pinned to the top forever. */
const SAFETY_MS = 12_000;

/**
 * Top-of-viewport route progress.
 *
 * Server-rendered pages here read tens of MB of published JSON and score every
 * destination market on request, so a click can take a beat. Without an immediate
 * acknowledgement the reader cannot tell a slow page from a dead button, and clicks it
 * again. The bar is deliberately the FIRST thing that happens on any navigation: it
 * starts on the click itself, not once React has begun rendering the next route.
 *
 * It pairs with the per-route `loading.tsx` skeletons. The bar says "something is
 * opening"; the skeleton says "here is the shape of what is opening".
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; done?: ReturnType<typeof setTimeout>; safety?: ReturnType<typeof setTimeout> }>({});

  const clearTimers = useCallback(() => {
    if (timers.current.tick) clearInterval(timers.current.tick);
    if (timers.current.done) clearTimeout(timers.current.done);
    if (timers.current.safety) clearTimeout(timers.current.safety);
    timers.current = {};
  }, []);

  const begin = useCallback(() => {
    clearTimers();
    setActive(true);
    setProgress(8);
    // Decelerating creep: fast at the start where the reader is looking, asymptotic
    // near the ceiling so a slow route never looks stalled at a fixed width.
    timers.current.tick = setInterval(() => {
      setProgress((p) => (p >= CEILING ? p : p + Math.max(0.4, (CEILING - p) * 0.08)));
    }, 90);
    timers.current.safety = setTimeout(() => {
      clearTimers();
      setActive(false);
      setProgress(0);
    }, SAFETY_MS);
  }, [clearTimers]);

  const finish = useCallback(() => {
    if (timers.current.tick) clearInterval(timers.current.tick);
    if (timers.current.safety) clearTimeout(timers.current.safety);
    setProgress(100);
    timers.current.done = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 260);
  }, []);

  useEffect(() => subscribeRouteProgress((on) => (on ? begin() : finish())), [begin, finish]);

  /**
   * Global click capture rather than a wrapped Link component, so a plain <a> anywhere -
   * including inside a chart, a table cell, or a card someone adds later - gets the same
   * feedback without having to remember to opt in.
   */
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // Same destination is not a navigation - it would leave the bar with nothing to
      // wait for, and the safety timeout would be the only thing to clear it.
      if (next.pathname + next.search === window.location.pathname + window.location.search) return;

      startRouteProgress();
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // The new route's URL landing is the completion signal. Shallow URL writes (the map's
  // year scrubber) also land here and harmlessly finish a bar that was never started.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      role="progressbar"
      aria-label="Loading page"
      aria-busy="true"
    >
      <div
        className="h-full bg-series-1 transition-[width] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          boxShadow: "0 0 8px rgb(var(--series-1) / 0.7), 0 0 2px rgb(var(--series-1))",
        }}
      />
    </div>
  );
}
