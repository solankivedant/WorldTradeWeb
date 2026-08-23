import type { Metadata } from "next";
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { FooterGate } from "@/components/footer-gate";
import { NavProgress } from "@/components/nav-progress";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider, ThemeScript } from "@/components/theme";
import { allCountries } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeCenter - global trade, mapped",
  description:
    "Interactive world map of import/export flows, tariffs, and product-level trade between countries, with a rule-based engine that surfaces trade opportunities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The search index is small (217 countries + 16 sectors) and static per build, so it
  // ships once with the shell rather than being fetched per keystroke.
  const countries = allCountries().map((c) => ({
    iso3: c.iso3,
    iso2: c.iso2,
    name: c.name,
  }));

  return (
    // suppressHydrationWarning: ThemeScript stamps data-theme on <html> before React
    // hydrates, so the server-rendered markup intentionally differs from the DOM here.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-plane text-ink antialiased">
        <ThemeProvider>
          <NuqsAdapter>
            <Suspense fallback={null}>
              <NavProgress />
            </Suspense>
            <div className="flex min-h-screen flex-col">
              <Suspense fallback={<div className="h-14 border-b border-hairline" />}>
                <SiteHeader countries={countries} />
              </Suspense>
              <main className="flex-1">{children}</main>
              <FooterGate>
                <SiteFooter />
              </FooterGate>
            </div>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
