import {
  ColorField,
  Field,
  SegButtons,
  Select,
  Slider,
  TextInput,
} from "./Controls";

import {
  FONT_OPTIONS,
  type ThemeConfig,
} from "@/lib/theme";

type Patch =
  (
    theme:
      ThemeConfig,
  ) =>
    ThemeConfig;

/**
 * Edition branding editor.
 *
 * IMPORTANT:
 * Country cards, row text, flags, states, scoreboard layout,
 * jury panels and scoreboard backgrounds are NOT edited here.
 *
 * Those are owned by ScoreboardEditor / ScoreboardConfig so there
 * keeps one shared configuration for every country row/card used by
 * the edition's scoreboards, running-order boards and broadcasts.
 */
export function ThemeEditor({
  theme,
  onChange,
}: {
  theme:
    ThemeConfig;

  onChange:
    (
      next:
        ThemeConfig,
    ) =>
      void;
}) {
  const set =
    (
      patch:
        Patch,
    ) =>
      onChange(
        patch(
          theme,
        ),
      );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface/35 p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
            Edition identity
          </p>
          <h3 className="mt-1 font-display text-lg font-bold">Background</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The shared backdrop behind edition broadcast surfaces. Country rows and cards are controlled separately in the custom scoreboard editor.
          </p>
        </div>

        <Field label="Background type" hint="Choose the base edition backdrop.">
          <SegButtons
            value={theme.background.type}
            onChange={(value) =>
              set((current) => ({
                ...current,
                background: { ...current.background, type: value },
              }))
            }
            options={[
              { label: "Gradient", value: "gradient" },
              { label: "Solid", value: "color" },
              { label: "Image", value: "image" },
            ]}
          />
        </Field>

        {theme.background.type === "gradient" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ColorField
              label="Gradient start"
              description="First colour of the edition backdrop."
              value={theme.background.gradientFrom}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  background: { ...current.background, gradientFrom: value },
                }))
              }
            />
            <ColorField
              label="Gradient end"
              description="Second colour of the edition backdrop."
              value={theme.background.gradientTo}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  background: { ...current.background, gradientTo: value },
                }))
              }
            />
            <Field label="Gradient angle" hint="Direction of the gradient.">
              <Slider
                min={0}
                max={360}
                step={1}
                value={theme.background.gradientAngle}
                onChange={(value) =>
                  set((current) => ({
                    ...current,
                    background: { ...current.background, gradientAngle: value },
                  }))
                }
                suffix="°"
              />
            </Field>
          </div>
        )}

        {theme.background.type === "color" && (
          <div className="mt-4">
            <ColorField
              label="Background colour"
              description="Flat colour used behind the edition."
              value={theme.background.color}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  background: { ...current.background, color: value },
                }))
              }
            />
          </div>
        )}

        {theme.background.type === "image" && (
          <div className="mt-4">
            <Field label="Background image URL" hint="Public image or animated GIF.">
              <TextInput
                value={theme.background.imageUrl ?? ""}
                placeholder="https://…"
                onChange={(event) =>
                  set((current) => ({
                    ...current,
                    background: {
                      ...current.background,
                      imageUrl: event.target.value || null,
                    },
                  }))
                }
              />
            </Field>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Overlay darkness" hint="Darkens the backdrop for readability.">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={theme.background.overlay}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  background: { ...current.background, overlay: value },
                }))
              }
            />
          </Field>

          <Field label="Background blur" hint="Softens the edition backdrop itself.">
            <Slider
              min={0}
              max={40}
              step={1}
              value={theme.background.blur}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  background: { ...current.background, blur: value },
                }))
              }
              suffix="px"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface/35 p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Edition identity</p>
          <h3 className="mt-1 font-display text-lg font-bold">Branding</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Logo and colours shared across the edition.</p>
        </div>

        <Field label="Logo URL" hint="Used on edition broadcast surfaces that display a logo.">
          <TextInput
            value={theme.logoUrl ?? ""}
            placeholder="https://…"
            onChange={(event) =>
              set((current) => ({
                ...current,
                logoUrl: event.target.value || null,
              }))
            }
          />
        </Field>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField label="Primary" description="Main edition accent." value={theme.colors.primary} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, primary: value } }))} />
          <ColorField label="Secondary" description="Secondary edition accent." value={theme.colors.secondary} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, secondary: value } }))} />
          <ColorField label="Accent" description="Extra accent used by custom surfaces." value={theme.colors.accent} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, accent: value } }))} />
          <ColorField label="Base text" description="Fallback edition text colour." value={theme.colors.text} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, text: value } }))} />
          <ColorField label="Jury" description="Shared jury accent colour." value={theme.colors.jury} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, jury: value } }))} />
          <ColorField label="Televote" description="Shared televote accent colour." value={theme.colors.televote} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, televote: value } }))} />
          <ColorField label="Winner gold" description="Edition winner / gold accent." value={theme.colors.gold} onChange={(value) => set((current) => ({ ...current, colors: { ...current.colors, gold: value } }))} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface/35 p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Edition identity</p>
          <h3 className="mt-1 font-display text-lg font-bold">Typography</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Base fonts available to the edition. Individual country-row typography still comes from the custom card editor.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display font" hint="Titles and display typography.">
            <Select
              value={theme.fontDisplay}
              onChange={(event) => set((current) => ({ ...current, fontDisplay: event.target.value }))}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font.value} value={font.value} className="bg-background">
                  {font.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Body font" hint="Supporting text typography.">
            <Select
              value={theme.fontBody}
              onChange={(event) => set((current) => ({ ...current, fontBody: event.target.value }))}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font.value} value={font.value} className="bg-background">
                  {font.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Country-card styling is intentionally not available here.</strong>{" "}
        Use the Scoreboard & Country Cards editor above. Its settings apply to country rows on the scoreboard and in the running order.
      </div>
    </div>
  );
}
