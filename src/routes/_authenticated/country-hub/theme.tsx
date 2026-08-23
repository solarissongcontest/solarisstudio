import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Image, Layers3, Palette, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { uploadCountryBackground } from "@/lib/country-background";
import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries } from "@/lib/data";
import {
  DEFAULT_COUNTRY_THEME,
  countryBackgroundCss,
  countryThemeToVisual,
  getThemeColourReport,
  suggestThirdBackground,
  themeStyleProperties,
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
  component: CountryThemeRoute,
});

function CountryThemeRoute() {
  return (
    <>
      <CountryPersonalityStyles />
      <CountryThemePage />
    </>
  );
}

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
    description: "Solaris integrates the flag in the way that best fits the selected personality.",
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
  { value: "aurora", label: "Aurora", description: "Layered ribbons of colour with a soft atmospheric glow." },
  { value: "constellation", label: "Constellation", description: "Fine star points and connecting lines with plenty of breathing room." },
  { value: "facets", label: "Facets", description: "Crisp translucent planes for a polished graphic look." },
  { value: "topography", label: "Topography", description: "Elegant contour lines that feel detailed without becoming noisy." },
  { value: "eclipse", label: "Eclipse", description: "A dramatic off-centre halo with restrained light and depth." },
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
    if (existing) {
      setTheme(
        existing.heroLayout === "glass-card" &&
          !["auto", "flag", "none"].includes(existing.decorationStyle)
          ? { ...existing, decorationStyle: "auto" }
          : existing,
      );
    } else if (country?.accent_color) {
      setTheme((current) => ({ ...current, accent: country.accent_color }));
    }
  }, [savedTheme, country?.accent_color]);

  useEffect(() => {
    if (!country) return;
    const body = document.body;
    const previous = {
      entityTheme: body.dataset.entityTheme,
      heroLayout: body.dataset.countryHeroLayout,
      decoration: body.dataset.countryDecoration,
    };
    body.dataset.entityTheme = "country";
    body.dataset.countryHeroLayout = theme.heroLayout;
    body.dataset.countryDecoration = theme.decorationStyle;
    return () => {
      if (previous.entityTheme) body.dataset.entityTheme = previous.entityTheme;
      else delete body.dataset.entityTheme;
      if (previous.heroLayout) body.dataset.countryHeroLayout = previous.heroLayout;
      else delete body.dataset.countryHeroLayout;
      if (previous.decoration) body.dataset.countryDecoration = previous.decoration;
      else delete body.dataset.countryDecoration;
    };
  }, [country, theme.heroLayout, theme.decorationStyle]);

  const colourReport = useMemo(() => getThemeColourReport(theme), [theme]);
  const previewStyle = useMemo(
    () => ({
      "--country-preview-background": countryBackgroundCss(theme),
      "--country-preview-position": `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`,
      backgroundColor: theme.backgroundPrimary,
      backgroundSize: theme.backgroundMode === "image" ? "cover" : undefined,
      color: colourReport.foreground,
      borderColor: `${theme.accent}55`,
    }),
    [theme, colourReport.foreground],
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
      "backgroundPrimary" | "backgroundSecondary" | "backgroundTertiary" | "accent" | "surface" | "textPrimary" | "textMuted"
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
            description="Choose one to three matching background colours, plus the colours used for cards, buttons and text."
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
              {theme.backgroundTertiary ? (
                <div className="rounded-xl bg-surface p-3">
                  <ColourField
                    label="Background 3"
                    value={theme.backgroundTertiary}
                    onChange={(value) => setColour("backgroundTertiary", value)}
                    flush
                  />
                  <button
                    type="button"
                    onClick={() => setTheme((current) => ({ ...current, backgroundTertiary: null }))}
                    className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Remove third colour
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setTheme((current) => ({
                      ...current,
                      backgroundTertiary: suggestThirdBackground(current),
                    }))
                  }
                  className="min-h-24 rounded-xl border border-dashed border-border bg-surface p-3 text-left transition-colors hover:bg-surface-strong"
                >
                  <span className="block text-sm font-semibold">Add a matching third colour</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Solaris will suggest one that connects your background and accent.
                  </span>
                </button>
              )}
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
            <div
              className="mt-4 overflow-hidden rounded-xl border p-4"
              style={{
                background: colourReport.surface,
                borderColor: `${theme.accent}55`,
                color: colourReport.foreground,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Card and button check</p>
                  <p className="mt-1 text-xs" style={{ color: colourReport.mutedForeground }}>
                    Text and large card surfaces are balanced automatically for comfortable reading.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-xs font-bold"
                  style={{ background: theme.accent, color: colourReport.accentForeground }}
                >
                  Example button
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                <span className="rounded-full border border-white/10 px-2.5 py-1">
                  Main text {colourReport.mainTextContrast.toFixed(1)}:1
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1">
                  Secondary text {colourReport.mutedTextContrast.toFixed(1)}:1
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1">
                  Button {colourReport.buttonContrast.toFixed(1)}:1
                </span>
              </div>
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
                  onClick={() =>
                    setTheme((current) => ({
                      ...current,
                      heroLayout: value,
                      decorationStyle:
                        value === "glass-card" &&
                        !["auto", "flag", "none"].includes(current.decorationStyle)
                          ? "auto"
                          : current.decorationStyle,
                    }))
                  }
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
            description={
              theme.heroLayout === "glass-card"
                ? "Choose whether the flag appears inside the glass panel. None keeps only the liquid-glass material."
                : "Choose what appears behind the country name. You do not have to use the flag. Abstract designs stay sharp on every screen."
            }
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {DECORATIONS.filter(({ value }) =>
                theme.heroLayout === "glass-card"
                  ? ["auto", "none", "flag"].includes(value)
                  : true,
              ).map(({ value, label, description }) => (
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
                  <DecorationSwatch
                    decoration={value}
                    flagImage={country.flag_image}
                    accent={theme.accent}
                  />
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
  // Glass allows its matched flag layer to be removed, but never replaces it
  // with an unrelated orbit/ray/grid motif.
  if (theme.heroLayout === "glass-card") {
    return theme.decorationStyle === "none" ? "none" : "flag";
  }
  if (theme.decorationStyle !== "auto") return theme.decorationStyle;
  if (theme.heroLayout === "minimal") return "none";
  // Auto uses the country's own flag as design material. Abstract motifs are
  // reserved for an explicit choice and are never auto-stamped onto a page.
  return "flag";
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
  const compact = ["minimal", "passport", "newspaper"].includes(layout);
  const previewHeight = layout === "poster" ? "min-h-[350px]" : compact ? "min-h-[250px]" : "min-h-[300px]";

  return (
    <div
      className={`country-theme-live-preview country-public-hero glass relative ${previewHeight} overflow-hidden px-5 py-6 sm:px-7 sm:py-8`}
      style={{
        ...previewStyle,
        ...themeStyleProperties(theme),
      } as React.CSSProperties}
      data-preview-layout={layout}
      data-preview-decoration={decoration}
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

      <BackgroundFlag
        image={flagImage}
        className="country-hero-background-flag -right-20 -top-24 h-80 w-80"
        opacity={0.1}
      />

      {decoration !== "flag" && decoration !== "none" && (
        <div
          aria-hidden="true"
          className="country-decoration-layer"
          data-decoration={decoration}
          style={{ "--decoration-accent": theme.accent } as React.CSSProperties}
        />
      )}

      <div aria-hidden="true" className="country-personality-signature" />

      <div className="relative z-10 max-w-3xl">
        {layout === "glass-card" && decoration === "flag" && flagImage && (
          <div
            aria-hidden="true"
            className="country-glass-panel-flag"
            style={{ backgroundImage: `url(${JSON.stringify(flagImage)})` }}
          />
        )}
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
          <h1 className="country-hero-title mt-2 break-words font-display text-3xl font-bold sm:text-5xl">
            {countryName}
          </h1>
          <p
            className="mt-3 max-w-2xl text-sm leading-6"
            style={{ color: theme.textMuted }}
          >
            {description || "Your national story, SSC history and custom sections live here."}
          </p>
        </div>
      </div>
    </div>
  );
}

function DecorationSwatch({
  decoration,
  flagImage,
  accent,
}: {
  decoration: CountryDecorationStyle;
  flagImage: string | null;
  accent: string;
}) {
  const resolved = decoration === "auto" ? "aurora" : decoration;
  return (
    <span
      aria-hidden="true"
      className="relative mb-2 block h-10 overflow-hidden rounded-lg border border-white/10 bg-background/50"
    >
      {(resolved === "flag" || decoration === "auto") && flagImage ? (
        <span
          className="absolute inset-0 bg-cover bg-center opacity-55"
          style={{ backgroundImage: `url(${JSON.stringify(flagImage)})` }}
        />
      ) : resolved !== "none" ? (
        <span
          className="country-decoration-layer"
          data-decoration={resolved}
          style={{ "--decoration-accent": accent } as React.CSSProperties}
        />
      ) : null}
    </span>
  );
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
  flush = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  flush?: boolean;
}) {
  return (
    <label className={flush ? "block" : "block rounded-xl bg-surface p-3"}>
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
