"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeChoice = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tradecenter-theme";

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: "light",
  resolved: "light",
  setChoice: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/**
 * Blocking script that stamps the theme on <html> before first paint.
 *
 * This has to run synchronously in <head>. React hydration happens well after the browser
 * paints, so doing it in an effect produces a visible flash of the wrong theme on every
 * navigation - worse in dark mode, where the page flashes white.
 *
 * Kept in sync with the CSS by contract: `data-theme` absent means "follow the OS", which
 * is exactly what the `prefers-color-scheme` block in globals.css handles.
 */
export function ThemeScript() {
  // Only two states, so the attribute is ALWAYS stamped. With no "system" option the OS
  // preference is not consulted at all, and light is the product default: a first-time
  // visitor opening a shared link gets light, and only an explicit toggle stores "dark".
  //
  // The comparison tests for "dark" rather than defaulting to it, so any other stored
  // value - absent, corrupted, or a leftover "system" from the three-state version -
  // falls through to light rather than to the wrong theme.
  const script = `(function(){try{var c=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});document.documentElement.setAttribute("data-theme",c==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("light");

  // Read the stored choice once mounted. The blocking script already applied it to the
  // DOM; this only syncs React's copy so the toggle renders the right active state.
  //
  // Must mirror the script's comparison exactly - test for "dark", default to light - or
  // the toggle's icon disagrees with the theme actually painted.
  useEffect(() => {
    let stored: ThemeChoice = "light";
    try {
      if (localStorage.getItem(STORAGE_KEY) === "dark") stored = "dark";
    } catch {
      // Private browsing or blocked storage - light is the default, so nothing to do.
    }
    setChoiceState(stored);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable - the choice still applies for this page view.
    }
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  return (
    <ThemeContext.Provider value={{ choice, resolved: choice, setChoice }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Two-state switch. Shows the theme you would switch TO, which is the usual convention.
 *
 * Everything theme-dependent is gated behind `mounted`. The server cannot know the stored
 * choice, so rendering the real label on the first pass guarantees a hydration mismatch on
 * the button's `title` and `aria-label` - React reconciles children but explicitly does
 * NOT patch up mismatched attributes. Rendering a fixed placeholder first is deterministic
 * on both sides and swaps to the real control one frame later.
 */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shell =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-ink-secondary transition-colors hover:bg-raised hover:text-ink";

  if (!mounted) {
    return (
      <span className={shell} aria-hidden>
        <Moon className="h-4 w-4 opacity-0" />
      </span>
    );
  }

  const next: ThemeChoice = choice === "dark" ? "light" : "dark";
  const Icon = choice === "dark" ? Sun : Moon;

  return (
    <button
      onClick={() => setChoice(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className={shell}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
