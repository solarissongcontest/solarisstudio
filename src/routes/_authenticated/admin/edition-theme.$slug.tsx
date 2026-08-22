import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ImagePlus, Info, Palette, RotateCcw } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
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
  head: ({ params }) => ({ meta: [{ title: `${params.slug} artwork & colours — Solaris Organizer` }, { name: "robots", content: "noindex" }] }),
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
  const [savedTheme, setSavedTheme] = useState<VisualTheme>(DEFAULT_THEME);
  const [savedPalette, setSavedPalette] = useState<string[]>([]);
  const [savedArtworkUrl, setSavedArtworkUrl] = useState<string | null>(null);
  const [savedArtworkPath, setSavedArtworkPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!edition) return;
    const nextTheme = editionThemeToVisual(edition.theme_colors) ?? DEFAULT_THEME;
    const raw = edition.theme_colors as { palette?: unknown } | null;
    const nextPalette = Array.isArray(raw?.palette) ? raw!.palette!.filter((value): value is string => typeof value === "string") : [];
    const nextArtworkUrl = edition.artwork_url ?? null;
    const nextArtworkPath = edition.artwork_storage_path ?? null;

    setTheme(nextTheme);
    setPalette(nextPalette);
    setArtworkUrl(nextArtworkUrl);
    setArtworkPath(nextArtworkPath);
    setSavedTheme(nextTheme);
    setSavedPalette(nextPalette);
    setSavedArtworkUrl(nextArtworkUrl);
    setSavedArtworkPath(nextArtworkPath);
  }, [edition]);

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Palette} title="Edition not found" description="Choose another edition from the Organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  const dirty =
    JSON.stringify(theme) !== JSON.stringify(savedTheme) ||
    JSON.stringify(palette) !== JSON.stringify(savedPalette) ||
    artworkUrl !== savedArtworkUrl ||
    artworkPath !== savedArtworkPath;

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

  const rememberSaved = (nextTheme: VisualTheme, nextPalette: string[], nextArtworkUrl: string | null, nextArtworkPath: string | null) => {
    setSavedTheme(nextTheme);
    setSavedPalette([...nextPalette]);
    setSavedArtworkUrl(nextArtworkUrl);
    setSavedArtworkPath(nextArtworkPath);
  };

  const save = async (generatedFromArtwork = false) => {
    setBusy(true);
    setMessage(null);
    try {
      await saveEditionVisualTheme({ editionId: edition.id, artworkUrl, artworkStoragePath: artworkPath, theme, palette, generatedFromArtwork });
      await saveCompatibilityImage(artworkUrl);
      await synchroniseScoreboardThemes(theme);
      rememberSaved(theme, palette, artworkUrl, artworkPath);
      await invalidate();
      setMessage("Saved. The artwork image stays intact; these colours now shape edition surfaces and linked scoreboard themes.");
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
      rememberSaved(extracted.theme, extracted.palette, asset.publicUrl, asset.storagePath);
      await invalidate();
      setMessage("Artwork uploaded and saved. Solaris generated and synced a matching palette; fine-tuning colours below becomes an unsaved edit until you press Save.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setTheme(savedTheme);
    setPalette([...savedPalette]);
    setArtworkUrl(savedArtworkUrl);
    setArtworkPath(savedArtworkPath);
    setMessage("Unsaved colour changes discarded.");
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Design & broadcast"
        title="Artwork & colours"
        description={`${edition.edition_number ? `SSC ${edition.edition_number}` : edition.name} visual identity. The image and the interface palette are separate: the artwork remains untouched while its colours can shape Solaris around it.`}
        actions={<div className="flex flex-wrap items-center gap-2"><AdminStatus tone={dirty ? "attention" : "ready"}>{dirty ? "Unsaved changes" : "Saved"}</AdminStatus><Link to="/admin/design/$slug" params={{ slug }} className="admin-action-secondary"><ArrowLeft className="size-4" /> Design & broadcast</Link><Link to="/editions/$slug" params={{ slug }} target="_blank" className="admin-action-quiet"><ExternalLink className="size-4" /> Public preview</Link></div>}
      />

      <AdminCard className="mb-4 !border-sky-200/12 !bg-sky-200/[0.035]">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-sky-100" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">What this page changes</p>
            <div className="mt-2 grid gap-2 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
              <p><strong className="text-foreground">Artwork:</strong> the official image is stored and displayed uncropped.</p>
              <p><strong className="text-foreground">Colours:</strong> backgrounds, surfaces, accents and text inherit this visual atmosphere.</p>
              <p><strong className="text-foreground">Scoreboard theme:</strong> colour changes also appear on linked scoreboards. Votes, points and results are never changed here.</p>
            </div>
          </div>
        </div>
      </AdminCard>

      {message ? <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-sm leading-relaxed text-foreground">{message}</div> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[.86fr_1.14fr]">
        <div className="min-w-0 space-y-4">
          <AdminCard>
            <AdminCardHeader eyebrow="1 · Official artwork" title="Upload the complete image" description="JPEG, PNG or WebP. Uploading saves the image immediately and extracts a starting palette. Solaris never crops the public artwork card." />
            <label className="admin-action-primary cursor-pointer"><ImagePlus className="size-4" /> {busy ? "Processing…" : artworkUrl ? "Replace artwork" : "Upload artwork"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
            {artworkUrl ? (
              <div className="mt-4 grid max-h-[70dvh] place-items-center overflow-auto rounded-2xl border border-white/[0.07] bg-black/10 p-3"><img src={artworkUrl} alt={`${edition.name} artwork`} className="block h-auto max-h-[66dvh] w-auto max-w-full rounded-xl object-contain" /></div>
            ) : <div className="mt-4"><AdminEmptyState icon={ImagePlus} title="No artwork uploaded" description="Upload the official edition artwork when it is ready." /></div>}
            {palette.length ? <div className="mt-4"><p className="admin-section-label">Detected palette</p><p className="mt-1 text-xs text-muted-foreground">These swatches came from the artwork. The six controls below decide how Solaris actually uses them.</p><div className="mt-2 flex flex-wrap gap-2">{palette.map((color) => <span key={color} title={color} className="size-9 rounded-full border border-white/15" style={{ background: color }} />)}</div></div> : null}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="2 · Interface palette" title="Fine-tune where colours are used" description="Changing these fields is only a draft until Save. The preview updates after you finish choosing a colour, which keeps the mobile colour picker open instead of throwing you back to the page." />
            <div className="grid gap-3 sm:grid-cols-2">
              <ColourField label="Background" description="Main page background." value={theme.backgroundPrimary} onChange={(value) => set("backgroundPrimary", value)} />
              <ColourField label="Secondary" description="Gradient and supporting background." value={theme.backgroundSecondary} onChange={(value) => set("backgroundSecondary", value)} />
              <ColourField label="Accent" description="Highlights, progress and selected states." value={theme.accent} onChange={(value) => set("accent", value)} />
              <ColourField label="Surface" description="Cards and scoreboard panels." value={theme.surface} onChange={(value) => set("surface", value)} />
              <ColourField label="Main text" description="Primary readable text." value={theme.textPrimary} onChange={(value) => set("textPrimary", value)} />
              <ColourField label="Muted text" description="Secondary labels and supporting details." value={theme.textMuted} onChange={(value) => set("textMuted", value)} />
            </div>
            <div className="admin-sticky-actions mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={busy || !dirty} onClick={discard} className="admin-action-secondary flex-1"><RotateCcw className="size-4" /> Discard changes</button>
              <button type="button" disabled={busy || !dirty} onClick={() => void save(false)} className="admin-action-primary flex-[1.5]">{busy ? "Saving…" : dirty ? "Save edition colours" : "Saved"}</button>
            </div>
          </AdminCard>
        </div>

        <AdminCard className="h-fit xl:sticky xl:top-24">
          <AdminCardHeader eyebrow="3 · Preview" title="See the atmosphere before saving" description="This is a visual sample only. It contains no real or invented contest scores and cannot alter result data." />
          <div className="overflow-hidden rounded-3xl border p-4 sm:p-5" style={{ background: `radial-gradient(circle at 80% 12%, ${theme.accent}38, transparent 34%), linear-gradient(150deg, ${theme.backgroundPrimary}, ${theme.backgroundSecondary})`, color: theme.textPrimary, borderColor: `${theme.accent}55` }}>
            {artworkUrl ? <div className="grid place-items-center rounded-2xl border p-3" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}><img src={artworkUrl} alt="" className="block h-auto max-h-[42dvh] w-auto max-w-full rounded-xl object-contain" /></div> : null}
            <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: theme.accent }}>Solaris Song Contest</p><h2 className="mt-2 text-3xl font-bold">{edition.edition_number ? `SSC ${edition.edition_number}` : edition.name}</h2><p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: theme.textMuted }}>Artwork stays intact while the palette controls the surrounding interface.</p>
              <div className="mt-5 rounded-2xl border p-4" style={{ background: theme.surface, borderColor: `${theme.accent}44` }}>
                <p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: theme.accent }}>Interface sample</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between rounded-xl px-3 py-3 text-sm" style={{ background: `${theme.accent}22` }}><span className="font-semibold">Highlighted row</span><span className="text-xs font-bold" style={{ color: theme.accent }}>Accent</span></div>
                  <div className="flex items-center justify-between rounded-xl px-3 py-3 text-sm" style={{ background: `${theme.backgroundPrimary}aa` }}><span className="font-semibold">Standard row</span><span className="text-xs" style={{ color: theme.textMuted }}>Muted text</span></div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: theme.backgroundSecondary }}><div className="h-full w-2/3 rounded-full" style={{ background: theme.accent }} /></div>
                </div>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function ColourField({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (value: string) => void }) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState(value);

  useEffect(() => {
    setHex(value);
    const picker = pickerRef.current;
    if (picker && document.activeElement !== picker) picker.value = value;
  }, [value]);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    const commit = () => {
      const next = picker.value.toLowerCase();
      setHex(next);
      onChange(next);
    };
    picker.addEventListener("change", commit);
    return () => picker.removeEventListener("change", commit);
  }, [onChange]);

  const commitHex = () => {
    const next = hex.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(next)) {
      if (pickerRef.current) pickerRef.current.value = next;
      onChange(next);
    } else {
      setHex(value);
    }
  };

  return (
    <div className="block rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <span className="admin-section-label">{label}</span>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-2 flex items-center gap-3">
        <input
          ref={pickerRef}
          type="color"
          defaultValue={value}
          aria-label={`${label} colour`}
          className="h-12 w-16 shrink-0 cursor-pointer rounded-lg border border-white/[0.1] bg-transparent p-1 touch-manipulation"
        />
        <input
          type="text"
          inputMode="text"
          autoCapitalize="none"
          spellCheck={false}
          value={hex}
          aria-label={`${label} hex colour`}
          onChange={(event) => setHex(event.target.value)}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex();
              event.currentTarget.blur();
            }
          }}
          className="numeric min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/10 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/45"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  );
}
