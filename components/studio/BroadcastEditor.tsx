import { Field, SegButtons, Slider, TextInput, Toggle } from "./Controls";
import { SPEEDS, type BroadcastConfig, type SceneKind } from "@/lib/broadcast";
import { cn } from "@/lib/utils";

const SCENE_LABELS: Record<SceneKind, string> = {
  opening: "Opening titles",
  recap: "Contest recap",
  jury: "Jury reveal",
  televote: "Televote reveal",
  winner: "Winner moment",
  credits: "Credits",
};

export function BroadcastEditor({
  config,
  onChange,
}: {
  config: BroadcastConfig;
  onChange: (next: BroadcastConfig) => void;
}) {
  const set = (patch: Partial<BroadcastConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Scenes</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(SCENE_LABELS) as SceneKind[]).map((s) => (
            <Toggle
              key={s}
              label={SCENE_LABELS[s]}
              checked={config.scenes[s]}
              onChange={(v) => set({ scenes: { ...config.scenes, [s]: v } })}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Opening title">
          <TextInput
            value={config.openingTitle}
            placeholder="Solaris Song Contest"
            onChange={(e) => set({ openingTitle: e.target.value })}
          />
        </Field>
        <Field label="Opening subtitle">
          <TextInput
            value={config.openingSubtitle}
            placeholder="Grand Final"
            onChange={(e) => set({ openingSubtitle: e.target.value })}
          />
        </Field>
        <Field label="Credits text" className="sm:col-span-2">
          <TextInput value={config.creditsText} onChange={(e) => set({ creditsText: e.target.value })} />
        </Field>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Timing</h4>
        <Field label="Master speed">
          <div className="flex flex-wrap gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ speed: s })}
                className={cn(
                  "numeric rounded-lg border border-border px-2.5 py-1 text-xs",
                  config.speed === s && "border-primary/60 bg-primary/10",
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </Field>
        <Field label="Point animation delay">
          <Slider
            min={120}
            max={2000}
            step={20}
            value={config.pointDelay}
            onChange={(v) => set({ pointDelay: v })}
            suffix="ms"
          />
        </Field>
        <Field label="Pause between voting countries">
          <Slider
            min={200}
            max={5000}
            step={100}
            value={config.spokespersonDelay}
            onChange={(v) => set({ spokespersonDelay: v })}
            suffix="ms"
          />
        </Field>
        <Field label="Top-award hold">
          <Slider
            min={0}
            max={5000}
            step={100}
            value={config.topPointHold}
            onChange={(v) => set({ topPointHold: v })}
            suffix="ms"
          />
        </Field>
        <Field label="Televote reveal delay">
          <Slider
            min={200}
            max={6000}
            step={100}
            value={config.televoteHold}
            onChange={(v) => set({ televoteHold: v })}
            suffix="ms"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Effects</h4>
        <Field label="Point animation">
          <SegButtons
            value={config.effects.pointAnim}
            onChange={(v) => set({ effects: { ...config.effects, pointAnim: v } })}
            options={[
              { label: "Slide", value: "slide" },
              { label: "Fade", value: "fade" },
              { label: "Scale", value: "scale" },
              { label: "Bounce", value: "bounce" },
            ]}
          />
        </Field>
        <Field label="Top award effect">
          <SegButtons
            value={config.effects.topPoint}
            onChange={(v) => set({ effects: { ...config.effects, topPoint: v } })}
            options={[
              { label: "Glow", value: "glow" },
              { label: "Flash", value: "flash" },
              { label: "Pulse", value: "pulse" },
              { label: "None", value: "none" },
            ]}
          />
        </Field>
        <Field label="Winner effect">
          <SegButtons
            value={config.effects.winner}
            onChange={(v) => set({ effects: { ...config.effects, winner: v } })}
            options={[
              { label: "Confetti", value: "confetti" },
              { label: "Fireworks", value: "fireworks" },
              { label: "None", value: "none" },
            ]}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Shake on new leader"
            checked={config.effects.shakeOnLead}
            onChange={(v) => set({ effects: { ...config.effects, shakeOnLead: v } })}
          />
          <Toggle
            label="Show running totals"
            checked={config.showRunningTotals}
            onChange={(v) => set({ showRunningTotals: v })}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Spokesperson window</h4>
        <Toggle
          label="Show spokesperson card"
          checked={config.spokesperson.show}
          onChange={(v) => set({ spokesperson: { ...config.spokesperson, show: v } })}
        />
        <SegButtons
          value={config.spokesperson.size}
          onChange={(v) => set({ spokesperson: { ...config.spokesperson, size: v } })}
          options={[
            { label: "Small", value: "sm" },
            { label: "Medium", value: "md" },
            { label: "Large", value: "lg" },
          ]}
        />
      </section>
    </div>
  );
}
