import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries } from "@/lib/data";
import {
  DEFAULT_THEME,
  countryThemeToVisual,
  useCountryTheme,
  useSaveCountryTheme,
  type VisualTheme,
} from "@/lib/visual-theme";

export const Route = createFileRoute("/_authenticated/country-hub/theme")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Country theme — Solaris Studio" }] }),
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
  const [theme, setTheme] = useState<VisualTheme>(DEFAULT_THEME);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const existing = countryThemeToVisual(savedTheme);
    if (existing) setTheme(existing);
    else if (country?.accent_color) {
      setTheme((current) => ({ ...current, accent: country.accent_color }));
    }
  }, [savedTheme, country?.accent_color]);

  const previewStyle = useMemo(
    () => ({
      background: `radial-gradient(circle at 85% 10%, ${theme.backgroundSecondary}aa, transparent 42%), linear-gradient(145deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`,
      color: theme.textPrimary,
      borderColor: `${theme.accent}55`,
    }),
    [theme],
  );

  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Loading country theme…</p></AppShell>;
  }

  if (!country) {
    return (
      <AppShell>
        <PageHeader eyebrow="Country theme" title="No country account" description="Claim a country before creating its visual theme." />
        <Link to="/country-hub" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm">Open country hub</Link>
      </AppShell>
    );
  }

  const set = (key: keyof VisualTheme, value: string) =>
    setTheme((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setMessage(null);
    try {
      await saveTheme.mutateAsync(theme);
      setMessage("Theme saved. The country page and Wiki now use these same colours.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Theme could not be saved.");
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Country account · Visual identity"
        title={`${country.name} theme`}
        description="These colours stay synced across the public country profile and Terra Solaris Wiki. You control the identity; Solaris keeps the layout and readability rules consistent."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/country-hub" search={targetCountryId ? { country: targetCountryId } : {}} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Country hub</Link>
            <Link to="/countries/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Preview profile →</Link>
            <Link to="/wiki/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Preview Wiki →</Link>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="Theme colours" description="Choose the page background, cards, accent and font colours.">
          <div className="grid gap-3 sm:grid-cols-2">
            <ColourField label="Background" value={theme.backgroundPrimary} onChange={(value) => set("backgroundPrimary", value)} />
            <ColourField label="Secondary background" value={theme.backgroundSecondary} onChange={(value) => set("backgroundSecondary", value)} />
            <ColourField label="Accent" value={theme.accent} onChange={(value) => set("accent", value)} />
            <ColourField label="Card / surface" value={theme.surface} onChange={(value) => set("surface", value)} />
            <ColourField label="Main text" value={theme.textPrimary} onChange={(value) => set("textPrimary", value)} />
            <ColourField label="Secondary text" value={theme.textMuted} onChange={(value) => set("textMuted", value)} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saveTheme.isPending} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saveTheme.isPending ? "Saving…" : "Save country theme"}
            </button>
            <button type="button" onClick={() => setTheme({ ...DEFAULT_THEME, accent: country.accent_color || DEFAULT_THEME.accent })} className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold">
              Reset to Solaris default
            </button>
          </div>
          {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
        </Panel>

        <Panel title="Live preview" description="This previews the relationship between the colours, not a separate theme that can drift out of sync.">
          <div className="overflow-hidden rounded-3xl border p-5" style={previewStyle}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>Terra Solaris · {country.region}</p>
            <h2 className="mt-2 text-3xl font-bold" style={{ color: theme.textPrimary }}>{country.name}</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.textMuted }}>{country.description || "Country profile and Wiki content will use this shared visual identity."}</p>
            <div className="mt-5 rounded-2xl border p-4" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}>
              <p className="text-xs font-semibold" style={{ color: theme.accent }}>Sample card</p>
              <p className="mt-1 text-sm" style={{ color: theme.textPrimary }}>Entries, statistics, relationships and Wiki sections remain readable against the selected surface.</p>
            </div>
            <button type="button" className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: theme.accent, color: theme.backgroundPrimary }}>Accent action</button>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
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
