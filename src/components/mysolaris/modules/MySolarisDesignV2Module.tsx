import { Link, useRouterState } from "@tanstack/react-router";
import { Copy, Eye, Image, Monitor, Palette, Save, Smartphone, Sparkles, Type, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { CountryWorldOverview } from "@/components/CountryWorldOverview";
import { CountryCustomSections } from "@/components/country/CountryCustomSections";
import { CountryDesignV2Hero } from "@/components/country/CountryDesignV2Hero";
import { CountryDesignV2Styles } from "@/components/country/CountryDesignV2Styles";
import { uploadCountryBackground } from "@/lib/country-background";
import { useCountryWorldProfile, useMyCountryAccount } from "@/lib/country-account";
import {
  COUNTRY_ACCENT_OPTIONS,
  COUNTRY_CONTENT_LAYOUT_OPTIONS,
  COUNTRY_FONT_OPTIONS,
  COUNTRY_HERO_V2_OPTIONS,
  COUNTRY_SURFACE_OPTIONS,
  copyCountryDesignPart,
  countryDesignCssVariables,
  countryDesignFontCss,
  fontChoiceFromAsset,
  legacyThemeToCountryDesignV2,
  normalizeCountryDesignV2,
  suggestCountryPaletteFromImageUrl,
  uploadCountryFont,
  useCountryDesignPresets,
  useCountryDesignV2,
  useCountryFontAssets,
  usePublishCountryDesignV2,
  useSaveCountryDesignPreset,
  type CountryDesignV2,
  type CountryFontChoice,
} from "@/lib/country-design-v2";
import { useCountries } from "@/lib/data";
import { NAV_TARGETS, countrySearch } from "@/lib/navigation-targets";
import { countryThemeToVisual, useCountryTheme } from "@/lib/visual-theme";

type EditorMode = "simple" | "advanced";
type PreviewPage = "country" | "wiki";
type PreviewDevice = "desktop" | "mobile";

export function MySolarisDesignV2Module() {
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

  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Loading country designer…</p></AppShell>;
  }
  if (!country) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Country designer"
          title="No country selected"
          description="Claim a country before building its public design."
        />
      </AppShell>
    );
  }

  return <CountryDesignEditor country={country} targetCountryId={targetCountryId} />;
}

function CountryDesignEditor({
  country,
  targetCountryId,
}: {
  country: {
    id: string;
    name: string;
    native_name: string | null;
    short_code: string;
    region: string;
    description: string | null;
    flag_image: string | null;
    accent_color: string;
  };
  targetCountryId?: string;
}) {
  const legacyTheme = useCountryTheme(country.id);
  const designQuery = useCountryDesignV2(country.id);
  const publish = usePublishCountryDesignV2(country.id);
  const world = useCountryWorldProfile(country.id);
  const presets = useCountryDesignPresets();
  const savePreset = useSaveCountryDesignPreset();
  const fonts = useCountryFontAssets(country.id);
  const [design, setDesign] = useState<CountryDesignV2>(() =>
    legacyThemeToCountryDesignV2(null),
  );
  const [mode, setMode] = useState<EditorMode>("simple");
  const [previewPage, setPreviewPage] = useState<PreviewPage>("country");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [activeTarget, setActiveTarget] = useState("hero");
  const [message, setMessage] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetPublic, setPresetPublic] = useState(false);
  const [busyBackground, setBusyBackground] = useState(false);
  const [busyFont, setBusyFont] = useState(false);

  useEffect(() => {
    if (designQuery.data?.design) {
      setDesign(normalizeCountryDesignV2(designQuery.data.design));
      return;
    }
    const visual = countryThemeToVisual(legacyTheme.data ?? null);
    if (visual) setDesign(legacyThemeToCountryDesignV2(legacyTheme.data));
  }, [designQuery.data?.design, legacyTheme.data]);

  const customFontChoices = useMemo(
    () => (fonts.data ?? []).map(fontChoiceFromAsset),
    [fonts.data],
  );
  const allFonts = useMemo(
    () => [...COUNTRY_FONT_OPTIONS, ...customFontChoices],
    [customFontChoices],
  );

  const update = <K extends keyof CountryDesignV2>(key: K, value: CountryDesignV2[K]) =>
    setDesign((current) => ({ ...current, [key]: value }));

  const publishDesign = async () => {
    setMessage(null);
    try {
      await publish.mutateAsync(design);
      setMessage("V2 design published. The Country and Wiki routes now use this design.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The V2 design could not be published.");
    }
  };

  const saveCurrentDesign = async () => {
    const name = presetName.trim();
    if (!name) {
      setMessage("Give the saved design a name first.");
      return;
    }
    setMessage(null);
    try {
      await savePreset.mutateAsync({
        countryId: country.id,
        name,
        isPublic: presetPublic,
        design,
      });
      setPresetName("");
      setMessage(presetPublic ? "Public design saved." : "Private design saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The design could not be saved.");
    }
  };

  const suggestFromFlag = async () => {
    if (!country.flag_image) {
      setMessage("Add a flag image before generating colours from it.");
      return;
    }
    setMessage(null);
    try {
      setDesign(await suggestCountryPaletteFromImageUrl(country.flag_image, design));
      setMessage("Palette suggested from the current flag. Review it before publishing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The flag palette could not be generated.");
    }
  };

  const uploadBackground = async (file: File) => {
    setBusyBackground(true);
    setMessage(null);
    try {
      const asset = await uploadCountryBackground(country.id, file);
      setDesign((current) => ({
        ...current,
        background: {
          ...current.background,
          mode: "image",
          imageUrl: asset.publicUrl,
          imageStoragePath: asset.storagePath,
        },
      }));
      setMessage("Background uploaded into the unsaved V2 design.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Background upload failed.");
    } finally {
      setBusyBackground(false);
    }
  };

  const uploadFont = async (file: File) => {
    setBusyFont(true);
    setMessage(null);
    try {
      const font = await uploadCountryFont(country.id, file);
      await fonts.refetch();
      setDesign((current) => ({
        ...current,
        typography: { ...current.typography, display: font },
      }));
      setMessage(`${font.label} uploaded and selected as the display font.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Font upload failed.");
    } finally {
      setBusyFont(false);
    }
  };

  const legacyPublic = !designQuery.data?.isPublishedV2;

  return (
    <>
      <CountryDesignV2Styles />
      <AppShell>
        <PageHeader
          eyebrow="My country · Design"
          title={`${country.name} design builder`}
          description="Build one coherent Country/Wiki design by combining surface, typography, hero, content layout, accent and motion. V1 remains public until you explicitly publish V2."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link
                to={NAV_TARGETS.mySolarisCountry}
                search={countrySearch(targetCountryId)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                ← MySolaris country
              </Link>
              <Link
                to={NAV_TARGETS.mySolarisPageBuilder}
                search={countrySearch(targetCountryId)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                Sections & media
              </Link>
            </div>
          }
        />

        {legacyPublic ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/[0.07] p-4 text-sm">
            <strong>V1 compatibility is still public.</strong>
            <span className="ml-2 text-muted-foreground">
              This editor is a V2 draft generated from the current personality. Publishing is the cutover.
            </span>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-sm">
            <strong>V2 is public.</strong>
            <span className="ml-2 text-muted-foreground">Changes below stay local until you publish again.</span>
          </div>
        )}

        {message ? (
          <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{message}</p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
            {(["simple", "advanced"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`min-h-10 rounded-lg px-4 text-xs font-semibold capitalize ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void publishDesign()}
            disabled={publish.isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Save className="size-4" />
            {publish.isPending ? "Publishing…" : legacyPublic ? "Publish V2" : "Publish changes"}
          </button>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(420px,.82fr)_minmax(0,1.18fr)] 2xl:items-start">
          <div className="space-y-4">
            <Panel title="Surface" description="One material language applies across the whole page. Sections vary by emphasis, not by randomly switching material.">
              <OptionGrid
                value={design.surface}
                options={COUNTRY_SURFACE_OPTIONS}
                onChange={(surface) => update("surface", surface as CountryDesignV2["surface"])}
              />
            </Panel>

            <Panel title="Typography" description="Classica Crastao + Gotham is the Solaris recommended pairing. Fonts are independent from surface and layout.">
              <div className="mb-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[.13em] text-primary">★ Solaris recommended</p>
                <p className="mt-1 text-sm font-semibold">Classica Crastao + Gotham</p>
                <p className="mt-1 text-xs text-muted-foreground">Crastao for display identity; Gotham for headings, body, navigation and data.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FontSelect
                  label="Display"
                  value={design.typography.display}
                  fonts={allFonts}
                  onChange={(font) => setDesign((current) => ({ ...current, typography: { ...current.typography, display: font } }))}
                />
                <FontSelect
                  label="Heading"
                  value={design.typography.heading}
                  fonts={allFonts}
                  onChange={(font) => setDesign((current) => ({ ...current, typography: { ...current.typography, heading: font } }))}
                />
                <FontSelect
                  label="Body"
                  value={design.typography.body}
                  fonts={allFonts}
                  onChange={(font) => setDesign((current) => ({ ...current, typography: { ...current.typography, body: font } }))}
                />
              </div>
              <label className="mt-4 block rounded-xl border border-border bg-background/45 p-3">
                <span className="flex items-center gap-2 text-xs font-semibold"><Upload className="size-4" /> Upload custom font</span>
                <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">WOFF2, WOFF, TTF or OTF · max 4 MB. Uploaded fonts become public assets when used on a public country page.</span>
                <input
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                  disabled={busyFont}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFont(file);
                    event.currentTarget.value = "";
                  }}
                  className="mt-3 block w-full text-xs"
                />
              </label>
            </Panel>

            <Panel title="Hero" description="Hero composition is independent from the material and typography.">
              <OptionGrid
                value={design.hero.layout}
                options={COUNTRY_HERO_V2_OPTIONS}
                onChange={(layout) => {
                  setActiveTarget("hero");
                  setDesign((current) => ({
                    ...current,
                    hero: {
                      ...current.hero,
                      layout: layout as CountryDesignV2["hero"]["layout"],
                      alignment: layout === "centered" ? "center" : "left",
                    },
                  }));
                }}
              />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["left", "center", "right"] as const).map((alignment) => (
                  <button
                    key={alignment}
                    type="button"
                    onClick={() => setDesign((current) => ({ ...current, hero: { ...current.hero, alignment } }))}
                    className={`min-h-10 rounded-xl border text-xs font-semibold capitalize ${design.hero.alignment === alignment ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}
                  >
                    {alignment}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Toggle
                  label="Show flag"
                  checked={design.hero.showFlag}
                  onChange={(showFlag) => setDesign((current) => ({ ...current, hero: { ...current.hero, showFlag } }))}
                />
                <Toggle
                  label="Native name"
                  checked={design.hero.showNativeName}
                  onChange={(showNativeName) => setDesign((current) => ({ ...current, hero: { ...current.hero, showNativeName } }))}
                />
                <Toggle
                  label="Motto"
                  checked={design.hero.showMotto}
                  onChange={(showMotto) => setDesign((current) => ({ ...current, hero: { ...current.hero, showMotto } }))}
                />
              </div>
            </Panel>

            <Panel title="Default content layout" description="Individual sections can override this in Sections & media.">
              <OptionGrid
                value={design.content.defaultLayout}
                options={COUNTRY_CONTENT_LAYOUT_OPTIONS}
                onChange={(defaultLayout) =>
                  setDesign((current) => ({ ...current, content: { defaultLayout: defaultLayout as CountryDesignV2["content"]["defaultLayout"] } }))
                }
              />
            </Panel>

            <Panel title="Accent" description="Decoration is separate from the surface. Glass can be Luxury, Futuristic, Brutalist or anything else without becoming a different material engine.">
              <OptionGrid
                value={design.accent}
                options={COUNTRY_ACCENT_OPTIONS}
                onChange={(accent) => update("accent", accent as CountryDesignV2["accent"])}
              />
            </Panel>

            <Panel title="Motion" description="Reduced-motion preferences always override these effects.">
              <OptionGrid
                value={design.motion}
                options={[
                  { id: "subtle", label: "Subtle" },
                  { id: "medium", label: "Medium" },
                  { id: "heavy", label: "Heavy" },
                ]}
                onChange={(motion) => update("motion", motion as CountryDesignV2["motion"])}
              />
            </Panel>

            <Panel
              title="Country colours"
              description="Solaris keeps semantic contrast readable instead of blindly applying country colours to every piece of text."
              actions={
                <button
                  type="button"
                  onClick={() => void suggestFromFlag()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.07] px-3 text-[11px] font-semibold text-primary"
                >
                  <Sparkles className="size-3.5" /> Suggest from flag
                </button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ColourField label="Background 1" value={design.palette.backgroundPrimary} onChange={(value) => patchPalette("backgroundPrimary", value, setDesign)} />
                <ColourField label="Background 2" value={design.palette.backgroundSecondary} onChange={(value) => patchPalette("backgroundSecondary", value, setDesign)} />
                <ColourField label="Accent" value={design.palette.accent} onChange={(value) => patchPalette("accent", value, setDesign)} />
                <ColourField label="Surface" value={design.palette.surface} onChange={(value) => patchPalette("surface", value, setDesign)} />
                <ColourField label="Main text" value={design.palette.textPrimary} onChange={(value) => patchPalette("textPrimary", value, setDesign)} />
                <ColourField label="Muted text" value={design.palette.textMuted} onChange={(value) => patchPalette("textMuted", value, setDesign)} />
              </div>
            </Panel>

            {mode === "advanced" ? (
              <>
                <Panel title="Background" description="Use a whole-page solid, gradient or image background. Individual sections can also use their own background imagery in the section builder.">
                  <OptionGrid
                    value={design.background.mode}
                    options={[
                      { id: "solid", label: "Solid" },
                      { id: "gradient", label: "Gradient" },
                      { id: "image", label: "Image" },
                    ]}
                    onChange={(modeValue) => setDesign((current) => ({ ...current, background: { ...current.background, mode: modeValue as CountryDesignV2["background"]["mode"] } }))}
                  />
                  {design.background.mode === "gradient" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Select
                        label="Gradient"
                        value={design.background.gradientStyle}
                        options={[["aurora", "Aurora"], ["linear", "Linear"], ["radial", "Radial"]]}
                        onChange={(gradientStyle) => setDesign((current) => ({ ...current, background: { ...current.background, gradientStyle: gradientStyle as CountryDesignV2["background"]["gradientStyle"] } }))}
                      />
                      <Range
                        label="Angle"
                        min={0}
                        max={360}
                        value={design.background.gradientAngle}
                        onChange={(gradientAngle) => setDesign((current) => ({ ...current, background: { ...current.background, gradientAngle } }))}
                      />
                    </div>
                  ) : null}
                  {design.background.mode === "image" ? (
                    <label className="mt-3 block rounded-xl border border-border bg-background/45 p-3">
                      <span className="flex items-center gap-2 text-xs font-semibold"><Image className="size-4" /> Background image</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        disabled={busyBackground}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadBackground(file);
                          event.currentTarget.value = "";
                        }}
                        className="mt-3 block w-full text-xs"
                      />
                    </label>
                  ) : null}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Range label="Horizontal position" min={0} max={100} value={design.background.positionX} onChange={(positionX) => patchBackground("positionX", positionX, setDesign)} />
                    <Range label="Vertical position" min={0} max={100} value={design.background.positionY} onChange={(positionY) => patchBackground("positionY", positionY, setDesign)} />
                    <Range label="Overlay" min={0} max={90} value={Math.round(design.background.overlay * 100)} onChange={(value) => patchBackground("overlay", value / 100, setDesign)} />
                    <Range label="Blur" min={0} max={30} value={design.background.blur} onChange={(blur) => patchBackground("blur", blur, setDesign)} />
                  </div>
                </Panel>

                <Panel title="Fine tuning" description="Advanced values stay bounded so the page can remain responsive and accessible.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Range label="Corner radius" min={0} max={40} value={design.tuning.radius} onChange={(radius) => patchTuning("radius", radius, setDesign)} />
                    <Range label="Spacing" min={72} max={145} value={Math.round(design.tuning.spacing * 100)} onChange={(value) => patchTuning("spacing", value / 100, setDesign)} />
                    <Range label="Content width" min={760} max={1600} step={20} value={design.tuning.contentWidth} onChange={(contentWidth) => patchTuning("contentWidth", contentWidth, setDesign)} />
                    <Range label="Shadow depth" min={0} max={100} value={Math.round(design.tuning.shadowDepth * 100)} onChange={(value) => patchTuning("shadowDepth", value / 100, setDesign)} />
                    <Range label="Surface opacity" min={35} max={100} value={Math.round(design.tuning.transparency * 100)} onChange={(value) => patchTuning("transparency", value / 100, setDesign)} />
                  </div>
                </Panel>
              </>
            ) : null}

            <Panel title="Save your own design" description="Solaris does not ship a preset catalogue. Saved designs come from users. Public designs can be copied by other delegations.">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Design name"
                  maxLength={80}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void saveCurrentDesign()}
                  disabled={savePreset.isPending}
                  className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  Save design
                </button>
              </div>
              <Toggle label="Make this design public" checked={presetPublic} onChange={setPresetPublic} className="mt-3" />

              <div className="mt-4 space-y-2">
                {(presets.data ?? []).slice(0, 12).map((preset) => (
                  <div key={preset.id} className="rounded-xl border border-border bg-background/45 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{preset.name}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[.1em] text-muted-foreground">{preset.is_public ? "Public design" : "Private design"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDesign(copyCountryDesignPart(design, preset.design_json, "all"))}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold"
                      >
                        <Copy className="size-3.5" /> Copy all
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["surface", "typography", "hero", "content", "colors", "motion"] as const).map((part) => (
                        <button
                          key={part}
                          type="button"
                          onClick={() => setDesign(copyCountryDesignPart(design, preset.design_json, part))}
                          className="min-h-8 rounded-lg bg-surface px-2.5 text-[10px] font-semibold capitalize"
                        >
                          {part}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!presets.isLoading && !(presets.data ?? []).length ? (
                  <p className="text-xs text-muted-foreground">No saved public or private designs yet.</p>
                ) : null}
              </div>
            </Panel>
          </div>

          <div className="2xl:sticky 2xl:top-24">
            <Panel
              title="Live public renderer"
              description="This preview uses the same V2 hero, surface tokens and real country sections as the public routes. Click editable regions to jump their design focus."
              actions={
                <div className="flex flex-wrap gap-1">
                  <PreviewButton active={previewPage === "country"} onClick={() => setPreviewPage("country")}><Eye className="size-3.5" /> Country</PreviewButton>
                  <PreviewButton active={previewPage === "wiki"} onClick={() => setPreviewPage("wiki")}><Type className="size-3.5" /> Wiki</PreviewButton>
                  <PreviewButton active={previewDevice === "desktop"} onClick={() => setPreviewDevice("desktop")} ariaLabel="Desktop preview"><Monitor className="size-3.5" /></PreviewButton>
                  <PreviewButton active={previewDevice === "mobile"} onClick={() => setPreviewDevice("mobile")} ariaLabel="Mobile preview"><Smartphone className="size-3.5" /></PreviewButton>
                </div>
              }
            >
              <div className="overflow-x-auto rounded-xl bg-background/40 p-2">
                <div className={previewDevice === "mobile" ? "mx-auto w-[min(390px,100%)]" : "w-full"}>
                  <DesignPreview
                    country={country}
                    design={design}
                    world={world.data}
                    page={previewPage}
                    activeTarget={activeTarget}
                    onTarget={setActiveTarget}
                  />
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </AppShell>
    </>
  );
}

function DesignPreview({
  country,
  design,
  world,
  page,
  activeTarget,
  onTarget,
}: {
  country: {
    id: string;
    name: string;
    native_name: string | null;
    short_code: string;
    region: string;
    description: string | null;
    flag_image: string | null;
  };
  design: CountryDesignV2;
  world?: ReturnType<typeof useCountryWorldProfile>["data"];
  page: PreviewPage;
  activeTarget: string;
  onTarget: (target: string) => void;
}) {
  const style = countryDesignCssVariables(design);
  const fontCss = countryDesignFontCss(design);
  const profile = world?.profile ?? null;
  const sections = world?.sections ?? [];
  const media = world?.media ?? [];

  return (
    <div
      className={`country-design-v2 ${page === "wiki" ? "wiki-canvas" : "country-profile-v8"}`}
      data-country-surface={design.surface}
      data-country-accent={design.accent}
      data-country-motion={design.motion}
      data-country-default-layout={design.content.defaultLayout}
      data-country-design-editor="true"
      style={style}
      onClickCapture={(event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-design-target]");
        if (target?.dataset.designTarget) onTarget(target.dataset.designTarget);
      }}
    >
      {fontCss ? <style>{fontCss}</style> : null}
      <CountryDesignV2Hero
        as={page === "wiki" ? "header" : "section"}
        compact={page === "wiki"}
        design={design}
        code={country.short_code}
        name={country.name}
        nativeName={country.native_name}
        region={country.region}
        description={country.description}
        motto={profile?.motto}
        flagImage={country.flag_image}
        eyebrow={page === "wiki" ? "Terra Solaris Wiki" : "Terra Solaris"}
        editorActive={activeTarget === "hero"}
        className="mb-5"
        actions={
          <>
            <button type="button">Wiki</button>
            <button type="button">Compare</button>
            <button type="button">Follow</button>
          </>
        }
      />

      {page === "country" ? (
        <div className="space-y-4" data-design-target="content">
          <CountryWorldOverview country={country as any} />
          <CountryCustomSections
            country={country as any}
            profile={profile}
            sections={sections}
            media={media}
            surface="country"
          />
        </div>
      ) : (
        <article className="wiki-article-surface min-w-0" data-design-target="content">
          <section className="wiki-introduction wiki-prose-section">
            <p className="wiki-section-kicker">Terra Solaris Wiki</p>
            <h2>Introduction</h2>
            <p className="wiki-prose">{profile?.summary || country.description || `${country.name} is part of ${country.region}.`}</p>
          </section>
          <CountryCustomSections
            country={country as any}
            profile={profile}
            sections={sections}
            media={media}
            surface="wiki"
          />
        </article>
      )}
    </div>
  );
}

function OptionGrid({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { id: string; label: string; description?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`min-h-16 rounded-xl border p-3 text-left ${value === option.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}
        >
          <span className="text-xs font-semibold">{option.label}</span>
          {option.description ? <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{option.description}</span> : null}
        </button>
      ))}
    </div>
  );
}

function FontSelect({
  label,
  value,
  fonts,
  onChange,
}: {
  label: string;
  value: CountryFontChoice;
  fonts: CountryFontChoice[];
  onChange: (font: CountryFontChoice) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value.id}
        onChange={(event) => {
          const font = fonts.find((item) => item.id === event.target.value);
          if (font) onChange(font);
        }}
        className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
      >
        {fonts.map((font) => (
          <option key={font.id} value={font.id}>{font.label} · {font.category}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-background/45 px-3 text-xs font-semibold ${className}`}>
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-xl border border-border bg-background/45 p-3">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 rounded-lg border border-border bg-background p-1" />
        <input value={value} onChange={(event) => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && onChange(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs" />
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function Range({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-1.5 flex justify-between gap-2 text-xs font-semibold text-muted-foreground"><span>{label}</span><span>{Math.round(value * 100) / 100}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-current" />
    </label>
  );
}

function PreviewButton({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-semibold ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}
    >
      {children}
    </button>
  );
}

function patchPalette(
  key: keyof CountryDesignV2["palette"],
  value: string,
  setDesign: React.Dispatch<React.SetStateAction<CountryDesignV2>>,
) {
  setDesign((current) => ({ ...current, palette: { ...current.palette, [key]: value } }));
}

function patchBackground(
  key: "positionX" | "positionY" | "overlay" | "blur",
  value: number,
  setDesign: React.Dispatch<React.SetStateAction<CountryDesignV2>>,
) {
  setDesign((current) => ({ ...current, background: { ...current.background, [key]: value } }));
}

function patchTuning(
  key: keyof CountryDesignV2["tuning"],
  value: number,
  setDesign: React.Dispatch<React.SetStateAction<CountryDesignV2>>,
) {
  setDesign((current) => ({ ...current, tuning: { ...current.tuning, [key]: value } }));
}
