import { useState } from "react";
import { Field, SegButtons, Slider, TextInput, Toggle } from "./Controls";
import { POINT_PRESETS, parsePointList, type TieBreak, type VotingConfig } from "@/lib/voting";
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

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="Jury vote" checked={voting.juryEnabled} onChange={(v) => set({ juryEnabled: v })} />
        <Toggle
          label="Televote"
          checked={voting.televoteEnabled}
          onChange={(v) => set({ televoteEnabled: v })}
        />
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
            {voting.juryPoints.length} awards per juror ·{" "}
            {voting.juryPoints.reduce((a, b) => a + b, 0)} points per ballot
          </p>
        </section>
      )}

      {voting.televoteEnabled && (
        <section className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Televote</h4>
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
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Weighting</h4>
          <Slider
            min={0}
            max={100}
            value={voting.weighting.jury}
            onChange={(v) => set({ weighting: { jury: v, televote: 100 - v } })}
            suffix="% jury"
          />
          <p className="numeric text-xs text-muted-foreground">
            Jury {voting.weighting.jury}% · Televote {100 - voting.weighting.jury}%
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
          <Toggle
            label="Allow self-voting"
            checked={voting.allowSelfVote}
            onChange={(v) => set({ allowSelfVote: v })}
          />
        </div>
      </section>
    </div>
  );
}
