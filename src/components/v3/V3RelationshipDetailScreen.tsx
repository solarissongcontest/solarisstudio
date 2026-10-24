import { Link } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FlagChip } from "@/components/FlagChip";
import type {
  V3RelationshipCountry,
  V3RelationshipDetailBundle,
} from "@/lib/v3-relationships";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export function V3RelationshipDetailScreen({
  bundle,
}: {
  bundle: Exclude<V3RelationshipDetailBundle, null>;
}) {
  const { a, b, relationship, headToHead, sharedEditions } = bundle;
  const chartData = relationship.timeline.map((point) => ({
    edition: point.label,
    aToB: point.normalizedAtoB,
    bToA: point.normalizedBtoA,
  }));
  const newestSharedEdition = sharedEditions[0] ?? null;
  const oldestSharedEdition = sharedEditions[sharedEditions.length - 1] ?? null;
  const coverageLabel =
    oldestSharedEdition && newestSharedEdition
      ? oldestSharedEdition.id === newestSharedEdition.id
        ? oldestSharedEdition.label
        : `${oldestSharedEdition.label} to ${newestSharedEdition.label}`
      : "No shared public editions";

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker={`${sharedEditions.length} shared edition${sharedEditions.length === 1 ? "" : "s"}`}
        title={`${a.name} vs ${b.name}`}
        description="A statistical view of published performance and support history. These labels describe archive patterns, not intent or personal relationships."
        editorial
      />

      <V3Surface level="raised" className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <CountryLink country={a} />
          <span className="text-xs uppercase tracking-wider text-white/35">vs</span>
          <CountryLink country={b} align="right" />
        </div>
      </V3Surface>

      <V3Section title="Relationship overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Shared editions" value={relationship.participationsTogether} />
          <Stat label="Support score" value={relationship.friendshipScore.toFixed(0)} />
          <Stat label="Reciprocity" value={relationship.reciprocityScore.toFixed(0)} />
          <V3Surface className="p-4">
            <p className="text-[0.65rem] uppercase tracking-wide text-white/38">Trend</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold capitalize">{relationship.relationshipTrend}</p>
              <V3StatusChip tone="neutral">
                {relationship.sampleConfidence} confidence
              </V3StatusChip>
            </div>
          </V3Surface>
        </div>
      </V3Section>

      <V3Surface level="raised" className="p-5">
        <p className="v3-kicker">Score guide</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Guide
            title="Support score"
            text="Two-way support normalized against the maximum points available in each published voting system."
          />
          <Guide
            title="Reciprocity"
            text="How balanced support is in both directions. A high number means the historical pattern is more mutual."
          />
          <Guide
            title="Sample confidence"
            text="How much shared published voting history exists behind the score. More opportunities increase confidence."
          />
        </div>
      </V3Surface>

      <V3Section title="Methodology & limitations">
        <div className="grid gap-3 md:grid-cols-2">
          <V3Surface className="p-4">
            <p className="v3-kicker">Included sample</p>
            <p className="mt-2 text-sm font-semibold">{coverageLabel}</p>
            <p className="mt-2 text-xs leading-5 text-white/48">
              {sharedEditions.length} shared public edition{sharedEditions.length === 1 ? "" : "s"}; {relationship.opportunitiesAtoB} published voting opportunit{relationship.opportunitiesAtoB === 1 ? "y" : "ies"} {a.shortCode} → {b.shortCode} and {relationship.opportunitiesBtoA} {b.shortCode} → {a.shortCode}.
            </p>
          </V3Surface>
          <V3Surface className="p-4">
            <p className="v3-kicker">Publication boundary</p>
            <p className="mt-2 text-xs leading-5 text-white/48">
              Result comparisons use canonically published result layers. Support metrics and the timeline use only detailed voting that is officially public. Unpublished or missing detail is omitted, never treated as zero.
            </p>
          </V3Surface>
          <V3Surface className="p-4">
            <p className="v3-kicker">Sample size</p>
            <p className="mt-2 text-xs leading-5 text-white/48">
              There is no hard minimum sample threshold for showing a relationship. The displayed {relationship.sampleConfidence} confidence describes how much usable shared history exists, so small samples can move sharply when another edition is published.
            </p>
          </V3Surface>
          <V3Surface className="p-4">
            <p className="v3-kicker">Interpretation</p>
            <p className="mt-2 text-xs leading-5 text-white/48">
              These are normalized archive patterns, not evidence of intent, favoritism, coordination or personal relationships. Voting systems and historical coverage vary between eras even when scores are normalized against the points available at the time.
            </p>
          </V3Surface>
        </div>
      </V3Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <V3Section title="Support over time">
          <V3Surface className="p-4">
            {chartData.length ? (
              <div className="h-[260px]" aria-label="Normalized support over time">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="edition"
                      stroke="rgba(255,255,255,0.45)"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.45)"
                      fontSize={11}
                      allowDecimals={false}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--v3-bg-raised)",
                        border: "1px solid var(--v3-border-subtle)",
                        borderRadius: 14,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="aToB"
                      name={`${a.shortCode} → ${b.shortCode}`}
                      stroke="var(--jury)"
                      strokeWidth={3}
                      dot
                    />
                    <Line
                      type="monotone"
                      dataKey="bToA"
                      name={`${b.shortCode} → ${a.shortCode}`}
                      stroke="var(--televote)"
                      strokeWidth={3}
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div role="status">
                <p className="text-sm font-semibold">No exchanged public jury points yet</p>
                <p className="mt-1 text-xs leading-5 text-white/48">
                  The chart appears only from voting detail that has been officially published.
                </p>
              </div>
            )}
          </V3Surface>
        </V3Section>

        <V3Section title="Head-to-head">
          <V3Surface className="divide-y divide-white/[0.07] px-4">
            <Row label={`${a.name} finished higher`} value={headToHead.aWins} />
            <Row label={`${b.name} finished higher`} value={headToHead.bWins} />
            <Row label="Ties" value={headToHead.ties} />
            <Row label="Average placement gap" value={headToHead.avgDiff?.toFixed(1) ?? "—"} />
            <Row
              label={`${a.shortCode} → ${b.shortCode}`}
              value={`${relationship.totalAtoB} pts / ${relationship.expectedAtoB.toFixed(1)} expected`}
            />
            <Row
              label={`${b.shortCode} → ${a.shortCode}`}
              value={`${relationship.totalBtoA} pts / ${relationship.expectedBtoA.toFixed(1)} expected`}
            />
            <Row
              label={`${a.shortCode} support frequency`}
              value={
                relationship.persistenceAtoB != null
                  ? `${relationship.persistenceAtoB.toFixed(0)}%`
                  : "—"
              }
            />
            <Row
              label={`${b.shortCode} support frequency`}
              value={
                relationship.persistenceBtoA != null
                  ? `${relationship.persistenceBtoA.toFixed(0)}%`
                  : "—"
              }
            />
          </V3Surface>
        </V3Section>
      </div>

      <V3Section title="Relationship milestones">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="First top score"
            value={
              relationship.firstTopScore
                ? `SSC ${relationship.firstTopScore.editionNumber ?? "—"}`
                : "Not yet"
            }
          />
          <Stat
            label="100 exchanged points"
            value={
              relationship.hundredPointMilestone != null
                ? `SSC ${relationship.hundredPointMilestone}`
                : "Not yet"
            }
          />
          <Stat
            label="Longest support run"
            value={`${relationship.longestSupportRun} edition${
              relationship.longestSupportRun === 1 ? "" : "s"
            }`}
          />
        </div>
      </V3Section>

      <V3Section title="Shared editions">
        <V3Surface className="p-4">
          {sharedEditions.length ? (
            <div className="flex flex-wrap gap-2">
              {sharedEditions.map((edition) => (
                <Link
                  key={edition.id}
                  to="/editions/$slug"
                  params={{ slug: edition.slug }}
                  className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-xs font-semibold transition hover:bg-white/[0.05]"
                >
                  {edition.label}
                </Link>
              ))}
            </div>
          ) : (
            <p role="status" className="text-sm text-white/48">No shared public editions.</p>
          )}
        </V3Surface>
      </V3Section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/compare"
          search={{ a: a.shortCode, b: b.shortCode }}
          className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-4 py-3 text-sm font-semibold"
        >
          Open full comparison
        </Link>
        <Link
          to="/relationships"
          className="min-h-11 rounded-xl border border-white/[0.08] px-4 py-3 text-sm font-semibold text-white/68"
        >
          All relationships
        </Link>
      </div>
    </V3Screen>
  );
}

function CountryLink({
  country,
  align = "left",
}: {
  country: V3RelationshipCountry;
  align?: "left" | "right";
}) {
  return (
    <Link
      to="/countries/$code"
      params={{ code: country.shortCode.toLowerCase() }}
      className={`flex min-w-0 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <FlagChip
        code={country.shortCode}
        color={country.accentColor}
        image={country.flagImage}
        size="md"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{country.name}</p>
        <p className="text-xs text-white/42">{country.shortCode}</p>
      </div>
    </Link>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <V3Surface className="p-4">
      <p className="text-[0.65rem] uppercase tracking-wide text-white/38">{label}</p>
      <p className="mt-2 text-lg font-bold tabular-nums">{value}</p>
    </V3Surface>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-4 last:pb-4">
      <span className="text-sm text-white/48">{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
