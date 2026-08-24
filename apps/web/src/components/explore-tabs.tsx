"use client";

import { useQueryState } from "nuqs";
import { ArrowLeftRight, Layers, Route } from "lucide-react";
import { Segmented } from "@/components/segmented";

/**
 * The explorer's three panes.
 *
 * The page answers three different questions - what does the world trade, who trades with
 * whom, and how do two routes compare - and it used to answer all three at once in one
 * column about four screens tall. The comparison, which is the only thing on the page you
 * cannot get anywhere else in the app, sat at the bottom where most readers never reached
 * it.
 *
 * Each pane is a SERVER-rendered subtree handed in as a prop, so switching panes moves
 * already-rendered markup rather than refetching anything. That is why `shallow: true` is
 * correct here and wrong for every other control on this page: the filters change WHICH
 * rows exist and must re-run the server component, while this only changes which of the
 * rows already sent is on screen.
 *
 * It is still a URL param, so a pane is a permalink like every other piece of state in
 * this app (docs/DESIGN.md §2) - a link to a comparison opens on the comparison.
 */

const VIEWS = [
  {
    id: "sectors",
    label: "Sectors",
    Icon: Layers,
    hint: "Every HS section group, sized against each other",
  },
  {
    id: "connections",
    label: "Connections",
    Icon: Route,
    hint: "Ranked corridors under the current filters",
  },
  {
    id: "compare",
    label: "Compare",
    Icon: ArrowLeftRight,
    hint: "Any two connections side by side on one scale",
  },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function ExploreTabs({
  counts,
  sectors,
  connections,
  compare,
}: {
  /** Rows behind each pane, so the reader can see where the volume is before clicking. */
  counts: { sectors: number; connections: number };
  sectors: React.ReactNode;
  connections: React.ReactNode;
  compare: React.ReactNode;
}) {
  const [raw, setView] = useQueryState("view", { defaultValue: "sectors", shallow: true });
  const view: View = VIEWS.some((v) => v.id === raw) ? (raw as View) : "sectors";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Explorer view"
          value={view}
          onChange={(id) => setView(id === "sectors" ? null : id)}
          options={[
            { ...VIEWS[0], count: counts.sectors },
            { ...VIEWS[1], count: counts.connections },
            VIEWS[2],
          ]}
        />
        <p className="text-2xs text-ink-muted">
          Switching panes changes nothing about the figures - the filters above do that.
        </p>
      </div>

      {/*
        All three panes stay mounted and the inactive ones are hidden, so a table scrolled
        halfway down is still there when the reader comes back to it. `hidden` also keeps
        them out of the accessibility tree, which a CSS-only hide would not.
      */}
      <div className="mt-3" hidden={view !== "sectors"}>
        {sectors}
      </div>
      <div className="mt-3" hidden={view !== "connections"}>
        {connections}
      </div>
      <div className="mt-3" hidden={view !== "compare"}>
        {compare}
      </div>
    </div>
  );
}
