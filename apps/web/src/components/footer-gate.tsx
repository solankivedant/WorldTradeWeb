"use client";

import { usePathname } from "next/navigation";

/**
 * Hides its children on the map route.
 *
 * The alternative was pasting <SiteFooter /> into all six dashboard pages, which puts the
 * burden on whoever adds the seventh. Gating in the layout instead makes the footer the
 * default for every route and the map the single documented exception - see the note in
 * `site-footer.tsx` for why the map cannot carry it.
 *
 * This is the only client code involved: `children` is rendered on the server and passed
 * through, so the footer's markup and the photo never ship as JS.
 */
export function FooterGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <>{children}</>;
}
