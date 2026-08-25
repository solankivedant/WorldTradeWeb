"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";

/**
 * A country chooser you can type into.
 *
 * Every country control in this app used to be a native `select` over 190 options. On a
 * corridor comparison that is four of them in a row, and picking Vietnam meant scrolling
 * a 190-row list past every country on earth - or knowing that typing "v" repeatedly
 * cycles the V's, which nobody does. The header search already proved the pattern that
 * works here: type a few letters, arrow to the row, press enter.
 *
 * Prefix matches rank above substring matches for the same reason they do in the header -
 * typing "ind" must surface India before "British Indian Ocean Territory". The ISO3 is
 * matched too, because a reader who knows the code is faster typing it than the name.
 *
 * Selection is committed through `onChange` rather than held here, so the caller stays the
 * single owner of the value - which on both pages is a URL search param, not local state.
 */

export interface PickerCountry {
  iso3: string;
  iso2?: string | null;
  name: string;
}

export function CountryPicker({
  countries,
  value,
  onChange,
  label,
  placeholder = "Pick a country",
  allowClear = true,
  className = "",
}: {
  countries: PickerCountry[];
  value: string;
  onChange: (iso3: string) => void;
  /** Accessible name. Every page here has two or more pickers, so this is required. */
  label: string;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => countries.find((c) => c.iso3 === value) ?? null,
    [countries, value],
  );

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries
      .filter((c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) || a.iso3.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q) || b.iso3.toLowerCase().startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [countries, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Keyboard navigation is useless if the highlighted row is below the fold.
  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  function commit(iso3: string) {
    onChange(iso3);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
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
      commit(hits[cursor].iso3);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-1.5 rounded-md border border-hairline bg-plane px-2 text-left text-sm transition-colors hover:border-baseline focus:border-series-1 focus:outline-none"
      >
        {selected ? (
          <>
            <CountryFlag iso2={selected.iso2 ?? null} name={selected.name} size="sm" />
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-ink-muted">{placeholder}</span>
        )}
        {allowClear && selected ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              commit("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                commit("");
              }
            }}
            className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-3 w-3" aria-hidden />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        )}
      </button>

      {/* The panel matches the trigger's width on a phone, where the controls run the
          full width of the card anyway. A fixed 17rem panel hanging off a narrower
          trigger fell off the right edge of the viewport. */}
      {open && (
        <div className="floating absolute left-0 z-50 mt-1 w-full min-w-[13rem] overflow-hidden sm:w-[17rem]">
          <div className="relative border-b border-hairline">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a name or ISO code..."
              aria-label={`Search: ${label}`}
              aria-controls={listId}
              className="h-9 w-full bg-transparent pl-8 pr-2 text-sm placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-ink-muted">
              No country matches that.
            </p>
          ) : (
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label={label}
              className="max-h-64 overflow-auto p-1"
            >
              {hits.map((c, i) => {
                const on = c.iso3 === value;
                return (
                  <li key={c.iso3}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-active={i === cursor}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => commit(c.iso3)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        i === cursor ? "bg-raised" : ""
                      }`}
                    >
                      <CountryFlag iso2={c.iso2 ?? null} name={c.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {on ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-series-1" aria-hidden />
                      ) : (
                        <span className="tabular shrink-0 text-2xs text-ink-muted">{c.iso3}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
