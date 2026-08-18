import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ImagePlus, Palette } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
} from "@/components/admin/AdminUI";
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
  head: ({ params }) => ({ meta: [{ title: `${params.slug} artwork colours — Solaris Organizer` }, { name: "robots", content: "noindex" }] }),
  component: EditionThemePage,
});

function EditionThemePage() {
  const { slug } = Route.useParams();
  const { data: editions = [] } = useEditions();
  const { data: themes = [] } = useThemes();
  const qc = useQueryClient();
  const edition = useMemo(() => editions.find((item) => item.slug === slug) as EditionVisual | undefined, [editions, slug]);
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
    setPalette(Array.isArray(raw?.palette) ? raw!.palette!.filter((value): value is string => typeof value === "string") : []);
  }, [edition]);

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Palette} title="Edition not found" description="Choose another edition from the Organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  const set = (key: keyof VisualTheme, value: string) => setTheme((current) => ({ ...current, [key]: value }));

  const buildSyncedConfig = (configInput: unknown, nextTheme: VisualTheme) => {
    const config = { ...((configInput && typeof configInput === "object" ? configInput : {}) as Record<string, any>) };
    config.background = { ...(config.background ?? {}), type: "gradient", color: nextTheme.backgroundPrimary, gradientFrom: nextTheme.backgroundPrimary, gradientTo: nextTheme.backgroundSecondary };
    config.colors = { ...(config.colors ?? {}), primary: nextTheme.backgroundPrimary, secondary: nextTheme.backgroundSecondary, accent: nextTheme.accent, text: nextTheme.textPrimary, jury: nextTheme.accent, televote: nextTheme.backgroundSecondary };
    config.chrome = { ...(config.chrome ?? {}), headerBackground: nextTheme.backgroundPrimary, headerText: nextTheme.textPrimary, panelBackground: nextTheme.surface, panelText: nextTheme.textPrimary, progressTrack: nextTheme.backgroundSecondary, progressFill: nextTheme.accent, spokespersonBackground: nextTheme.surface, spokespersonText: nextTheme.textPrimary, spokespersonAccent: nextTheme.accent };
    config.states = { ...(config.states ?? {}), leaderBackground: nextTheme.surface, leaderBorder: nextTheme.accent, leaderText: nextTheme.textPrimary, highlight: nextTheme.accent, votingBackground: nextTheme.backgroundSecondary, votingText: nextTheme.textPrimary, selected: nextTheme.accent, hover: nextTheme.surface, qualified: nextTheme.accent };
    return config;
  };

  const synchroniseScoreboardThemes = async (nextTheme: VisualTheme) => {
    const { data: showRows, error: showError } = await supabase.from("shows").select("theme_id").eq("edition_id", edition.id);
    if (showError) throw showError;

    const themeIds = new Set<string>();
    if (edition.theme_id) themeIds.add(edition.theme_id);
    for (const show of showRows ?? []) if (typeof show.theme_id === "string" && show.theme_id) themeIds.add(show.theme_id);

    for (const themeId of themeIds) {
      const selected = themes.find((item) => item.id === themeId);
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

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["editions"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
      qc.invalidateQueries({ queryKey: ["themes"] }),
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["all-shows"] }),
    ]);
  };

  const save = async (generatedFromArtwork = false) => {
    setBusy(true);
    setMessage(null);
    try {
      await saveEditionVisualTheme({ editionId: edition.id, artworkUrl, artworkStoragePath: artworkPath, theme, palette, generatedFromArtwork });
      await saveCompatibilityImage(artworkUrl);
      await synchroniseScoreboardThemes(theme);
      await invalidate();
      setMessage("Edition colours saved. The public artwork stays uncropped, while edition pages, shows and linked scoreboards share these colours.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Edition colours could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setMessage("Reading artwork colours…");
    try {
      const extracted = await extractThemeFromImage(file);
      const asset = await uploadEditionArtwork(edition.id, file);
      setTheme(extracted.theme);
      setPalette(extracted.palette);
      setArtworkUrl(asset.publicUrl);
      setArtworkPath(asset.storagePath);
      await saveEditionVisualTheme({ editionId: edition.id, artworkUrl: asset.publicUrl, artworkStoragePath: asset.storagePath, theme: extracted.theme, palette: extracted.palette, generatedFromArtwork: true });
      await saveCompatibilityImage(asset.publicUrl);
      await synchroniseScoreboardThemes(extracted.theme);
      await invalidate();
      setMessage("Artwork uploaded. Solaris generated a matching palette that you can fine-tune below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Design & broadcast"
        title="Artwork colours"
        description={`${edition.edition_number ? `SSC ${edition.edition_number}` : edition.name} visual identity. Artwork remains a complete image; these colours carry its atmosphere through the surrounding interface.`}
        actions={<div className="flex flex-wrap gap-2"><Link to="/admin/design/$slug" params={{ slug }} className="admin-action-secondary"><ArrowLeft className="size-4" /> Design & broadcast</Link><Link to="/editions/$slug" params={{ slug }} target="_blank" className="admin-action-quiet"><ExternalLink className="size-4" /> Public preview</Link></div>}
      />

      {message ? <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-sm leading-relaxed text-foreground">{message}</div> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[.9fr_1.1fr]">
        <div className="min-w-0 space-y-4">
          <AdminCard>
            <AdminCardHeader eyebrow="Official artwork" title="Full image" description="JPEG, PNG or WebP. Solaris preserves the full composition and never crops the public artwork card." />
            <label className="admin-action-primary cursor-pointer"><ImagePlus className="size-4" /> {busy ? "Processing…" : artworkUrl ? "Replace artwork" : "Upload artwork"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
            {artworkUrl ? (
              <div className="mt-4 grid max-h-[70dvh] place-items-center overflow-auto rounded-2xl border border-white/[0.07] bg-black/10 p-3"><img src={artworkUrl} alt={`${edition.name} artwork`} className="block h-auto max-h-[66dvh] w-auto max-w-full rounded-xl object-contain" /></div>
            ) : <div className="mt-4"><AdminEmptyState icon={ImagePlus} title="No artwork uploaded" description="Upload the official edition artwork when it is ready." /></div>}
            {palette.length ? <div className="mt-4"><p className="admin-section-label">Detected palette</p><div className="mt-2 flex flex-wrap gap-2">{palette.map((color) => <span key={color} title={color} className="size-9 rounded-full border border-white/15" style={{ background: color }} />)}</div></div> : null}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Palette" title="Fine-tune colours" description="The detector provides a starting point. The organizer keeps final control." />
            <div className="grid gap-3 sm:grid-cols-2">
              <ColourField label="Background" value={theme.backgroundPrimary} onChange={(value) => set("backgroundPrimary", value)} />
              <ColourField label="Secondary" value={theme.backgroundSecondary} onChange={(value) => set("backgroundSecondary", value)} />
              <ColourField label="Accent" value={theme.accent} onChange={(value) => set("accent", value)} />
              <ColourField label="Surface" value={theme.surface} onChange={(value) => set("surface", value)} />
              <ColourField label="Main text" value={theme.textPrimary} onChange={(value) => set("textPrimary", value)} />
              <ColourField label="Muted text" value={theme.textMuted} onChange={(value) => set("textMuted", value)} />
            </div>
            <div className="admin-sticky-actions mt-4"><button type="button" disabled={busy} onClick={() => void save(false)} className="admin-action-primary w-full">{busy ? "Saving…" : "Save edition colours"}</button></div>
          </AdminCard>
        </div>

        <AdminCard className="h-fit xl:sticky xl:top-24">
          <AdminCardHeader eyebrow="Preview" title="Edition atmosphere" description="Illustrative preview only. It does not write scores or result data." />
          <div className="overflow-hidden rounded-3xl border p-4 sm:p-5" style={{ background: `radial-gradient(circle at 80% 12%, ${theme.accent}38, transparent 34%), linear-gradient(150deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`, color: theme.textPrimary, borderColor: `${theme.accent}55` }}>
            {artworkUrl ? <div className="grid place-items-center rounded-2xl border p-3" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}><img src={artworkUrl} alt="" className="block h-auto max-h-[42dvh] w-auto max-w-full rounded-xl object-contain" /></div> : null}
            <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: theme.accent }}>Solaris Song Contest</p><h2 className="mt-2 text-3xl font-bold">{edition.edition_number ? `SSC ${edition.edition_number}` : edition.name}</h2><p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: theme.textMuted }}>Artwork stays intact while the extracted palette shapes the surrounding interface.</p><div className="mt-5 rounded-2xl border p-4" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}><p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: theme.accent }}>Scoreboard sample</p><div className="mt-3 space-y-2">{["01  DIARIA", "02  FENNEK", "03  OLAND"].map((label, index) => <div key={label} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm" style={{ background: index === 0 ? `${theme.accent}22` : `${theme.backgroundPrimary}aa` }}><span className="font-semibold">{label}</span><span className="font-bold" style={{ color: theme.accent }}>{[611, 444, 401][index]} pts</span></div>)}</div></div></div>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span className="admin-section-label">{label}</span><div className="mt-2 flex items-center gap-3"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-14 rounded-lg border border-white/[0.1] bg-transparent p-1" /><span className="numeric text-xs text-muted-foreground">{value}</span></div></label>;
}
