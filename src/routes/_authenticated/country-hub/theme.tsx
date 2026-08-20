import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Image, Layers3, Palette, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { uploadCountryBackground } from "@/lib/country-background";
import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries } from "@/lib/data";
import {
  DEFAULT_COUNTRY_THEME,
  countryBackgroundCss,
  countryThemeToVisual,
  useCountryTheme,
  useSaveCountryTheme,
  type CountryDecorationStyle,
  type CountryHeroLayout,
  type CountryVisualTheme,
} from "@/lib/visual-theme";

export const Route = createFileRoute("/_authenticated/country-hub/theme")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Country appearance — Solaris Studio" }] }),
  component: CountryThemePage,
});

const PERSONALITIES: Array<{ value: CountryHeroLayout; label: string; description: string }> = [
  { value: "classic", label: "Classic", description: "Balanced and familiar, with a clear country identity." },
  { value: "editorial", label: "Editorial", description: "Magazine-style typography with a strong edge and lots of structure." },
  { value: "minimal", label: "Minimal", description: "Simple, quiet and intentionally free of extra decoration." },
  { value: "flag-focus", label: "Flag focus", description: "Built for countries that want the flag to lead the whole header." },
  { value: "poster", label: "Poster", description: "Bold centred composition inspired by event and campaign posters." },
  { value: "split", label: "Split", description: "Two clear visual zones with decoration built into the second side." },
  { value: "spotlight", label: "Spotlight", description: "Centred stage-like focus with soft depth around the identity." },
  { value: "broadcast", label: "Broadcast", description: "Sharp on-air graphics with a lower-third inspired identity block." },
  { value: "panorama", label: "Panorama", description: "Wide and cinematic, with visual movement near the lower edge." },
  { value: "monument", label: "Monument", description: "Formal, centred and symmetrical without unnecessary empty space." },
  { value: "glass-card", label: "Glass card", description: "One liquid-glass hero surface with light, blur and refraction." },
  { value: "newspaper", label: "Newspaper", description: "Print-inspired rules, spacing and reference-page typography." },
  { value: "ribbon", label: "Ribbon", description: "A diagonal graphic band becomes part of the composition." },
  { value: "duotone", label: "Duotone", description: "Asymmetric two-colour geometry with strong graphic contrast." },
  { value: "passport", label: "Passport", description: "Compact official-document styling with security-print details." },
  { value: "horizon", label: "Horizon", description: "Calm lower-weighted composition with a clean horizon structure." },
];

const DECORATIONS: Array<{
  value: CountryDecorationStyle;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Best match",
    description: "Solaris picks a sharp abstract design that fits the personality. Flag focus keeps the flag.",
  },
  { value: "none", label: "None", description: "No extra shapes or flag decoration." },
  {
    value: "flag",
    label: "Flag",
    description: "Use the flag as part of the design. Best with a large, clear flag image.",
  },
  { value: "orbits", label: "Orbits", description: "Soft circles and rings made from your accent colour." },
  { value: "rays", label: "Rays", description: "Angular rays for a bold poster-like look." },
  { value: "grid", label: "Grid", description: "Clean geometric lines for editorial and broadcast styles." },
  { value: "waves", label: "Waves", description: "Curved layered lines for a softer, cinematic look." },
];

function CountryThemePage() {
  const { country: targetCountryId } = Route.useSearch();
  const { data: accountData, isLoading } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const access = accountData?.access;
  const ownCountry = accountData?.country;
  const adminTarget =
    access?.isOrganizer && targetCountryId
      ? (countries ?? []).find((country) => country.id === targetCountryId)
      : null;
  const country = adminTarget ?? ownCountry;
  const { data: savedTheme } = useCountryTheme(country?.id);
  const saveTheme = useSaveCountryTheme(country?.id);
  const [theme, setTheme] = useState<CountryVisualTheme>(DEFAULT_COUNTRY_THEME);
  const [message, setMessage] = useState<string | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  useEffect(() => {
    const existing = countryThemeToVisual(savedTheme);
    if (existing) setTheme(existing);
    else if (country?.accent_color) {
      setTheme((current) => ({ ...current, accent: country.accent_color }));
    }
  }, [savedTheme, country?.accent_color]);

  const previewStyle = useMemo(
    () => ({
      backgroundImage: countryBackgroundCss(theme),
      backgroundColor: theme.backgroundPrimary,
      backgroundSize: theme.backgroundMode === "image" ? "cover" : undefined,
      backgroundPosition: `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`,
      color: theme.textPrimary,
      borderColor: `${theme.accent}55`,
    }),
    [theme],
  );

  useEffect(() => {
    if (!mobilePreviewOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobilePreviewOpen]);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading country appearance…</p>
      </AppShell>
    );
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Country appearance"
          title="No country account"
          description="Claim a country before creating its visual identity."
        />
        <Link
          to="/country-hub"
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm"
        >
          Open My Solaris
        </Link>
      </AppShell>
    );
  }

  const setColour = (
    key: keyof Pick<
      CountryVisualTheme,
      "backgroundPrimary" | "backgroundSecondary" | "accent" | "surface" | "textPrimary" | "textMuted"
    >,
    value: string,
  ) => setTheme((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setMessage(null);
    try {
      await saveTheme.mutateAsync(theme);
      setMessage("Appearance saved. Your country page and Wiki now share these settings.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appearance could not be saved.");
    }
  };

  const uploadBackground = async (file: File) => {
    setBackgroundBusy(true);
    setMessage(null);
    try {
      const asset = await uploadCountryBackground(country.id, file);
      setTheme((current) => ({
        ...current,
        backgroundMode: "image",
        backgroundImageUrl: asset.publicUrl,
        backgroundImageStoragePath: asset.storagePath,
      }));
      setMessage("Background uploaded. Adjust its crop and overlay, then save appearance.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Background upload failed.");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const preview = (
    <CountryThemePreview
      countryName={country.name}
      region={country.region}
      description={country.description}
      flagImage={country.flag_image}
      theme={theme}
      previewStyle={previewStyle}
    />
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="My Solaris · Country appearance"
        title={`${country.name} appearance`}
        description="Choose how your country and Wiki look. The preview uses your real flag and the settings you have not saved yet."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/country-hub"
              search={targetCountryId ? { country: targetCountryId } : {}}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              ← My Solaris
            </Link>
            <Link
              to="/countries/$code"
              params={{ code: country.short_code }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              Preview country →
            </Link>
            <Link
              to="/wiki/$code"
              params={{ code: country.short_code }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              Preview Wiki →
            </Link>
          </div>
        }
      />

      {message && (
        <p className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
        <div className="space-y-5">
          <Panel title="Background" description="Use a solid colour, a gradient or your own image.">
            <div className="grid grid-cols-3 gap-2">
              <ModeButton
                active={theme.backgroundMode === "solid"}
                icon={Palette}
                label="Solid"
                onClick={() => setTheme((current) => ({ ...current, backgroundMode: "solid" }))}
              />
              <ModeButton
                active={theme.backgroundMode === "gradient"}
                icon={Sparkles}
                label="Gradient"
                onClick={() => setTheme((current) => ({ ...current, backgroundMode: "gradient" }))}
              />
              <ModeButton
                active={theme.backgroundMode === "image"}
                icon={Image}
                label="Image"
                onClick={() => setTheme((current) => ({ ...current, backgroundMode: "image" }))}
              />
            </div>

            {theme.backgroundMode === "gradient" && (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                      Gradient style
                    </span>
                    <select
                      value={theme.gradientStyle}
                      onChange={(event) =>
                        setTheme((current) => ({
                          ...current,
                          gradientStyle: event.target.value as CountryVisualTheme["gradientStyle"],
                        }))
                      }
                      className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    >
                      <option value="aurora">Aurora glow</option>
                      <option value="linear">Linear</option>
                      <option value="radial">Radial spotlight</option>
                    </select>
                  </label>
                  <RangeField
                    label={`Angle · ${theme.gradientAngle}°`}
                    min={0}
                    max={360}
                    value={theme.gradientAngle}
                    onChange={(value) => setTheme((current) => ({ ...current, gradientAngle: value }))}
                  />
                </div>
                {theme.gradientStyle !== "linear" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RangeField
                      label={`Glow position X · ${theme.backgroundPositionX}%`}
                      min={0}
                      max={100}
                      value={theme.backgroundPositionX}
                      onChange={(value) =>
                        setTheme((current) => ({ ...current, backgroundPositionX: value }))
                      }
                    />
                    <RangeField
                      label={`Glow position Y · ${theme.backgroundPositionY}%`}
                      min={0}
                      max={100}
                      value={theme.backgroundPositionY}
                      onChange={(value) =>
                        setTheme((current) => ({ ...current, backgroundPositionY: value }))
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {theme.backgroundMode === "image" && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-semibold">Custom background image</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  <strong className="text-foreground">Recommended:</strong> 1920×1080 or larger,
                  ideally 2560×1440, 16:9. Keep important details near the centre because phones
                  crop the sides. JPG, PNG, WebP or GIF, maximum 8 MB.
                </p>
                {theme.backgroundImageUrl && (
                  <img
                    src={theme.backgroundImageUrl}
                    alt="Current country background"
                    className="mt-3 aspect-video w-full rounded-xl object-cover"
                    style={{
                      objectPosition: `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`,
                    }}
                  />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={backgroundBusy}
                  onChange={(event) =>
                    event.target.files?.[0] && void uploadBackground(event.target.files[0])
                  }
                  className="mt-3 block w-full text-xs"
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <RangeField
                    label={`Horizontal crop · ${theme.backgroundPositionX}%`}
                    min={0}
                    max={100}
                    value={theme.backgroundPositionX}
                    onChange={(value) =>
                      setTheme((current) => ({ ...current, backgroundPositionX: value }))
                    }
                  />
                  <RangeField
                    label={`Vertical crop · ${theme.backgroundPositionY}%`}
                    min={0}
                    max={100}
                    value={theme.backgroundPositionY}
                    onChange={(value) =>
                      setTheme((current) => ({ ...current, backgroundPositionY: value }))
                    }
                  />
                  <RangeField
                    label={`Dark overlay · ${Math.round(theme.backgroundOverlay * 100)}%`}
                    min={0}
                    max={90}
                    value={Math.round(theme.backgroundOverlay * 100)}
                    onChange={(value) =>
                      setTheme((current) => ({ ...current, backgroundOverlay: value / 100 }))
                    }
                  />
                  <RangeField
                    label={`Background blur · ${theme.backgroundBlur}px`}
                    min={0}
                    max={30}
                    value={theme.backgroundBlur}
                    onChange={(value) =>
                      setTheme((current) => ({ ...current, backgroundBlur: value }))
                    }
                  />
                </div>
                {theme.backgroundImageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setTheme((current) => ({
                        ...current,
                        backgroundImageUrl: null,
                        backgroundImageStoragePath: null,
                        backgroundMode: "gradient",
                      }))
                    }
                    className="mt-3 text-xs font-semibold text-destructive"
                  >
                    Remove image from page
                  </button>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="Colours"
            description="Choose the colours used on your country page and Wiki. Main text also controls the headings."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ColourField
                label="Background 1"
                value={theme.backgroundPrimary}
                onChange={(value) => setColour("backgroundPrimary", value)}
              />
              <ColourField
                label="Background 2"
                value={theme.backgroundSecondary}
                onChange={(value) => setColour("backgroundSecondary", value)}
              />
              <ColourField
                label="Accent"
                value={theme.accent}
                onChange={(value) => setColour("accent", value)}
              />
              <ColourField
                label="Card / surface"
                value={theme.surface}
                onChange={(value) => setColour("surface", value)}
              />
              <ColourField
                label="Main text"
                value={theme.textPrimary}
                onChange={(value) => setColour("textPrimary", value)}
              />
              <ColourField
                label="Secondary text"
                value={theme.textMuted}
                onChange={(value) => setColour("textMuted", value)}
              />
            </div>
          </Panel>

          <Panel
            title="Page personality"
            description="Pick the overall shape and style of the country and Wiki header."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {PERSONALITIES.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme((current) => ({ ...current, heroLayout: value }))}
                  className={`min-h-24 rounded-xl border p-3 text-left transition-colors ${
                    theme.heroLayout === value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface hover:bg-surface-strong"
                  }`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {description}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            title="Decoration"
            description="Choose what appears behind the country name. You do not have to use the flag. Abstract designs stay sharp on every screen."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {DECORATIONS.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme((current) => ({ ...current, decorationStyle: value }))}
                  className={`min-h-20 rounded-xl border p-3 text-left transition-colors ${
                    theme.decorationStyle === value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface hover:bg-surface-strong"
                  }`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {description}
                  </span>
                </button>
              ))}
            </div>
            {theme.decorationStyle === "flag" && !country.flag_image && (
              <p className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                This country has no flag image yet, so nothing will be added until a flag is uploaded.
              </p>
            )}
          </Panel>

          <div className="sticky bottom-20 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur sm:bottom-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <button
              type="button"
              onClick={() => setMobilePreviewOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 text-sm font-semibold xl:hidden"
            >
              <Eye className="size-4" /> Preview
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saveTheme.isPending || backgroundBusy}
              className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saveTheme.isPending ? "Saving…" : "Save appearance"}
            </button>
            <button
              type="button"
              onClick={() =>
                setTheme({
                  ...DEFAULT_COUNTRY_THEME,
                  accent: country.accent_color || DEFAULT_COUNTRY_THEME.accent,
                })
              }
              className="min-h-12 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
          <Panel
            title="Live preview"
            description="This uses your real flag and your current unsaved settings."
          >
            {preview}
          </Panel>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground">
            <Layers3 className="mt-0.5 size-4 shrink-0" />
            <span>
              Content order, custom sections, images and country/Wiki visibility are controlled from
              the page builder in My Solaris.
            </span>
          </div>
        </div>
      </div>

      {mobilePreviewOpen && (
        <div
          className="fixed inset-0 z-[120] xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Country appearance preview"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close preview"
            onClick={() => setMobilePreviewOpen(false)}
          />
          <section className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] border border-border bg-background p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  Unsaved preview
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {PERSONALITIES.find((item) => item.value === theme.heroLayout)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                className="grid size-11 place-items-center rounded-xl border border-border bg-surface"
                aria-label="Close preview"
              >
                <X className="size-4" />
              </button>
            </div>
            {preview}
            <button
              type="button"
              onClick={() => setMobilePreviewOpen(false)}
              className="mt-3 min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Back to editing
            </button>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function effectiveDecoration(theme: CountryVisualTheme): Exclude<CountryDecorationStyle, "auto"> {
  if (theme.decorationStyle !== "auto") return theme.decorationStyle;
  if (theme.heroLayout === "flag-focus") return "flag";
  if (["classic", "spotlight", "glass-card", "passport"].includes(theme.heroLayout)) {
    return "orbits";
  }
  if (["poster", "monument", "ribbon"].includes(theme.heroLayout)) return "rays";
  if (["panorama", "horizon"].includes(theme.heroLayout)) return "waves";
  if (theme.heroLayout === "minimal") return "none";
  return "grid";
}

function CountryThemePreview({
  countryName,
  region,
  description,
  flagImage,
  theme,
  previewStyle,
}: {
  countryName: string;
  region: string;
  description: string | null;
  flagImage: string | null;
  theme: CountryVisualTheme;
  previewStyle: React.CSSProperties;
}) {
  const layout = theme.heroLayout;
  const decoration = effectiveDecoration(theme);
  const centered = ["poster", "spotlight", "monument"].includes(layout);
  const sideZone = ["split", "duotone"].includes(layout);
  const bottomAligned = ["broadcast", "panorama", "horizon"].includes(layout);
  const compact = ["minimal", "passport", "newspaper"].includes(layout);
  const previewHeight = layout === "poster" ? "min-h-[350px]" : compact ? "min-h-[250px]" : "min-h-[300px]";
  const titleSize =
    layout === "editorial" || layout === "monument"
      ? "text-4xl sm:text-5xl"
      : ["poster", "duotone", "newspaper"].includes(layout)
        ? "text-4xl"
        : compact
          ? "text-2xl sm:text-3xl"
          : "text-3xl sm:text-4xl";

  const contentClass = centered
    ? "mx-auto max-w-sm text-center"
    : sideZone
      ? "max-w-[62%]"
      : bottomAligned
        ? "flex min-h-[250px] items-end"
        : "max-w-md";

  const glassStyle: React.CSSProperties =
    layout === "glass-card"
      ? {
          borderColor: "rgba(255,255,255,.24)",
          background: `linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.045) 48%, ${theme.accent}15), ${theme.backgroundPrimary}55`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.42), 0 22px 55px -36px rgba(0,0,0,.72)",
          backdropFilter: "blur(22px) saturate(170%)",
          WebkitBackdropFilter: "blur(22px) saturate(170%)",
        }
      : {};

  return (
    <div
      className={`relative ${previewHeight} overflow-hidden rounded-3xl border p-5 sm:p-6`}
      style={{ ...previewStyle, ...glassStyle }}
      data-preview-layout={layout}
    >
      {theme.backgroundMode === "image" && theme.backgroundBlur > 0 && (
        <div
          className="pointer-events-none absolute -inset-8"
          style={{
            backgroundImage: theme.backgroundImageUrl
              ? `url(${JSON.stringify(theme.backgroundImageUrl)})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`,
            filter: `blur(${theme.backgroundBlur}px)`,
            opacity: 0.35,
          }}
        />
      )}

      <PreviewDecoration
        decoration={decoration}
        layout={layout}
        flagImage={flagImage}
        accent={theme.accent}
      />

      {layout === "split" && decoration !== "flag" && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[36%] border-l"
          style={{
            background: `linear-gradient(145deg, ${theme.accent}18, transparent)`,
            borderColor: `${theme.accent}44`,
          }}
        />
      )}
      {layout === "duotone" && (
        <div
          className="pointer-events-none absolute -bottom-16 -right-14 h-[125%] w-[46%] rotate-[9deg]"
          style={{ background: `${theme.accent}22` }}
        />
      )}
      {layout === "broadcast" && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
          style={{ background: `linear-gradient(180deg, transparent, ${theme.backgroundPrimary}dd)` }}
        />
      )}
      {layout === "newspaper" && (
        <>
          <div
            className="pointer-events-none absolute inset-x-5 top-10 h-px"
            style={{ background: `${theme.accent}77` }}
          />
          <div
            className="pointer-events-none absolute inset-x-5 bottom-10 h-px"
            style={{ background: `${theme.accent}55` }}
          />
        </>
      )}
      {layout === "passport" && (
        <div
          className="pointer-events-none absolute inset-3 rounded-lg border-2"
          style={{ borderColor: `${theme.accent}44` }}
        />
      )}

      <div className={`relative z-10 flex h-full flex-col justify-center ${contentClass}`}>
        <div
          className={layout === "broadcast" ? "w-full border-l-4 bg-black/35 p-4 backdrop-blur-sm" : ""}
          style={layout === "broadcast" ? { borderColor: theme.accent } : undefined}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: theme.accent }}
          >
            {layout === "broadcast"
              ? "LIVE · COUNTRY PROFILE"
              : layout === "passport"
                ? "TERRA SOLARIS · NATIONAL FILE"
                : `Terra Solaris · ${region}`}
          </p>
          <h2
            className={`${titleSize} mt-2 font-bold ${
              ["poster", "duotone"].includes(layout) ? "uppercase tracking-[-.055em]" : ""
            }`}
            style={{ color: layout === "broadcast" ? theme.textPrimary : theme.textPrimary }}
          >
            {countryName}
          </h2>
          <p
            className={`mt-3 text-sm leading-6 ${centered ? "mx-auto" : "max-w-sm"}`}
            style={{ color: theme.textMuted }}
          >
            {description || "Your national story, SSC history and custom sections live here."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewDecoration({
  decoration,
  layout,
  flagImage,
  accent,
}: {
  decoration: Exclude<CountryDecorationStyle, "auto">;
  layout: CountryHeroLayout;
  flagImage: string | null;
  accent: string;
}) {
  if (decoration === "none") return null;

  if (decoration === "flag") {
    if (!flagImage) return null;

    if (layout === "split") {
      return (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[38%]"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent, rgba(0,0,0,.08)), url(${JSON.stringify(flagImage)})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      );
    }

    if (layout === "newspaper") {
      return (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-50"
          style={{
            backgroundImage: `url(${JSON.stringify(flagImage)})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      );
    }

    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url(${JSON.stringify(flagImage)})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: layout === "flag-focus" ? "cover" : "cover",
          opacity: layout === "flag-focus" ? 0.52 : layout === "glass-card" ? 0.16 : 0.2,
          filter: layout === "glass-card" ? "blur(8px) saturate(1.08)" : undefined,
          WebkitMaskImage:
            layout === "flag-focus"
              ? "linear-gradient(#000, #000)"
              : "radial-gradient(circle at 68% 46%, #000 0 26%, transparent 74%)",
          maskImage:
            layout === "flag-focus"
              ? "linear-gradient(#000, #000)"
              : "radial-gradient(circle at 68% 46%, #000 0 26%, transparent 74%)",
        }}
      />
    );
  }

  const style: React.CSSProperties = { opacity: 0.75 };
  if (decoration === "orbits") {
    style.background = `radial-gradient(circle at 78% 30%, transparent 0 11%, ${accent}33 11.5% 12%, transparent 12.5% 20%, ${accent}1f 20.5% 21%, transparent 21.5%), radial-gradient(circle at 82% 34%, ${accent}22, transparent 33%)`;
  } else if (decoration === "rays") {
    style.background = `repeating-conic-gradient(from -10deg at 70% 48%, ${accent}29 0deg 8deg, transparent 8deg 21deg)`;
    style.WebkitMaskImage = "radial-gradient(circle at 70% 48%, #000 0 18%, transparent 70%)";
    style.maskImage = "radial-gradient(circle at 70% 48%, #000 0 18%, transparent 70%)";
  } else if (decoration === "grid") {
    style.background = `linear-gradient(${accent}17 1px, transparent 1px), linear-gradient(90deg, ${accent}17 1px, transparent 1px), radial-gradient(circle at 84% 30%, ${accent}20, transparent 30%)`;
    style.backgroundSize = "26px 26px, 26px 26px, auto";
    style.WebkitMaskImage = "linear-gradient(90deg, transparent 8%, #000 66%)";
    style.maskImage = "linear-gradient(90deg, transparent 8%, #000 66%)";
  } else {
    style.background = `radial-gradient(ellipse at 72% 118%, transparent 0 35%, ${accent}2b 35.5% 36.5%, transparent 37% 47%, ${accent}1c 47.5% 48.5%, transparent 49%), linear-gradient(180deg, transparent 48%, ${accent}12)`;
  }

  return <div className="pointer-events-none absolute inset-0" style={style} />;
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Palette;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-current"
      />
    </label>
  );
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-surface p-3">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 rounded-lg border border-border bg-background p-1"
        />
        <input
          value={value}
          onChange={(event) =>
            /^#[0-9a-f]{0,6}$/i.test(event.target.value) && onChange(event.target.value)
          }
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs"
        />
      </div>
    </label>
  );
}
