import { createFileRoute, Link } from "@tanstack/react-router";
import { Image, Layers3, Palette, Sparkles } from "lucide-react";
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
  type CountryVisualTheme,
} from "@/lib/visual-theme";

export const Route = createFileRoute("/_authenticated/country-hub/theme")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Country appearance — Solaris Studio" }] }),
  component: CountryThemePage,
});

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

  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Loading country appearance…</p></AppShell>;
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader eyebrow="Country appearance" title="No country account" description="Claim a country before creating its visual identity." />
        <Link to="/country-hub" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm">Open My Solaris</Link>
      </AppShell>
    );
  }

  const setColour = (key: keyof Pick<CountryVisualTheme, "backgroundPrimary" | "backgroundSecondary" | "accent" | "surface" | "textPrimary" | "textMuted">, value: string) =>
    setTheme((current) => ({ ...current, [key]: value }));

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

  return (
    <AppShell>
      <PageHeader
        eyebrow="My Solaris · Country appearance"
        title={`${country.name} appearance`}
        description="Build a distinct country identity without losing readability. Colours, gradients and background imagery stay synced across the public country page and Terra Solaris Wiki."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/country-hub" search={targetCountryId ? { country: targetCountryId } : {}} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">← My Solaris</Link>
            <Link to="/countries/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Preview country →</Link>
            <Link to="/wiki/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Preview Wiki →</Link>
          </div>
        }
      />

      {message && <p className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{message}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
        <div className="space-y-5">
          <Panel title="Background" description="Use a solid colour, a custom gradient or your own full-page image.">
            <div className="grid grid-cols-3 gap-2">
              <ModeButton active={theme.backgroundMode === "solid"} icon={Palette} label="Solid" onClick={() => setTheme((current) => ({ ...current, backgroundMode: "solid" }))} />
              <ModeButton active={theme.backgroundMode === "gradient"} icon={Sparkles} label="Gradient" onClick={() => setTheme((current) => ({ ...current, backgroundMode: "gradient" }))} />
              <ModeButton active={theme.backgroundMode === "image"} icon={Image} label="Image" onClick={() => setTheme((current) => ({ ...current, backgroundMode: "image" }))} />
            </div>

            {theme.backgroundMode === "gradient" && (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Gradient style</span><select value={theme.gradientStyle} onChange={(event) => setTheme((current) => ({ ...current, gradientStyle: event.target.value as CountryVisualTheme["gradientStyle"] }))} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="aurora">Aurora glow</option><option value="linear">Linear</option><option value="radial">Radial spotlight</option></select></label>
                  <RangeField label={`Angle · ${theme.gradientAngle}°`} min={0} max={360} value={theme.gradientAngle} onChange={(value) => setTheme((current) => ({ ...current, gradientAngle: value }))} />
                </div>
                {theme.gradientStyle !== "linear" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RangeField label={`Glow position X · ${theme.backgroundPositionX}%`} min={0} max={100} value={theme.backgroundPositionX} onChange={(value) => setTheme((current) => ({ ...current, backgroundPositionX: value }))} />
                    <RangeField label={`Glow position Y · ${theme.backgroundPositionY}%`} min={0} max={100} value={theme.backgroundPositionY} onChange={(value) => setTheme((current) => ({ ...current, backgroundPositionY: value }))} />
                  </div>
                )}
              </div>
            )}

            {theme.backgroundMode === "image" && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-semibold">Custom background image</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  <strong className="text-foreground">Recommended:</strong> 1920×1080 or larger, ideally 2560×1440, 16:9. Keep important details near the centre because phones crop the sides. JPG, PNG, WebP or GIF, maximum 8 MB.
                </p>
                {theme.backgroundImageUrl && <img src={theme.backgroundImageUrl} alt="Current country background" className="mt-3 aspect-video w-full rounded-xl object-cover" style={{ objectPosition: `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%` }} />}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={backgroundBusy} onChange={(event) => event.target.files?.[0] && void uploadBackground(event.target.files[0])} className="mt-3 block w-full text-xs" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <RangeField label={`Horizontal crop · ${theme.backgroundPositionX}%`} min={0} max={100} value={theme.backgroundPositionX} onChange={(value) => setTheme((current) => ({ ...current, backgroundPositionX: value }))} />
                  <RangeField label={`Vertical crop · ${theme.backgroundPositionY}%`} min={0} max={100} value={theme.backgroundPositionY} onChange={(value) => setTheme((current) => ({ ...current, backgroundPositionY: value }))} />
                  <RangeField label={`Dark overlay · ${Math.round(theme.backgroundOverlay * 100)}%`} min={0} max={90} value={Math.round(theme.backgroundOverlay * 100)} onChange={(value) => setTheme((current) => ({ ...current, backgroundOverlay: value / 100 }))} />
                  <RangeField label={`Background blur · ${theme.backgroundBlur}px`} min={0} max={30} value={theme.backgroundBlur} onChange={(value) => setTheme((current) => ({ ...current, backgroundBlur: value }))} />
                </div>
                {theme.backgroundImageUrl && <button type="button" onClick={() => setTheme((current) => ({ ...current, backgroundImageUrl: null, backgroundImageStoragePath: null, backgroundMode: "gradient" }))} className="mt-3 text-xs font-semibold text-destructive">Remove image from page</button>}
              </div>
            )}
          </Panel>

          <Panel title="Colour system" description="Fine-tune the colours used over your selected background.">
            <div className="grid gap-3 sm:grid-cols-2">
              <ColourField label="Background 1" value={theme.backgroundPrimary} onChange={(value) => setColour("backgroundPrimary", value)} />
              <ColourField label="Background 2" value={theme.backgroundSecondary} onChange={(value) => setColour("backgroundSecondary", value)} />
              <ColourField label="Accent" value={theme.accent} onChange={(value) => setColour("accent", value)} />
              <ColourField label="Card / surface" value={theme.surface} onChange={(value) => setColour("surface", value)} />
              <ColourField label="Main text" value={theme.textPrimary} onChange={(value) => setColour("textPrimary", value)} />
              <ColourField label="Secondary text" value={theme.textMuted} onChange={(value) => setColour("textMuted", value)} />
            </div>
          </Panel>

          <Panel title="Page personality" description="Choose how the country header feels. The content stays accessible, but the presentation can be more yours.">
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["classic", "Classic", "Flag, title and national introduction"],
                ["editorial", "Editorial", "Bigger title and magazine-like spacing"],
                ["minimal", "Minimal", "Quiet header with less decoration"],
                ["flag-focus", "Flag focus", "Makes the national flag the visual anchor"],
              ] as const).map(([value, label, description]) => (
                <button key={value} type="button" onClick={() => setTheme((current) => ({ ...current, heroLayout: value }))} className={`min-h-20 rounded-xl border p-3 text-left ${theme.heroLayout === value ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
          </Panel>

          <div className="sticky bottom-20 z-20 flex flex-col gap-2 rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur sm:bottom-4 sm:flex-row">
            <button type="button" onClick={save} disabled={saveTheme.isPending || backgroundBusy} className="min-h-12 flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saveTheme.isPending ? "Saving…" : "Save appearance"}
            </button>
            <button type="button" onClick={() => setTheme({ ...DEFAULT_COUNTRY_THEME, accent: country.accent_color || DEFAULT_COUNTRY_THEME.accent })} className="min-h-12 rounded-xl border border-border bg-surface px-4 text-sm font-semibold">Reset</button>
          </div>
        </div>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <Panel title="Live preview" description="A compact preview of the same background and page personality used publicly.">
            <div className="relative min-h-[460px] overflow-hidden rounded-3xl border p-5" style={previewStyle}>
              {theme.backgroundMode === "image" && theme.backgroundBlur > 0 && <div className="pointer-events-none absolute -inset-8" style={{ backgroundImage: theme.backgroundImageUrl ? `url(${JSON.stringify(theme.backgroundImageUrl)})` : undefined, backgroundSize: "cover", backgroundPosition: `${theme.backgroundPositionX}% ${theme.backgroundPositionY}%`, filter: `blur(${theme.backgroundBlur}px)`, opacity: 0.35 }} />}
              <div className={`relative z-10 ${theme.heroLayout === "editorial" ? "pt-12" : theme.heroLayout === "minimal" ? "pt-20" : "pt-4"}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>Terra Solaris · {country.region}</p>
                <h2 className={`${theme.heroLayout === "editorial" ? "text-5xl" : "text-3xl"} mt-2 font-bold`} style={{ color: theme.textPrimary }}>{country.name}</h2>
                <p className="mt-3 max-w-sm text-sm leading-6" style={{ color: theme.textMuted }}>{country.description || "Your national story, SSC history and custom sections live here."}</p>
                <div className="mt-6 rounded-2xl border p-4" style={{ background: `${theme.surface}e8`, borderColor: `${theme.accent}44` }}>
                  <p className="text-xs font-semibold" style={{ color: theme.accent }}>Sample section</p>
                  <p className="mt-1 text-sm" style={{ color: theme.textPrimary }}>Cards and article sections stay readable over your custom background.</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border p-3" style={{ background: `${theme.surface}dd`, borderColor: `${theme.accent}33` }}><p className="text-[9px] uppercase" style={{ color: theme.textMuted }}>Capital</p><p className="mt-1 text-sm font-semibold">Your capital</p></div><div className="rounded-xl border p-3" style={{ background: `${theme.surface}dd`, borderColor: `${theme.accent}33` }}><p className="text-[9px] uppercase" style={{ color: theme.textMuted }}>SSC</p><p className="mt-1 text-sm font-semibold">History</p></div></div>
              </div>
            </div>
          </Panel>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground"><Layers3 className="mt-0.5 size-4 shrink-0" /><span>Content order, custom sections, images and country/Wiki visibility are controlled from the page builder in My Solaris.</span></div>
        </div>
      </div>
    </AppShell>
  );
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Palette; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}><Icon className="size-4" />{label}</button>;
}

function RangeField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-current" /></label>;
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-xl bg-surface p-3">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 rounded-lg border border-border bg-background p-1" />
        <input value={value} onChange={(event) => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && onChange(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs" />
      </div>
    </label>
  );
}
