"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Click-to-expand wrapper, extracted from the opportunity card's original hand-rolled
 * pattern so every "show the working" disclosure in the app looks and behaves the same
 * way. Two variants because a disclosure sometimes reads as its own card-footer block
 * (`panel`, e.g. a score breakdown) and sometimes has to sit inline inside a paragraph
 * (`inline`, e.g. "show the full derivation method" mid-sentence) - a chevron and a
 * shaded background belong on the first and would look like a stray button on the second.
 */
export function Disclosure({
  prompt,
  children,
  variant = "panel",
  defaultOpen = false,
}: {
  /** What's being revealed, e.g. "how this scored 71" -> "Show how this scored 71". */
  prompt: string;
  children: React.ReactNode;
  variant?: "panel" | "inline";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (variant === "inline") {
    return (
      <span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-2xs text-series-1 hover:underline"
        >
          {open ? "Hide " : "Show "}
          {prompt}
        </button>
        {open && (
          <span className="mt-1.5 block border-l border-hairline pl-3">{children}</span>
        )}
      </span>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-2xs font-medium text-ink-secondary hover:bg-raised hover:text-ink"
      >
        <span>
          {open ? "Hide " : "Show "}
          {prompt}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="border-t border-hairline bg-plane/50 px-4 py-3">{children}</div>}
    </div>
  );
}
