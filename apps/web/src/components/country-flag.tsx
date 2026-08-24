/**
 * A country flag, as a real image.
 *
 * This replaces `flagEmoji`, which built a regional-indicator pair and relied on the OS
 * font to draw it. Windows ships no flag glyphs at all, so every flag in the product
 * degraded to a bare two-letter code - which is exactly what a reader sees in the
 * screenshots this component was written to fix. The SVGs are served from
 * `public/flags/` (see `scripts/fetch-flags.mjs`), so nothing here reaches an external
 * host at runtime.
 *
 * No `next/image`: these are tiny static SVGs at a fixed size, so the optimizer has
 * nothing to do and would only add a request hop per flag in a 200-row table.
 *
 * Server-component safe on purpose - it renders in tables built on the server. The
 * missing-flag case (a territory with no published flag, e.g. the Channel Islands)
 * falls back to the ISO code rather than an empty box, and CSS alone handles it: an
 * `onError` handler would force every consumer into a client component.
 */

const SIZES = {
  sm: { w: 18, h: 13, text: "text-[7px]" },
  md: { w: 22, h: 16, text: "text-[8px]" },
  lg: { w: 30, h: 22, text: "text-[10px]" },
  xl: { w: 40, h: 30, text: "text-[12px]" },
} as const;

export type FlagSize = keyof typeof SIZES;

export function CountryFlag({
  iso2,
  name,
  size = "md",
  className = "",
}: {
  iso2: string | null | undefined;
  /** Used for the tooltip only. The visible country name always sits beside the flag. */
  name?: string;
  size?: FlagSize;
  className?: string;
}) {
  const { w, h, text } = SIZES[size];
  const code = iso2 && iso2.length === 2 ? iso2.toLowerCase() : null;

  // Shared box so present and missing flags occupy identical space and lists stay aligned.
  const box = `inline-block shrink-0 rounded-[2px] ring-1 ring-inset ring-hairline ${className}`;
  const style = { width: w, height: h } as const;

  if (!code) {
    return (
      <span
        className={`${box} ${text} grid place-items-center bg-raised font-semibold uppercase leading-none tracking-tight text-ink-muted`}
        style={style}
        title={name}
        aria-hidden
      >
        {(iso2 ?? "").slice(0, 2) || "?"}
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/flags/${code}.svg`}
      alt=""
      title={name}
      width={w}
      height={h}
      loading="lazy"
      decoding="async"
      className={`${box} bg-raised object-cover`}
      style={style}
    />
  );
}
