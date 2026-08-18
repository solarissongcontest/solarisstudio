import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useEditions, useThemes } from "@/lib/data";
import {
  DEFAULT_THEME,
  editionThemeToVisual,
  extractThemeFromImage,
  saveEditionVisualTheme,
  uploadEditionArtwork,
  type VisualTheme,
} from "@/lib/visual-theme";

const supabase = typedSupabase as any;

type EditionVisual = {
  id: string;
  slug: string;
  name: string;
  edition_number: number | null;
  artwork_url?: string | null;
  artwork_storage_path?: string | null;
  theme_colors?: unknown;
  theme_id?: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/edition-theme/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} artwork theme — Solaris Studio` }] }),
  component: EditionThemePage,
});

function EditionThemePage() {
  const { slug } = Route.useParams();
  const { data: editions } = useEditions();
  const { data: themes } = useThemes();
  const qc = useQueryClient();
  const edition = useMemo(
    () => (editions ?? []).find((item) => item.slug === slug) as EditionVisual | undefined,
    [editions, slug],
  );
  const [theme, setTheme] = useState<VisualTheme>(DEFAULT_THEME);
  const [palette, setPalette] = useState<string[]>([]);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [artworkPath, setArtworkPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!edition) return;
    setTheme(editionThemeToVisual(edition.theme_colors) ?? DEFAULT_THEME);
    setArtworkUrl(edition.artwork_url ?? null);
    setArtworkPath(edition.artwork_storage_path ?? null);
    const raw = edition.theme_colors as { palette?: unknown } | null;
    setPalette(Array.isArray(raw?.palette) ? raw!.palette!.filter((v): v is string => typeof v === "string") : []);
  }, [edition]);

  if (!edition) {
    return <AppShell><PageHeader eyebrow="Edition artwork" title="Edition not found" /></AppShell>;
  }

  const set = (key: keyof VisualTheme, value: string) =>
    setTheme((current) => ({ ...current, [key]: value }));

  const synchroniseScoreboardTheme = async (nextTheme: VisualTheme) => {
    if (!edition.theme_id) return;
    const selected = (themes ?? []).find((item) => item.id === edition.theme_id);
    if (!selected) return;
    const config = { ...(selected.config as Record<string, any>) };
    config.background = {
      ...(config.background ?? {}),
      type: "gradient",
      color: nextTheme.backgroundPrimary,
      gradientFrom: nextTheme.backgroundPrimary,
      gradientTo: nextTheme.backgroundSecondary,
    };
    config.colors = {
      ...(config.colors ?? {}),
      primary: nextTheme.backgroundPrimary,
      secondary: nextTheme.backgroundSecondary,
      accent: nextTheme.accent,
      text: nextTheme.textPrimary,
      jury: nextTheme.accent,
      televote: nextTheme.backgroundSecondary,
    };
    config.chrome = {
      ...(config.chrome ?? {}),
      headerBackground: nextTheme.backgroundPrimary,
      headerText: nextTheme.textPrimary,
      panelBackground: nextTheme.surface,
      panelText: nextTheme.textPrimary,
      progressFill: nextTheme.accent,
      spokespersonAccent: nextTheme.accent,
    };
    const { error } = await supabase.from("themes").update({ config }).eq("id", edition.theme_id);
    if (error) throw error;
  };

  const save = async (generatedFromArtwork = false) => {
    setBusy(true);
    setMessage(null);
    try {
      await saveEditionVisualTheme({
        editionId: edition.id,
        artworkUrl,
        artworkStoragePath: artworkPath,
        theme,
        palette,
        generatedFromArtwork,
      });
      await synchroniseScoreboardTheme(theme);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
      ]);
      setMessage("Edition theme saved. Edition pages, shows and the edition scoreboard now share these colours.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Edition theme could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setMessage("Analysing artwork colours…");
    try {
      const extracted = await extractThemeFromImage(file);
      const asset = await uploadEditionArtwork(edition.id, file);
      setTheme(extracted.theme);
      setPalette(extracted.palette);
      setArtworkUrl(asset.publicUrl);
      setArtworkPath(asset.storagePath);

      await saveEditionVisualTheme({
        editionId: edition.id,
        artworkUrl: asset.publicUrl,
        artworkStoragePath: asset.storagePath,
        theme: extracted.theme,
        palette: extracted.palette,
        generatedFromArtwork: true,
      });
      await synchroniseScoreboardTheme(extracted.theme);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
      ]);
      setMessage("Artwork uploaded and a coordinated edition palette was generated automatically. You can fine-tune it below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Edition design · Artwork intelligence"
        title={edition.edition_number ? `SSC ${edition.edition_number} visual identity` : edition.name}
        description="Upload the edition artwork and Solaris extracts a restrained palette for the edition page, every show and the scoreboard. Manual changes remain possible after generation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/design/$slug" params={{ slug }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Advanced design</Link>
            <Link to="/editions/$slug" params={{ slug }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Public edition →</Link>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="space-y-5">
          <Panel title="Edition artwork" description="JPEG, PNG or WebP. The image is stored with the edition and shown on its public page.">
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} className="block w-full text-sm" />
            {artworkUrl ? (
              <img src={artworkUrl} alt={`${edition.name} artwork`} className="mt-4 aspect-[4/3] w-full rounded-2xl border border-border object-cover" />
            ) : (
              <div className="mt-4 grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-border bg-surface text-sm text-muted-foreground">No edition artwork uploaded yet</div>
            )}
            {palette.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Detected palette</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {palette.map((color) => <span key={color} title={color} className="size-9 rounded-full border border-white/15" style={{ background: color }} />)}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Fine-tune colours" description="The detector chooses safe defaults, but the organizer always has final control.">
            <div className="grid gap-3 sm:grid-cols-2">
              <ColourField label="Background" value={theme.backgroundPrimary} onChange={(value) => set("backgroundPrimary", value)} />
              <ColourField label="Secondary" value={theme.backgroundSecondary} onChange={(value) => set("backgroundSecondary", value)} />
              <ColourField label="Accent" value={theme.accent} onChange={(value) => set("accent", value)} />
              <ColourField label="Surface" value={theme.surface} onChange={(value) => set("surface", value)} />
              <ColourField label="Main text" value={theme.textPrimary} onChange={(value) => set("textPrimary", value)} />
              <ColourField label="Muted text" value={theme.textMuted} onChange={(value) => set("textMuted", value)} />
            </div>
            <button type="button" disabled={busy} onClick={() => void save(false)} className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Save edition colours"}</button>
            {message && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>}
          </Panel>
        </div>

        <Panel title="Live edition preview" description="The same theme is inherited by edition pages, show pages and scoreboard chrome.">
          <div className="relative min-h-[34rem] overflow-hidden rounded-3xl border p-6" style={{ background: `radial-gradient(circle at 80% 12%, ${theme.accent}38, transparent 34%), linear-gradient(150deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`, color: theme.textPrimary, borderColor: `${theme.accent}55` }}>
            {artworkUrl && <img src={artworkUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-[.18] mix-blend-screen" />}
            <div className="relative z-10">
              <p className="text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: theme.accent }}>Solaris Song Contest</p>
              <h2 className="mt-3 text-5xl font-bold">{edition.edition_number ? `SSC ${edition.edition_number}` : edition.name}</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: theme.textMuted }}>Edition artwork defines the atmosphere without sacrificing readable results, analysis and voting views.</p>
              <div className="mt-8 rounded-2xl border p-5" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}>
                <p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: theme.accent }}>Scoreboard sample</p>
                <div className="mt-4 space-y-2">
                  {["01  DIARIA", "02  FENNEK", "03  OLAND"].map((label, index) => (
                    <div key={label} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: index === 0 ? `${theme.accent}22` : `${theme.backgroundPrimary}aa` }}>
                      <span className="font-semibold">{label}</span><span className="font-bold" style={{ color: theme.accent }}>{[611, 444, 401][index]} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block rounded-xl bg-surface p-3"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">{label}</span><div className="flex items-center gap-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 rounded-lg border border-border bg-background p-1" /><span className="font-mono text-xs text-muted-foreground">{value}</span></div></label>;
}
