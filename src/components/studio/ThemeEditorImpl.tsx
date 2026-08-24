import {
  Field,
  SegButtons,
  Slider,
  TextInput,
} from "./Controls";

import {
  type ThemeConfig,
} from "@/lib/theme";

type Patch = (theme: ThemeConfig) => ThemeConfig;

const SOLARIS_DISPLAY_FONT = "Classica Crastao";
const SOLARIS_BODY_FONT = "Gotham";

/**
 * Edition broadcast editor.
 *
 * Edition colours are NOT edited here. They come from the single
 * Artwork & colours source of truth and are synced into linked themes.
 * Typography is also a Solaris-wide design-system choice rather than an
 * edition-level setting: Classica Crastao for major display headlines and
 * Gotham for body/UI text.
 */
export function ThemeEditor({
  theme,
  onChange,
}: {
  theme: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}) {
  const set = (patch: Patch) => {
    const next = patch(theme);
    onChange({
      ...next,
      fontDisplay: SOLARIS_DISPLAY_FONT,
      fontBody: SOLARIS_BODY_FONT,
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface/35 p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
            Edition identity
          </p>
          <h3 className="mt-1 font-display text-lg font-bold">Background</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Controls how the shared edition backdrop is presented. Its colours come automatically from Artwork & colours.
          </p>
        </div>

        <Field label="Background type" hint="Choose how the saved edition palette is presented behind broadcast surfaces.">
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
          <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
            Gradient colours are inherited from <strong className="text-foreground">Artwork & colours</strong>. Only the direction is adjusted here.
            <div className="mt-3">
              <Field label="Gradient angle" hint="Direction of the edition gradient.">
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
          </div>
        )}

        {theme.background.type === "color" && (
          <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
            Solid background colour is inherited from the edition's saved <strong className="text-foreground">Background</strong> colour.
          </div>
        )}

        {theme.background.type === "image" && (
          <div className="mt-4">
            <Field label="Background image URL" hint="Optional broadcast-only image or animated GIF.">
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

        <div className="mt-4 border-t border-border pt-4">
          <Field label="Logo URL" hint="Optional logo used on edition broadcast surfaces that display one.">
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
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface/35 p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Solaris design system</p>
          <h3 className="mt-1 font-display text-lg font-bold">Typography</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Typography is fixed across Solaris Studio so edition screens still belong to the same product.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/20 p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Major headlines</p>
            <p className="display-headline mt-2 text-2xl">Classica Crastao</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/20 p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">UI, body & data</p>
            <p className="mt-2 text-base font-semibold text-foreground">Gotham</p>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Colours are controlled only in Artwork & colours.</strong>{" "}
        Saving the edition palette there automatically syncs it to linked scoreboards and broadcast surfaces. Country-card styling remains in the Scoreboard & Country Cards editor.
      </div>
    </div>
  );
}
