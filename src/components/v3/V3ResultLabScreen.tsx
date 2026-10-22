import { useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import {
  RESULT_LAB_BLEND_MODES,
  RESULT_LAB_JURY_SCHEMES,
  RESULT_LAB_TIE_BREAKS,
  resultLabCsv,
  simulateResultLab,
  type ResultLabBlendMode,
  type ResultLabJuryScheme,
  type ResultLabTieBreak,
} from "@/lib/result-lab";
import type { V3ResultLabBundle } from "@/lib/v3-result-lab";
import {
  serializeV3ResultLabScenario,
  type V3ResultLabScenario,
} from "@/lib/v3-result-lab-scenario";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function V3ResultLabScreen({
  bundle,
  initialScenario,
  onShowChange,
  changingShow = false,
}: {
  bundle: V3ResultLabBundle;
  initialScenario: V3ResultLabScenario;
  onShowChange: (showId: string) => void;
  changingShow?: boolean;
}) {
  const publicVoterKeys = useMemo(
    () => new Set(bundle.voters.map((voter) => voter.key)),
    [bundle.voters],
  );
  const [juryWeight, setJuryWeight] = useState(initialScenario.juryWeight);
  const [blendMode, setBlendMode] = useState<ResultLabBlendMode>(initialScenario.blendMode);
  const [juryScheme, setJuryScheme] = useState<ResultLabJuryScheme>(
    bundle.detailedVotingPublic ? initialScenario.juryScheme : "original",
  );
  const [tieBreak, setTieBreak] = useState<ResultLabTieBreak>(initialScenario.tieBreak);
  const [excludedVoters, setExcludedVoters] = useState<Set<string>>(
    () =>
      new Set(
        bundle.detailedVotingPublic
          ? [...initialScenario.excludedVoters].filter((key) => publicVoterKeys.has(key))
          : [],
      ),
  );
  const [voterSearch, setVoterSearch] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const selectedOption =
    bundle.options.find((option) => option.id === bundle.selectedShowId) ?? null;
  const selectedEditionId = selectedOption?.editionId ?? "";
  const editionOptions = useMemo(() => {
    const seen = new Set<string>();
    return bundle.options.filter((option) => {
      if (seen.has(option.editionId)) return false;
      seen.add(option.editionId);
      return true;
    });
  }, [bundle.options]);
  const showOptions = bundle.options.filter(
    (option) => option.editionId === selectedEditionId,
  );
  const identityMap = useMemo(
    () => new Map(bundle.identities.map((identity) => [identity.id, identity])),
    [bundle.identities],
  );

  const simulation = useMemo(
    () =>
      simulateResultLab({
        officialEntries: bundle.officialEntries,
        juryVotes: bundle.detailedVotingPublic ? bundle.juryVotes : [],
        config: {
          juryWeight,
          televoteWeight: 100 - juryWeight,
          blendMode,
          juryScheme,
          tieBreak,
          excludedVoters,
        },
      }),
    [
      bundle.officialEntries,
      bundle.juryVotes,
      bundle.detailedVotingPublic,
      juryWeight,
      blendMode,
      juryScheme,
      tieBreak,
      excludedVoters,
    ],
  );

  const filteredVoters = useMemo(() => {
    const query = voterSearch.trim().toLowerCase();
    return bundle.voters.filter(
      (voter) => !query || voter.name.toLowerCase().includes(query),
    );
  }, [bundle.voters, voterSearch]);

  const winner = simulation.rows[0] ?? null;
  const biggestGainers = [...simulation.rows]
    .filter((row) => (row.rankDelta ?? 0) > 0)
    .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0))
    .slice(0, 3);
  const biggestLosers = [...simulation.rows]
    .filter((row) => (row.rankDelta ?? 0) < 0)
    .sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0))
    .slice(0, 3);

  const resetScenario = () => {
    setJuryWeight(50);
    setBlendMode("raw");
    setJuryScheme("original");
    setTieBreak("televote");
    setExcludedVoters(new Set());
    setVoterSearch("");
    setShareMessage(null);
  };

  const toggleVoter = (key: string) => {
    setExcludedVoters((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setShareMessage(null);
  };

  const shareScenario = async () => {
    if (typeof window === "undefined" || !bundle.selectedShowId) return;
    const query = serializeV3ResultLabScenario({
      showId: bundle.selectedShowId,
      juryWeight,
      blendMode,
      juryScheme: bundle.detailedVotingPublic ? juryScheme : "original",
      tieBreak,
      excludedVoters: bundle.detailedVotingPublic ? excludedVoters : new Set(),
    });
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    setShareMessage(null);

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Solaris Result Lab simulation",
          text: "Hypothetical Result Lab scenario. Official result unchanged.",
          url,
        });
        setShareMessage("Scenario shared.");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage("Scenario link copied.");
        return;
      }
      setShareMessage("Copy the page address from your browser to share this scenario.");
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setShareMessage("Scenario link copied.");
          return;
        }
      } catch {
        // Sharing is optional; the simulation itself must remain usable.
      }
      setShareMessage("Sharing is unavailable on this device.");
    }
  };

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="What-if analytics"
        title="Result Lab"
        description="Build a hypothetical scenario from an official published result without changing the official scoreboard."
        editorial
      />

      <V3Surface level="raised" className="p-5">
        <div data-v3-result-lab-hypothetical="">
          <div className="flex flex-wrap items-center gap-2">
            <V3StatusChip tone="warning">Simulation</V3StatusChip>
            <V3StatusChip tone="neutral">Official result unchanged</V3StatusChip>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/62">
            Everything below is hypothetical. Result Lab reads published official
            inputs, performs the scenario locally in your browser and never writes
            the simulated ranking back to Solaris result data.
          </p>
        </div>
      </V3Surface>

      <V3Section title="1. Pick an official result">
        <V3Surface className="grid gap-4 p-4 sm:grid-cols-2">
          <SelectField label="Edition">
            <select
              value={selectedEditionId}
              onChange={(event) => {
                const next = bundle.options.find(
                  (option) => option.editionId === event.target.value,
                );
                if (next) {
                  resetScenario();
                  onShowChange(next.id);
                }
              }}
              disabled={changingShow || !editionOptions.length}
              className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-white outline-none disabled:opacity-50"
            >
              {!editionOptions.length ? (
                <option value="">No published results</option>
              ) : null}
              {editionOptions.map((option) => (
                <option key={option.editionId} value={option.editionId}>
                  {option.editionName}
                </option>
              ))}
            </select>
          </SelectField>

          <SelectField label="Show">
            <select
              value={bundle.selectedShowId ?? ""}
              onChange={(event) => {
                resetScenario();
                onShowChange(event.target.value);
              }}
              disabled={changingShow || !showOptions.length}
              className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-white outline-none disabled:opacity-50"
            >
              {!showOptions.length ? (
                <option value="">No eligible show</option>
              ) : null}
              {showOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </SelectField>
        </V3Surface>
      </V3Section>

      {!bundle.selectedShowId || !bundle.officialEntries.length ? (
        <V3Surface className="p-5">
          <div role="status" data-v3-result-lab-empty="">
            <p className="text-sm font-semibold">No published result to simulate</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Result Lab only accepts shows whose official jury and televote totals are public.
            </p>
          </div>
        </V3Surface>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="grid content-start gap-4">
              <V3Surface level="raised" className="p-4">
                <p className="v3-kicker">2. Voting balance</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-white/42">Jury</p>
                    <p className="text-2xl font-bold tabular-nums">{juryWeight}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/42">Televote</p>
                    <p className="text-2xl font-bold tabular-nums">{100 - juryWeight}%</p>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={juryWeight}
                  onChange={(event) => {
                    setJuryWeight(Number(event.target.value));
                    setShareMessage(null);
                  }}
                  aria-label="Jury weight"
                  className="mt-4 w-full"
                />
              </V3Surface>

              <V3Surface className="p-4">
                <p className="v3-kicker">3. Blend method</p>
                <div className="mt-3 grid gap-2">
                  {RESULT_LAB_BLEND_MODES.map(([value, label, description]) => (
                    <Choice
                      key={value}
                      checked={blendMode === value}
                      label={label}
                      description={description}
                      onClick={() => {
                        setBlendMode(value);
                        setShareMessage(null);
                      }}
                    />
                  ))}
                </div>
              </V3Surface>

              <V3Surface className="p-4">
                <p className="v3-kicker">4. Jury scoring</p>
                {bundle.detailedVotingPublic ? (
                  <div className="mt-3 grid gap-2">
                    {RESULT_LAB_JURY_SCHEMES.map(([value, label, description]) => (
                      <Choice
                        key={value}
                        checked={juryScheme === value}
                        label={label}
                        description={description}
                        onClick={() => {
                          setJuryScheme(value);
                          setShareMessage(null);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-white/48">
                    Individual jury ballots are not publicly released for this show,
                    so Result Lab can use official jury totals but cannot re-score or
                    remove individual juries.
                  </p>
                )}
              </V3Surface>

              <V3Surface className="p-4">
                <p className="v3-kicker">5. Tie-break</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {RESULT_LAB_TIE_BREAKS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setTieBreak(value);
                        setShareMessage(null);
                      }}
                      className="min-h-11 rounded-xl border px-3 text-xs font-semibold"
                      style={{
                        borderColor:
                          tieBreak === value
                            ? "var(--v3-border-strong)"
                            : "var(--v3-border-subtle)",
                        background:
                          tieBreak === value
                            ? "var(--v3-bg-raised)"
                            : "rgba(255,255,255,0.02)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </V3Surface>

              {bundle.detailedVotingPublic && bundle.voters.length ? (
                <V3Surface className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="v3-kicker">6. Remove juries</p>
                    {excludedVoters.size ? (
                      <V3StatusChip tone="warning">
                        {excludedVoters.size} removed
                      </V3StatusChip>
                    ) : null}
                  </div>
                  <input
                    value={voterSearch}
                    onChange={(event) => setVoterSearch(event.target.value)}
                    placeholder="Search juries…"
                    className="mt-3 min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm outline-none placeholder:text-white/35"
                  />
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {filteredVoters.map((voter) => (
                      <label
                        key={voter.key}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={excludedVoters.has(voter.key)}
                          onChange={() => toggleVoter(voter.key)}
                        />
                        {voter.shortCode ? (
                          <FlagChip
                            code={voter.shortCode}
                            color={voter.accentColor}
                            image={voter.flagImage}
                            size="sm"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {voter.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </V3Surface>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={resetScenario}
                  className="min-h-11 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold"
                >
                  Reset scenario
                </button>
                <button
                  type="button"
                  onClick={() => void shareScenario()}
                  disabled={!bundle.selectedShowId || !simulation.rows.length}
                  className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold disabled:opacity-50"
                  data-v3-result-lab-share=""
                >
                  Share scenario
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedOption || !simulation.rows.length) return;
                    const safeName = selectedOption.name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "");
                    downloadText(
                      `solaris-result-lab-${safeName || "simulation"}.csv`,
                      resultLabCsv(simulation.rows),
                    );
                  }}
                  disabled={!simulation.rows.length}
                  className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold disabled:opacity-50"
                >
                  Export CSV
                </button>
              </div>
              {shareMessage ? (
                <p role="status" className="text-xs leading-5 text-white/48">
                  {shareMessage}
                </p>
              ) : null}
            </div>

            <div className="min-w-0 space-y-5">
              {winner ? (
                <V3Surface level="raised" className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="v3-kicker">Hypothetical winner</p>
                    <V3StatusChip tone="warning">Not official</V3StatusChip>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    {identityMap.get(winner.id) ? (
                      <FlagChip
                        code={identityMap.get(winner.id)!.shortCode}
                        color={identityMap.get(winner.id)!.accentColor}
                        image={identityMap.get(winner.id)!.flagImage}
                        size="lg"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-bold">{winner.name}</p>
                      <p className="mt-1 text-xs text-white/45">
                        Simulated score {winner.simulatedScore.toFixed(1)} · official rank #{winner.officialRank ?? "—"}
                      </p>
                    </div>
                    <span className="text-2xl font-black tabular-nums">#1</span>
                  </div>
                </V3Surface>
              ) : null}

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric label="Jury pool" value={simulation.juryPoolTotal} />
                <Metric label="Televote pool" value={simulation.televotePoolTotal} />
                <Metric label="Juries included" value={`${simulation.includedVoterCount}/${simulation.availableVoterCount}`} />
                <Metric
                  label="Effective balance"
                  value={`${simulation.effectiveJuryWeight.toFixed(0)}/${simulation.effectiveTelevoteWeight.toFixed(0)}`}
                />
              </div>

              {(biggestGainers.length || biggestLosers.length) ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <DeltaList title="Biggest gainers" rows={biggestGainers} />
                  <DeltaList title="Biggest losers" rows={biggestLosers} />
                </div>
              ) : null}

              <V3Section title="Hypothetical scoreboard" meta={`${simulation.rows.length} entries`}>
                <div className="overflow-x-auto rounded-[var(--v3-radius-xl)] border border-white/[0.07]">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead className="bg-white/[0.025] text-[0.68rem] uppercase tracking-wide text-white/42">
                      <tr>
                        <th className="px-3 py-3">Sim.</th>
                        <th className="px-3 py-3">Entry</th>
                        <th className="px-3 py-3 text-right">Jury</th>
                        <th className="px-3 py-3 text-right">Tele</th>
                        <th className="px-3 py-3 text-right">Score</th>
                        <th className="px-3 py-3 text-right">Official</th>
                        <th className="px-3 py-3 text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.07]">
                      {simulation.rows.map((row) => {
                        const identity = identityMap.get(row.id);
                        return (
                          <tr key={row.id}>
                            <td className="px-3 py-3 font-semibold tabular-nums">#{row.simulatedRank}</td>
                            <td className="px-3 py-3">
                              <span className="flex items-center gap-2">
                                {identity ? (
                                  <FlagChip
                                    code={identity.shortCode}
                                    color={identity.accentColor}
                                    image={identity.flagImage}
                                    size="sm"
                                  />
                                ) : null}
                                <span className="truncate font-semibold">{row.name}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{row.simulatedJuryPoints}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{row.simulatedTelevotePoints}</td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums">
                              {row.simulatedScore.toFixed(blendMode === "raw" ? 1 : 2)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">#{row.officialRank ?? "—"}</td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums">
                              {row.rankDelta == null
                                ? "—"
                                : row.rankDelta > 0
                                  ? `+${row.rankDelta}`
                                  : row.rankDelta}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </V3Section>
            </div>
          </div>
        </>
      )}
    </V3Screen>
  );
}

function SelectField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-white/52">
      {label}
      {children}
    </label>
  );
}

function Choice({
  checked,
  label,
  description,
  onClick,
}: {
  checked: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className="min-h-11 rounded-xl border p-3 text-left"
      style={{
        borderColor: checked ? "var(--v3-border-strong)" : "var(--v3-border-subtle)",
        background: checked ? "var(--v3-bg-raised)" : "rgba(255,255,255,0.02)",
      }}
    >
      <span className="block text-xs font-semibold">{label}</span>
      <span className="mt-1 block text-[0.68rem] leading-5 text-white/42">{description}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <V3Surface className="p-4">
      <p className="v3-kicker">{label}</p>
      <p className="mt-2 text-lg font-bold tabular-nums">{value}</p>
    </V3Surface>
  );
}

function DeltaList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; name: string; rankDelta: number | null }>;
}) {
  return (
    <V3Surface className="p-4">
      <p className="v3-kicker">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{row.name}</span>
            <span className="shrink-0 font-bold tabular-nums">
              {(row.rankDelta ?? 0) > 0 ? "+" : ""}{row.rankDelta ?? 0}
            </span>
          </div>
        ))}
      </div>
    </V3Surface>
  );
}
