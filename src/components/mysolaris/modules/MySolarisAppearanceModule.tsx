import { Link, useRouterState } from "@tanstack/react-router";
import { Eye, Image, Layers3, Monitor, Palette, Smartphone, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { CountryIdentityHero } from "@/components/country/CountryIdentityHero";
import { uploadCountryBackground } from "@/lib/country-background";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  COUNTRY_PERSONALITIES,
  canonicalCountryPersonalityId,
  countryPersonality,
  personalityDecorations,
  wikiStyleForPersonality,
} from "@/lib/country-personality-system";
import { useCountries } from "@/lib/data";
import { NAV_TARGETS, countrySearch } from "@/lib/navigation-targets";
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
  type CountryVisualTheme,
} from "@/lib/visual-theme";

export function MySolarisAppearanceModule() {
  return (
    <>
      <CountryPersonalityStyles />
      <CountryThemePage />
    </>
  );
}

const DECORATION_META: Record<CountryDecorationStyle, { label: string; description: string }> = {
  auto: { label: "Art-directed", description: "Use the signature treatment designed for this personality." },
  none: { label: "None", description: "Keep only the personality's structural design." },
  flag: { label: "Flag material", description: "Use the flag decoratively behind the protected official flag." },
  orbits: { label: "Orbits", description: "Fine orbital rings in the country accent." },
  rays: { label: "Rays", description: "Graphic rays for expressive poster and festival layouts." },
  grid: { label: "Grid", description: "A restrained technical or editorial reference grid." },
  waves: { label: "Waves", description: "Curved reference lines for fluid and geographic treatments." },
  aurora: { label: "Aurora", description: "Soft atmospheric colour fields." },
  constellation: { label: "Constellation", description: "Technical star points with minimal connecting geometry." },
  facets: { label: "Facets", description: "Controlled angular planes for graphic personalities." },
  topography: { label: "Topography", description: "Contour-line detail for archive and atlas personalities." },
  eclipse: { label: "Eclipse", description: "A restrained halo for dark stage layouts." },
};

type PreviewPage = "country" | "wiki";
type PreviewDevice = "desktop" | "mobile";

function CountryThemePage() {
  const search = useRouterState({ select: (state) => state.location.search });
  const targetCountryId =
    search && typeof search === "object" && "country" in search && typeof search.country === "string"
      ? search.country
      : undefined;
  const { data: accountData, isLoading } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const access = accountData?.access;
  const ownCountry = accountData?.country;
  const adminTarget =
    access?.isOrganizer && targetCountryId
      ? (countries ?? []).find((item) => item.id === targetCountryId)
      : null;
  const country = adminTarget ?? ownCountry;
  const { data: savedTheme } = useCountryTheme(country?.id);
  const saveTheme = useSaveCountryTheme(country?.id);
  const [theme, setTheme] = useState<CountryVisualTheme>(DEFAULT_COUNTRY_THEME);
  const [message, setMessage] = useState<string | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState<PreviewPage>("country");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");

  useEffect(() => {
    const existing = countryThemeToVisual(savedTheme);
    if (existing) {
      const personality = canonicalCountryPersonalityId(existing.heroLayout);
      const allowed = personalityDecorations(personality);
      setTheme({
        ...existing,
        heroLayout: personality,
        decorationStyle: allowed.includes(existing.decorationStyle)
          ? existing.decorationStyle
          : allowed.includes("auto")
            ? "auto"
            : allowed[0] ?? "none",
      });
      return;
    }
    if (country?.accent_color) {
      setTheme((current) => ({ ...current, accent: country.accent_color }));
    }
  }, [savedTheme, country?.accent_color]);

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
        <Link to={NAV_TARGETS.mySolarisCountry} className="rounded-xl border border-border bg-surface px-4 py-2 text-sm">
          Open MySolaris country
        </Link>
      </AppShell>
    );
  }

  const personality = countryPersonality(theme.heroLayout);
  const allowedDecorations = personalityDecorations(theme.heroLayout);
  const colourReport = getThemeColourReport(theme);

  const setThemeValue = <K extends keyof CountryVisualTheme>(key: K, value: CountryVisualTheme[K]) => {
    setTheme((current) => ({ ...current, [key]: value }));
  };

  const selectPersonality = (next: CountryVisualTheme["heroLayout"]) => {
    const canonical = canonicalCountryPersonalityId(next);
    const decorations = personalityDecorations(canonical);
    setTheme((current) => ({
      ...current,
      heroLayout: canonical,
      decorationStyle: decorations.includes(current.decorationStyle)
        ? current.decorationStyle
        : decorations.includes("auto")
          ? "auto"
          : decorations[0] ?? "none",
    }));
  };

  const save = async () => {
    setMessage(null);
    try {
      await saveTheme.mutateAsync({
        ...theme,
        heroLayout: canonicalCountryPersonalityId(theme.heroLayout),
      });
      setMessage("Appearance saved. The country page and Wiki now use this V7 personality system.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appearance could not be saved.");
    }
  };

  const reset = () => {
    setTheme({
      ...DEFAULT_COUNTRY_THEME,
      heroLayout: "glass-card",
      accent: country.accent_color || DEFAULT_COUNTRY_THEME.accent,
    });
    setMessage("Reset locally. Save to publish the reset appearance.");
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
      setMessage("Background uploaded. Adjust crop, overlay and blur, then save appearance.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Background upload failed.");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const preview = (
    <CountryThemePreview
      countryName={country.name}
      nativeName={country.native_name}
      code={country.short_code}
      region={country.region}
      description={country.description}
      flagImage={country.flag_image}
      accentColor={country.accent_color}
      theme={theme}
      page={previewPage}
      device={previewDevice}
    />
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="My country · Appearance"
        title={`${country.name} appearance`}
        description="Choose a fully designed personality, then tune only the compatible visual details. Structure, flag safety and mobile behaviour stay protected by Solaris."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={NAV_TARGETS.mySolarisCountry} search={countrySearch(targetCountryId)} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              ← MySolaris country
            </Link>
            <Link to={NAV_TARGETS.mySolarisPageBuilder} search={countrySearch(targetCountryId)} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              Page & media
            </Link>
            <Link to="/countries/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              Country page →
            </Link>
            <Link to="/wiki/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              Wiki →
            </Link>
          </div>
        }
      />

      {message && <p className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{message}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)]">
        <div className="space-y-5">
          <Panel
            title="Personality"
            description="Seventeen deliberately different visual systems. The same protected content structure sits underneath every one."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COUNTRY_PERSONALITIES.map((option) => {
                const selected = option.id === theme.heroLayout;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectPersonality(option.id)}
                    aria-pressed={selected}
                    className={`min-w-0 rounded-xl border p-2.5 text-left transition ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/25" : "border-border bg-surface hover:border-primary/30"}`}
                  >
                    <PersonalityMiniature
                      personality={option.id}
                      countryName={country.name}
                      flagImage={country.flag_image}
                      theme={theme}
                    />
                    <span className="mt-2 block text-sm font-semibold">{option.name}</span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-primary">{option.category}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.concept}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Personality details"
            description={`${personality.name} is a ${personality.density} design with a ${personality.wikiStyle} Wiki treatment.`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {personality.signature.map((item) => (
                <div key={item} className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">Signature component</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{item.replaceAll("-", " ")}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Decoration" description="Only decorations designed to work with this personality are available.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {allowedDecorations.map((value) => {
                const meta = DECORATION_META[value];
                const selected = theme.decorationStyle === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setThemeValue("decorationStyle", value)}
                    aria-pressed={selected}
                    className={`min-h-20 rounded-xl border p-3 text-left ${selected ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
                  >
                    <span className="text-xs font-semibold">{meta.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Background" description="Country-owned atmosphere. It never controls the protected content geometry.">
            <div className="grid grid-cols-3 gap-2">
              <ModeButton active={theme.backgroundMode === "solid"} icon={Palette} label="Solid" onClick={() => setThemeValue("backgroundMode", "solid")} />
              <ModeButton active={theme.backgroundMode === "gradient"} icon={Sparkles} label="Gradient" onClick={() => setThemeValue("backgroundMode", "gradient")} />
              <ModeButton active={theme.backgroundMode === "image"} icon={Image} label="Image" onClick={() => setThemeValue("backgroundMode", "image")} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ColourField label="Background 1" value={theme.backgroundPrimary} onChange={(value) => setThemeValue("backgroundPrimary", value)} />
              <ColourField label="Background 2" value={theme.backgroundSecondary} onChange={(value) => setThemeValue("backgroundSecondary", value)} />
            </div>

            {theme.backgroundMode === "gradient" && (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-background/45 p-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Gradient style</span>
                  <select
                    value={theme.gradientStyle}
                    onChange={(event) => setThemeValue("gradientStyle", event.target.value as CountryVisualTheme["gradientStyle"])}
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="aurora">Aurora</option>
                    <option value="linear">Linear</option>
                    <option value="radial">Radial</option>
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColourField
                    label="Background 3"
                    value={theme.backgroundTertiary ?? suggestThirdBackground(theme)}
                    onChange={(value) => setThemeValue("backgroundTertiary", value)}
                    flush
                  />
                  <RangeField label="Angle" min={0} max={360} value={theme.gradientAngle} onChange={(value) => setThemeValue("gradientAngle", value)} />
                </div>
              </div>
            )}

            {theme.backgroundMode === "image" && (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-background/45 p-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Country background image</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    disabled={backgroundBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadBackground(file);
                      event.currentTarget.value = "";
                    }}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary"
                  />
                </label>
                <RangeField label="Horizontal crop" min={0} max={100} value={theme.backgroundPositionX} onChange={(value) => setThemeValue("backgroundPositionX", value)} />
                <RangeField label="Vertical crop" min={0} max={100} value={theme.backgroundPositionY} onChange={(value) => setThemeValue("backgroundPositionY", value)} />
                <RangeField label="Dark overlay" min={0} max={90} value={Math.round(theme.backgroundOverlay * 100)} onChange={(value) => setThemeValue("backgroundOverlay", value / 100)} />
                <RangeField label="Background blur" min={0} max={30} value={theme.backgroundBlur} onChange={(value) => setThemeValue("backgroundBlur", value)} />
              </div>
            )}
          </Panel>

          <Panel title="Colour roles" description="Brand colours are converted into readable semantic UI roles instead of being applied blindly to text.">
            <div className="grid gap-3 sm:grid-cols-2">
              <ColourField label="Accent" value={theme.accent} onChange={(value) => setThemeValue("accent", value)} />
              <ColourField label="Surface" value={theme.surface} onChange={(value) => setThemeValue("surface", value)} />
              <ColourField label="Primary text preference" value={theme.textPrimary} onChange={(value) => setThemeValue("textPrimary", value)} />
              <ColourField label="Muted text preference" value={theme.textMuted} onChange={(value) => setThemeValue("textMuted", value)} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <ContrastStat label="Main text" value={colourReport.mainTextContrast} target={4.5} />
              <ContrastStat label="Muted text" value={colourReport.mutedTextContrast} target={3.4} />
              <ContrastStat label="Accent control" value={colourReport.buttonContrast} target={4.5} />
            </div>
          </Panel>

          <div className="sticky bottom-20 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur sm:bottom-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <button type="button" onClick={() => setMobilePreviewOpen(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 text-sm font-semibold xl:hidden">
              <Eye className="size-4" /> Preview
            </button>
            <button type="button" onClick={save} disabled={saveTheme.isPending || backgroundBusy} className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saveTheme.isPending ? "Saving…" : "Save appearance"}
            </button>
            <button type="button" onClick={reset} className="min-h-12 rounded-xl border border-border bg-surface px-4 text-sm font-semibold">Reset</button>
          </div>
        </div>

        <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
          <Panel
            title="Live preview"
            description="Check the actual structural system on desktop and mobile before saving."
            actions={<PreviewControls page={previewPage} device={previewDevice} onPage={setPreviewPage} onDevice={setPreviewDevice} />}
          >
            {preview}
          </Panel>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground">
            <Layers3 className="mt-0.5 size-4 shrink-0" />
            <span>Page content, custom sections and media still come from the page builder. Appearance controls art direction without being allowed to break semantic layout.</span>
          </div>
        </div>
      </div>

      {mobilePreviewOpen && (
        <div className="fixed inset-0 z-[120] xl:hidden" role="dialog" aria-modal="true" aria-label="Country appearance preview">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close preview" onClick={() => setMobilePreviewOpen(false)} />
          <section className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-[1.75rem] border border-border bg-background p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Unsaved preview</p>
                <p className="mt-1 text-sm font-semibold">{personality.name}</p>
              </div>
              <button type="button" onClick={() => setMobilePreviewOpen(false)} className="grid size-11 place-items-center rounded-xl border border-border bg-surface" aria-label="Close preview"><X className="size-4" /></button>
            </div>
            <PreviewControls page={previewPage} device="mobile" onPage={setPreviewPage} onDevice={setPreviewDevice} compact />
            {preview}
            <button type="button" onClick={() => setMobilePreviewOpen(false)} className="mt-3 min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Back to editing</button>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function CountryThemePreview({
  countryName,
  nativeName,
  code,
  region,
  description,
  flagImage,
  accentColor,
  theme,
  page,
  device,
}: {
  countryName: string;
  nativeName: string | null;
  code: string;
  region: string;
  description: string | null;
  flagImage: string | null;
  accentColor: string;
  theme: CountryVisualTheme;
  page: PreviewPage;
  device: PreviewDevice;
}) {
  const personality = canonicalCountryPersonalityId(theme.heroLayout);
  const wikiStyle = wikiStyleForPersonality(personality);
  const style = {
    ...themeStyleProperties(theme),
    "--country-page-background": countryBackgroundCss(theme),
    "--country-page-position": `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`,
    background: countryBackgroundCss(theme),
    backgroundPosition: `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`,
    backgroundSize: theme.backgroundMode === "image" ? "cover" : undefined,
  } as CSSProperties;

  return (
    <div className="country-theme-preview-context mt-4 overflow-x-auto rounded-xl border border-border bg-background/45 p-2 sm:p-3" style={style}>
      <div className={device === "mobile" ? "mx-auto w-[min(390px,100%)]" : "w-full"}>
        {page === "country" ? (
          <div className="country-profile-v7 country-theme-live-preview-v7" data-country-personality={personality}>
            <CountryIdentityHero
              personality={personality}
              decoration={theme.decorationStyle}
              code={code}
              name={countryName}
              nativeName={nativeName}
              region={region}
              description={description || "National story, SSC history and custom sections are presented below this identity area."}
              flagImage={flagImage}
              accentColor={accentColor}
              actions={
                <>
                  <button type="button">Wiki</button>
                  <button type="button">Compare</button>
                  <button type="button">Follow</button>
                </>
              }
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="data-panel p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-primary">Country facts</p><p className="mt-2 text-sm text-muted-foreground">Structured sections inherit the personality without becoming nested decorative cards.</p></div>
              <div className="data-panel p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-primary">SSC record</p><p className="mt-2 text-sm text-muted-foreground">Results and history use the same spacing, typography and surface grammar.</p></div>
            </div>
          </div>
        ) : (
          <div className="wiki-canvas-v7" data-country-personality={personality} data-wiki-style={wikiStyle}>
            <CountryIdentityHero
              as="header"
              compact
              personality={personality}
              decoration={theme.decorationStyle}
              code={code}
              name={countryName}
              nativeName={nativeName}
              region={region}
              flagImage={flagImage}
              accentColor={accentColor}
              eyebrow="Terra Solaris Wiki"
              actions={<button type="button">Country page →</button>}
            />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
              <article className="wiki-article-surface min-w-0 p-4 sm:p-5">
                <p className="wiki-section-kicker">Terra Solaris Wiki</p>
                <h2 className="mt-1 font-display text-xl font-bold">Introduction</h2>
                <div className="wiki-heading-rule" />
                <p className="wiki-prose">{countryName} is a country in {region || "Terra Solaris"}. Wiki personality is intentionally quieter than the country dashboard so long-form reading remains primary.</p>
                <h3 className="wiki-feature-title mt-6">Country and culture</h3>
                <p className="wiki-prose mt-2">Headings, article measure, facts and references keep the selected identity without turning paragraphs into decorative cards.</p>
              </article>
              <aside className="wiki-infobox p-3">
                {flagImage ? <img src={flagImage} alt="" className="max-h-24 w-full object-contain" /> : null}
                <strong className="mt-2 block">{countryName}</strong>
                <dl className="mt-2 text-xs"><div className="flex justify-between gap-2"><dt>Region</dt><dd>{region}</dd></div><div className="mt-1 flex justify-between gap-2"><dt>Style</dt><dd className="capitalize">{wikiStyle}</dd></div></dl>
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewControls({
  page,
  device,
  onPage,
  onDevice,
  compact = false,
}: {
  page: PreviewPage;
  device: PreviewDevice;
  onPage: (value: PreviewPage) => void;
  onDevice: (value: PreviewDevice) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "mt-2" : ""}`}>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background/45 p-1" aria-label="Preview page">
        {(["country", "wiki"] as const).map((value) => (
          <button key={value} type="button" onClick={() => onPage(value)} aria-pressed={page === value} className={`min-h-9 rounded-lg px-3 text-xs font-semibold capitalize ${page === value ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}>{value}</button>
        ))}
      </div>
      {!compact && (
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background/45 p-1" aria-label="Preview device">
          <button type="button" onClick={() => onDevice("desktop")} aria-pressed={device === "desktop"} className={`grid min-h-9 place-items-center rounded-lg px-3 ${device === "desktop" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} aria-label="Desktop preview"><Monitor className="size-4" /></button>
          <button type="button" onClick={() => onDevice("mobile")} aria-pressed={device === "mobile"} className={`grid min-h-9 place-items-center rounded-lg px-3 ${device === "mobile" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} aria-label="Mobile preview"><Smartphone className="size-4" /></button>
        </div>
      )}
    </div>
  );
}

function PersonalityMiniature({
  personality,
  countryName,
  flagImage,
  theme,
}: {
  personality: CountryVisualTheme["heroLayout"];
  countryName: string;
  flagImage: string | null;
  theme: CountryVisualTheme;
}) {
  return (
    <span
      aria-hidden="true"
      className="personality-miniature-v7"
      data-country-personality={personality}
      style={themeStyleProperties(theme) as CSSProperties}
    >
      {flagImage ? <img src={flagImage} alt="" className="mini-flag" /> : null}
      <span className="mini-title">{countryName}</span>
    </span>
  );
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Palette; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}>
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function RangeField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground"><span>{label}</span><span className="numeric text-[10px]">{value}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-current" />
    </label>
  );
}

function ColourField({ label, value, onChange, flush = false }: { label: string; value: string; onChange: (value: string) => void; flush?: boolean }) {
  return (
    <label className={flush ? "block" : "block rounded-xl bg-surface p-3"}>
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 rounded-lg border border-border bg-background p-1" />
        <input value={value} onChange={(event) => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && onChange(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs" />
      </div>
    </label>
  );
}

function ContrastStat({ label, value, target }: { label: string; value: number; target: number }) {
  const pass = value >= target;
  return (
    <div className="rounded-xl border border-border bg-background/45 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2"><strong className="numeric text-lg">{value.toFixed(2)}:1</strong><span className={`text-[10px] font-bold ${pass ? "text-emerald-300" : "text-amber-300"}`}>{pass ? "PASS" : "AUTO-CORRECTED"}</span></div>
    </div>
  );
}
