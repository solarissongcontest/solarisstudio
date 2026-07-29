import { ColorInput, Field, SegButtons, Select, Slider, TextInput, Toggle } from "./Controls";
import { FONT_OPTIONS, type ThemeConfig } from "@/lib/theme";

type Patch = (t: ThemeConfig) => ThemeConfig;

export function ThemeEditor({
  theme,
  onChange,
}: {
  theme: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}) {
  const set = (patch: Patch) => onChange(patch(theme));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Background</h4>
        <SegButtons
          value={theme.background.type}
          onChange={(v) => set((t) => ({ ...t, background: { ...t.background, type: v } }))}
          options={[
            { label: "Gradient", value: "gradient" },
            { label: "Solid", value: "color" },
            { label: "Image", value: "image" },
          ]}
        />
        {theme.background.type === "gradient" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="From">
              <ColorInput
                value={theme.background.gradientFrom}
                onChange={(v) => set((t) => ({ ...t, background: { ...t.background, gradientFrom: v } }))}
              />
            </Field>
            <Field label="To">
              <ColorInput
                value={theme.background.gradientTo}
                onChange={(v) => set((t) => ({ ...t, background: { ...t.background, gradientTo: v } }))}
              />
            </Field>
            <Field label="Angle">
              <Slider
                min={0}
                max={360}
                value={theme.background.gradientAngle}
                onChange={(v) => set((t) => ({ ...t, background: { ...t.background, gradientAngle: v } }))}
                suffix="°"
              />
            </Field>
          </div>
        )}
        {theme.background.type === "color" && (
          <Field label="Colour">
            <ColorInput
              value={theme.background.color}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, color: v } }))}
            />
          </Field>
        )}
        {theme.background.type === "image" && (
          <Field label="Image URL" hint="Any public image or animated GIF">
            <TextInput
              value={theme.background.imageUrl ?? ""}
              placeholder="https://…"
              onChange={(e) =>
                set((t) => ({ ...t, background: { ...t.background, imageUrl: e.target.value || null } }))
              }
            />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Overlay darkness">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={theme.background.overlay}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, overlay: v } }))}
            />
          </Field>
          <Field label="Background blur">
            <Slider
              min={0}
              max={40}
              value={theme.background.blur}
              onChange={(v) => set((t) => ({ ...t, background: { ...t.background, blur: v } }))}
              suffix="px"
            />
          </Field>
        </div>
        <Field label="Logo URL">
          <TextInput
            value={theme.logoUrl ?? ""}
            placeholder="https://…"
            onChange={(e) => set((t) => ({ ...t, logoUrl: e.target.value || null }))}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Palette</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["primary", "Primary"],
              ["secondary", "Secondary"],
              ["accent", "Accent"],
              ["text", "Text"],
              ["jury", "Jury"],
              ["televote", "Televote"],
              ["gold", "Winner gold"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <ColorInput
                value={theme.colors[key]}
                onChange={(v) => set((t) => ({ ...t, colors: { ...t.colors, [key]: v } }))}
              />
            </Field>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Display font">
          <Select value={theme.fontDisplay} onChange={(e) => set((t) => ({ ...t, fontDisplay: e.target.value }))}>
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value} className="bg-background">
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Body font">
          <Select value={theme.fontBody} onChange={(e) => set((t) => ({ ...t, fontBody: e.target.value }))}>
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value} className="bg-background">
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Country cards</h4>
        <SegButtons
          value={theme.card.shape}
          onChange={(v) => set((t) => ({ ...t, card: { ...t.card, shape: v } }))}
          options={[
            { label: "Rounded", value: "rounded" },
            { label: "Square", value: "square" },
            { label: "Pill", value: "pill" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Corner radius">
            <Slider
              min={0}
              max={40}
              value={theme.card.radius}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, radius: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Card height">
            <Slider
              min={32}
              max={96}
              value={theme.card.height}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, height: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Spacing">
            <Slider
              min={0}
              max={24}
              value={theme.card.gap}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, gap: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Glass strength">
            <Slider
              min={0}
              max={1}
              step={0.02}
              value={theme.card.opacity}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, opacity: v } }))}
            />
          </Field>
          <Field label="Card blur">
            <Slider
              min={0}
              max={40}
              value={theme.card.blur}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, blur: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Border width">
            <Slider
              min={0}
              max={4}
              value={theme.card.borderWidth}
              onChange={(v) => set((t) => ({ ...t, card: { ...t.card, borderWidth: v } }))}
              suffix="px"
            />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Tint cards with country colour"
            checked={theme.card.useCountryColor}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, useCountryColor: v } }))}
          />
          <Toggle
            label="Card shadow"
            checked={theme.card.shadow}
            onChange={(v) => set((t) => ({ ...t, card: { ...t.card, shadow: v } }))}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Flags</h4>
        <SegButtons
          value={theme.flag.shape}
          onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, shape: v } }))}
          options={[
            { label: "Rectangle", value: "rect" },
            { label: "Rounded", value: "rounded" },
            { label: "Circle", value: "circle" },
            { label: "Square", value: "square" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Flag width">
            <Slider
              min={20}
              max={96}
              value={theme.flag.width}
              onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, width: v } }))}
              suffix="px"
            />
          </Field>
          <Field label="Aspect ratio">
            <Slider
              min={1}
              max={2.5}
              step={0.1}
              value={theme.flag.ratio}
              onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, ratio: v } }))}
            />
          </Field>
        </div>
        <Toggle
          label="Flag border"
          checked={theme.flag.border}
          onChange={(v) => set((t) => ({ ...t, flag: { ...t.flag, border: v } }))}
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Board layout</h4>
        <SegButtons
          value={theme.layout.mode}
          onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, mode: v } }))}
          options={[
            { label: "Single list", value: "single" },
            { label: "Two columns", value: "two-column" },
            { label: "Grid", value: "grid" },
          ]}
        />
        <Field label="Countries on screen" hint="e.g. 26 finalists split across the chosen layout">
          <Slider
            min={5}
            max={66}
            value={theme.layout.maxVisible}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, maxVisible: v } }))}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Show rank"
            checked={theme.layout.showRank}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, showRank: v } }))}
          />
          <Toggle
            label="Show artist & song"
            checked={theme.layout.showArtist}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, showArtist: v } }))}
          />
          <Toggle
            label="Show jury / televote split"
            checked={theme.layout.showSplit}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, showSplit: v } }))}
          />
          <Toggle
            label="Centre align text"
            checked={theme.layout.align === "center"}
            onChange={(v) => set((t) => ({ ...t, layout: { ...t.layout, align: v ? "center" : "left" } }))}
          />
        </div>
      </section>
    </div>
  );
}
