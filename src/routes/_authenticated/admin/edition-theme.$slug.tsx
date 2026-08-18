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
    setPalette(
      Array.isArray(raw?.palette)
        ? raw!.palette!.filter((value): value is string => typeof value === "string")
        : [],
    );
  }, [edition]);

  if (!edition) {
    return <AppShell><PageHeader eyebrow="Edition artwork" title="Edition not found" /></AppShell>;
  }

  const set = (key: keyof VisualTheme, value: string) =>
    setTheme((current) => ({ ...current, [key]: value }));

  const buildSyncedConfig = (configInput: unknown, nextTheme: VisualTheme) => {
    const config = { ...((configInput && typeof configInput === "object" ? configInput : {}) as Record<string, any>) };
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
      progressTrack: nextTheme.backgroundSecondary,
      progressFill: nextTheme.accent,
      spokespersonBackground: nextTheme.surface,
      spokespersonText: nextTheme.textPrimary,
      spokespersonAccent: nextTheme.accent,
    };
    config.states = {
      ...(config.states ?? {}),
      leaderBackground: nextTheme.surface,
      leaderBorder: nextTheme.accent,
      leaderText: nextTheme.textPrimary,
      highlight: nextTheme.accent,
      votingBackground: nextTheme.backgroundSecondary,
      votingText: nextTheme.textPrimary,
      selected: nextTheme.accent,
      hover: nextTheme.surface,
      qualified: nextTheme.accent,
    };
    return config;
  };

  const synchroniseScoreboardThemes = async (nextTheme: VisualTheme) => {
    const { data: showRows, error: showError } = await supabase
      .from("shows")
      .select("theme_id")
      .eq("edition_id", edition.id);
    if (showError) throw showError;

    const themeIds = new Set<string>();
    if (edition.theme_id) themeIds.add(edition.theme_id);
    for (const show of showRows ?? []) {
      if (typeof show.theme_id === "string" && show.theme_id) themeIds.add(show.theme_id);
    }

    for (const themeId of themeIds) {
      const selected = (themes ?? []).find((item) => item.id === themeId);
      let sourceConfig: unknown = selected?.config;
      if (!sourceConfig) {
        const { data: row, error } = await supabase.from("themes").select("config").eq("id", themeId).maybeSingle();
        if (error) throw error;
        sourceConfig = row?.config;
      }
      const config = buildSyncedConfig(sourceConfig, nextTheme);
      const { error } = await supabase.from("themes").update({ config }).eq("id", themeId);
      if (error) throw error;
    }
  };

  const saveCompatibilityImage = async (url: string | null) => {
    const { error } = await supabase.from("editions").update({ logo: url }).eq("id", edition.id);
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
      await saveCompatibilityImage(artworkUrl);
      await synchroniseScoreboardThemes(theme);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["all-shows"] }),
      ]);
      setMessage("Edition theme saved. The public artwork stays uncropped, while edition pages, shows and linked scoreboards share these colours.");
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
      await saveCompatibilityImage(asset.publicUrl);
      await synchroniseScoreboardThemes(extracted.theme);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["all-shows"] }),
      ]);
      setMessage("Artwork uploaded. It is shown uncropped on the public edition page, and Solaris generated a matching edition palette. You can fine-tune it below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Design & Broadcast · Official artwork"
        title={edition.edition_number ? `SSC ${edition.edition_number} visual identity` : edition.name}
        description="Upload the official edition artwork without cropping it. Solaris can extract a restrained palette for the edition, shows and linked scoreboards."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/design/$slug" params={{ slug }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">← Design & Broadcast</Link>
            <Link to="/editions/$slug" params={{ slug }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Public edition →</Link>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="space-y-5">
          <Panel title="Official edition artwork" description="JPEG, PNG or WebP. Solaris preserves the full composition and never uses object-cover for the public artwork card.">
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} className="block w-full text-sm" />
            {artworkUrl ? (
              <div className="mt-4 grid max-h-[72vh] place-items-center overflow-auto rounded-2xl border border-border bg-black/10 p-3">
                <img src={artworkUrl} alt={`${edition.name} artwork`} className="block h-auto max-h-[68vh] w-auto max-w-full rounded-xl object-contain" />
              </div>
            ) : (
              <div className="mt-4 grid min-h-52 place-items-center rounded-2xl border border-dashed border-border bg-surface text-sm text-muted-foreground">No edition artwork uploaded yet</div>
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

        <Panel title="Live edition preview" description="Artwork remains a complete image; the generated colours provide the surrounding atmosphere.">
          <div className="overflow-hidden rounded-3xl border p-5" style={{ background: `radial-gradient(circle at 80% 12%, ${theme.accent}38, transparent 34%), linear-gradient(150deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`, color: theme.textPrimary, borderColor: `${theme.accent}55` }}>
            {artworkUrl ? (
              <div className="grid place-items-center rounded-2xl border p-3" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}>
                <img src={artworkUrl} alt="" className="block h-auto max-h-[48vh] w-auto max-w-full rounded-xl object-contain" />
              </div>
            ) : null}
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: theme.accent }}>Solaris Song Contest</p>
              <h2 className="mt-2 text-4xl font-bold">{edition.edition_number ? `SSC ${edition.edition_number}` : edition.name}</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: theme.textMuted }}>The artwork is displayed separately and intact; the palette carries its visual identity through the surrounding interface.</p>
              <div className="mt-5 rounded-2xl border p-5" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}>
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
