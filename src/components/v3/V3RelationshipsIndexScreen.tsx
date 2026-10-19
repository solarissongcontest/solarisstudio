import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import type { V3RelationshipPairSummary } from "@/lib/v3-relationships";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3Surface,
} from "./V3Foundation";

const TABS = [
  { value: "all", label: "All" },
  { value: "alliances", label: "Strong support" },
  { value: "rivalries", label: "Close rivals" },
  { value: "one-sided", label: "One-sided" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export function V3RelationshipsIndexScreen({
  pairs,
}: {
  pairs: readonly V3RelationshipPairSummary[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = pairs.filter(
      ({ a, b }) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        a.shortCode.toLowerCase().includes(q) ||
        b.shortCode.toLowerCase().includes(q),
    );

    if (tab === "alliances") {
      rows = [...rows].sort((a, b) => b.friendshipScore - a.friendshipScore);
    } else if (tab === "rivalries") {
      rows = [...rows].sort((a, b) => b.rivalryScore - a.rivalryScore);
    } else if (tab === "one-sided") {
      rows = rows
        .filter((row) => row.oneSidedGap >= 15)
        .sort((a, b) => b.oneSidedGap - a.oneSidedGap);
    } else {
      rows = [...rows].sort((a, b) => b.sharedEditions - a.sharedEditions);
    }

    return rows;
  }, [pairs, query, tab]);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Voting patterns"
        title="Voting relationships"
        description="Compare repeated public support and competitive history between countries. These scores describe archive patterns, not motive or coordinated voting."
        editorial
      />

      <V3Surface level="raised" className="p-5">
        <p className="v3-kicker">What the scores mean</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Guide
            title="Support"
            text="Two-way support adjusted for how often both countries had a published opportunity to vote for one another."
          />
          <Guide
            title="Rivalry"
            text="How closely their published competitive positions have matched. A high score does not mean hostility."
          />
          <Guide
            title="One-sided gap"
            text="The difference between normalized support in each direction. It describes imbalance, not intent."
          />
        </div>
      </V3Surface>

      <V3Section title="Explore relationships" meta={`${pairs.length} pairs`}>
        <V3Surface className="p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <label className="sr-only" htmlFor="v3-relationship-search">
              Search a country
            </label>
            <input
              id="v3-relationship-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a country…"
              className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20"
            />
            <div
              className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Relationship type"
            >
              {TABS.map((option) => {
                const selected = tab === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTab(option.value)}
                    className="min-h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition"
                    style={{
                      borderColor: selected
                        ? "var(--v3-border-strong)"
                        : "var(--v3-border-subtle)",
                      background: selected
                        ? "var(--v3-bg-raised)"
                        : "rgba(255,255,255,0.02)",
                      color: selected
                        ? "var(--v3-text-primary)"
                        : "var(--v3-text-secondary)",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </V3Surface>

        {filtered.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.slice(0, 40).map((row) => (
              <Link
                key={row.key}
                to="/relationships/$pair"
                params={{ pair: row.pairParam }}
                className="block rounded-[var(--v3-radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <V3Surface level="raised" className="p-4 transition hover:bg-white/[0.045]">
                  <div className="flex items-center gap-3">
                    <FlagChip
                      code={row.a.shortCode}
                      color={row.a.accentColor}
                      image={row.a.flagImage}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {row.a.name}
                    </span>
                    <span className="text-xs text-white/35">vs</span>
                    <FlagChip
                      code={row.b.shortCode}
                      color={row.b.accentColor}
                      image={row.b.flagImage}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
                      {row.b.name}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-3">
                    <Metric label="Shared" value={row.sharedEditions} />
                    <Metric label="Support" value={`${row.friendshipScore.toFixed(0)}%`} />
                    <Metric
                      label={tab === "one-sided" ? "Gap" : "Rivalry"}
                      value={`${(
                        tab === "one-sided" ? row.oneSidedGap : row.rivalryScore
                      ).toFixed(0)}%`}
                    />
                  </div>
                </V3Surface>
              </Link>
            ))}
          </div>
        ) : (
          <V3Surface className="p-5">
            <div role="status" data-v3-relationships-empty="">
              <p className="text-sm font-semibold">No relationships match this view</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Only country pairs with shared public participation history are included.
              </p>
            </div>
          </V3Surface>
        )}
      </V3Section>
    </V3Screen>
  );
}

function Guide({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[0.7rem] leading-5 text-white/45">{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wide text-white/38">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
