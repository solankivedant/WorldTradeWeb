import Image from "next/image";
import { Github, Linkedin } from "lucide-react";

const LINKEDIN_URL = "https://www.linkedin.com/in/solanki-vedant/";
const SOURCE_URL = "https://github.com/solankivedant/WorldTradeWeb";

/**
 * Authorship band that closes every page except the map.
 *
 * The map is excluded because it is the one full-bleed view in the product: the canvas is
 * sized to the viewport and owns its own footer (`map-footer.tsx`) for the year scrubber
 * and legends. A second footer below it would either push the canvas out of the viewport
 * or stack two unrelated footers on top of each other. The exclusion is enforced in
 * `footer-gate.tsx` rather than here so this stays a server component.
 *
 * Colours come from the same tokens as everything else, so the band follows the theme
 * toggle rather than pinning itself to one mode.
 */
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-hairline bg-surface">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <Image
            src="/vedant-solanki.jpg"
            alt=""
            width={96}
            height={96}
            className="h-16 w-16 shrink-0 rounded-full border border-hairline object-cover sm:h-[88px] sm:w-[88px]"
          />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              Built &amp; managed by
            </p>
            {/* Serif here on purpose: it is the one piece of text on the page that is a
                name rather than a figure, and the contrast with the tabular sans used for
                every trade number keeps it from reading as data. */}
            <p className="mt-0.5 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
              Vedant Solanki
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <FooterLink href={LINKEDIN_URL} label="LinkedIn">
            <Linkedin className="h-4 w-4" aria-hidden />
          </FooterLink>
          <FooterLink href={SOURCE_URL} label="Source on GitHub">
            <Github className="h-4 w-4" aria-hidden />
          </FooterLink>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      // noreferrer as well as noopener: the older opener behaviour is the security half,
      // but a referrer leaks which dashboard the reader came from to a third party.
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border border-hairline px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
    >
      {children}
      {label}
    </a>
  );
}
