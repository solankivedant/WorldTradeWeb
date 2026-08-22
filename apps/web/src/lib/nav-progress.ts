/**
 * Route-transition progress, as a module-level emitter.
 *
 * The App Router exposes no navigation events, and `useLinkStatus` only landed in Next
 * 15.3 (this app is on 15.1). So a navigation is detected two ways: anchor clicks are
 * caught globally by the progress bar itself, and programmatic pushes call
 * `startRouteProgress()` directly. A select that rewrites the URL is a navigation the
 * reader deserves feedback for exactly as much as a link is - the whole point of the bar
 * is that nothing in this app ever changes silently after a click.
 *
 * Client-only by use, not by directive: it holds no React state, so it can be imported
 * from any client module without pulling a boundary along with it.
 */

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();

export function subscribeRouteProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startRouteProgress(): void {
  for (const listener of listeners) listener(true);
}

export function stopRouteProgress(): void {
  for (const listener of listeners) listener(false);
}
