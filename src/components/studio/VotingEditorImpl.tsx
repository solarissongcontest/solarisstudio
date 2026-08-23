import { useState } from "react";
import { Field, SegButtons, Slider, TextInput, Toggle } from "./Controls";
import {
  POINT_PRESETS,
  parsePointList,
  type TelevoteRound,
  type TieBreak,
  type VotingConfig,
} from "@/lib/voting";
import { cn } from "@/lib/utils";

const TIE_LABELS: Record<TieBreak, string> = {
  televote: "Higher televote",
  jury: "Higher jury",
  twelves: "Most top awards",
  countback: "Countback down the scale",
  runningOrder: "Later running order",
};

export function VotingEditor({
  voting,
  onChange,
}: {
  voting: VotingConfig;
  onChange: (next: VotingConfig) => void;
}) {
  const set = (patch: Partial<VotingConfig>) => onChange({ ...voting, ...patch });
  const [juryText, setJuryText] = useState(voting.juryPoints.join(", "));
  const [teleText, setTeleText] = useState(voting.televotePoints.join(", "));

  const updateTelevoteRound = (index: number, patch: Partial<TelevoteRound>) => {
    const rounds = voting.televoteRounds.map((round, roundIndex) =>
      roundIndex === index ? { ...round, ...patch } : round,
    );
    set({ televoteRounds: rounds });
  };

  const setTelevoteRoundCount = (count: "1" | "2") => {
    if (count === "1") {
      set({
        televoteRounds: [{ id: "televote", label: "Televote", weight: 100 }],
      });
      return;
    }

    const existing = voting.televoteRounds;
    const firstLabel = existing[0]?.label === "Televote" ? "Televote round 1" : existing[0]?.label;
    set({
      televoteMode: "total",
      televoteRounds: [
        {
          id: existing[0]?.id && existing[0].id !== "televote" ? existing[0].id : "televote-1",
          label: firstLabel || "Televote round 1",
          weight: existing.length > 1 ? existing[0].weight : 50,
        },
        existing[1] ?? { id: "televote-2", label: "Televote round 2", weight: 50 },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="Jury vote" checked={voting.juryEnabled} onChange={(v) => set({ juryEnabled: v })} />
        <Toggle label="Televote" checked={voting.televoteEnabled} onChange={(v) => set({ televoteEnabled: v })} />
      </div>

      {voting.juryEnabled && (
        <section className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Jury point scale</h4>
          <div className="flex flex-wrap gap-1">
            {POINT_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setJuryText(p.points.join(", "));
                  set({ juryPoints: p.points });
                }}
                className={cn(
                  "rounded-lg border border-border px-2.5 py-1 text-xs",
                  voting.juryPoints.join() === p.points.join() && "border-primary/60 bg-primary/10",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Field label="Points awarded (high → low)" hint="Any values you like — separate with commas or spaces">
            <TextInput
              value={juryText}
              onChange={(e) => {
                setJuryText(e.target.value);
                set({ juryPoints: parsePointList(e.target.value) });
              }}
              placeholder="12, 10, 8, 7, 6, 5, 4, 3, 2, 1"
            />
          </Field>
          <p className="numeric text-xs text-muted-foreground">
            {voting.juryPoints.length} awards per juror · {voting.juryPoints.reduce((a, b) => a + b, 0)} points per ballot
          </p>
        </section>
      )}

      {voting.televoteEnabled && (
        <section className="space-y-4">
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Televote</h4>

          <Field
            label="Public voting rounds"
            hint="Use two rounds when the final public vote came from separate sources, such as web voting and Instagram voting."
          >
            <SegButtons
              value={voting.televoteRounds.length > 1 ? "2" : "1"}
              onChange={setTelevoteRoundCount}
              options={[
                { label: "1 round", value: "1" },
                { label: "2 rounds", value: "2" },
              ] as const}
            />
          </Field>

          {voting.televoteRounds.length > 1 && (
            <div className="space-y-3 rounded-xl border border-border bg-surface/35 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {voting.televoteRounds.map((round, index) => (
                  <Field key={round.id} label={`Round ${index + 1} name`}>
                    <TextInput
                      value={round.label}
                      onChange={(event) => updateTelevoteRound(index, { label: event.target.value })}
                      placeholder={`Televote round ${index + 1}`}
                    />
                  </Field>
                ))}
              </div>
              <Field
                label="Round weighting"
                hint="The two public-vote rounds always add to 100%. Stored round points represent each round's final contribution to the overall result."
              >
                <Slider
                  min={0}
                  max={100}
                  value={voting.televoteRounds[0]?.weight ?? 50}
                  onChange={(value) =>
                    set({
                      televoteRounds: [
                        { ...voting.televoteRounds[0], weight: value },
                        { ...voting.televoteRounds[1], weight: 100 - value },
                      ],
                    })
                  }
                  suffix={`% ${voting.televoteRounds[0]?.label || "round 1"}`}
                />
              </Field>
              <p className="numeric text-xs text-muted-foreground">
                {voting.televoteRounds[0]?.label || "Round 1"} {voting.televoteRounds[0]?.weight ?? 50}% · {voting.televoteRounds[1]?.label || "Round 2"} {voting.televoteRounds[1]?.weight ?? 50}%
              </p>
            </div>
          )}

          <SegButtons
            value={voting.televoteMode}
            onChange={(v) => set({ televoteMode: v })}
            options={[
              { label: "Point scale per country", value: "scale" },
              { label: "Free total per entry", value: "total" },
            ]}
          />
          {voting.televoteMode === "scale" && (
            <Field label="Televote point scale">
              <TextInput
                value={teleText}
                onChange={(e) => {
                  setTeleText(e.target.value);
                  set({ televotePoints: parsePointList(e.target.value) });
                }}
              />
            </Field>
          )}
        </section>
      )}

      {voting.juryEnabled && voting.televoteEnabled && (
        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground">
            Jury / public vote weighting <span className="normal-case text-muted-foreground/70">(display split)</span>
          </h4>
          <Slider
            min={0}
            max={100}
            value={voting.weighting.jury}
            onChange={(v) => set({ weighting: { jury: v, televote: 100 - v } })}
            suffix="% jury"
          />
          <p className="numeric text-xs text-muted-foreground">
            Jury {voting.weighting.jury}% · Public vote {100 - voting.weighting.jury}%
          </p>
          <Toggle
            label="Use these percentages to calculate results (weighted scoring)"
            checked={voting.weightedScoring}
            onChange={(v) => set({ weightedScoring: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            {voting.weightedScoring
              ? "Results are calculated using this jury/public-vote split — changing it will change rankings."
              : "By default this split only changes what's shown on screen. Totals remain the plain sum of jury + public-vote points until weighted scoring is enabled."}
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Tie-break order</h4>
        <ul className="space-y-1.5">
          {voting.tieBreak.map((rule, i) => (
            <li key={rule} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
              <span className="numeric w-5 text-muted-foreground">{i + 1}</span>
              <span className="flex-1">{TIE_LABELS[rule]}</span>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => {
                  const next = [...voting.tieBreak];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  set({ tieBreak: next });
                }}
                className="rounded px-2 text-xs text-muted-foreground disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === voting.tieBreak.length - 1}
                onClick={() => {
                  const next = [...voting.tieBreak];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  set({ tieBreak: next });
                }}
                className="rounded px-2 text-xs text-muted-foreground disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => set({ tieBreak: voting.tieBreak.filter((r) => r !== rule) })}
                className="rounded px-2 text-xs text-destructive"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(TIE_LABELS) as TieBreak[])
            .filter((r) => !voting.tieBreak.includes(r))
            .map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => set({ tieBreak: [...voting.tieBreak, r] })}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground"
              >
                + {TIE_LABELS[r]}
              </button>
            ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Qualifiers" hint="Top N advance from this show. Leave 0 for none.">
          <TextInput
            type="number"
            min={0}
            value={voting.qualifiers ?? 0}
            onChange={(e) => set({ qualifiers: Number(e.target.value) || null })}
            className="numeric"
          />
        </Field>
        <div className="flex items-end">
          <Toggle label="Allow self-voting" checked={voting.allowSelfVote} onChange={(v) => set({ allowSelfVote: v })} />
        </div>
      </section>
    </div>
  );
}
