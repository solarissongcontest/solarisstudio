import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Palette, RotateCcw, Save } from "lucide-react";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions, useThemes } from "@/lib/data";
import {
  DEFAULT_THEME,
  editionThemeToVisual,
  extractThemeFromImage,
  saveEditionVisualTheme,
  uploadEditionArtwork,
  type VisualTheme,
} from "@/lib/visual-theme";

const supabase = typedSupabase as any;

type EditionArtworkRow = {
  id: string;
  slug: string;
  name: string;
  edition_number: number | null;
  logo?: string | null;
  artwork_url?: string | null;
  artwork_storage_path?: string | null;
  theme_colors?: unknown;
};

export function EditionArtworkControl({ slug }: { slug: string }) {
  const { data: editions } = useEditions();
  const { data: themes = [] } = useThemes();
  const qc = useQueryClient();
  const edition = useMemo(() => (editions ?? []).find((item) => item.slug === slug) as EditionArtworkRow | undefined, [editions, slug]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<VisualTheme>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<VisualTheme>(DEFAULT_THEME);
  const [palette, setPalette] = useState<string[]>([]);

  useEffect(() => {
    if (!edition) return;
    const nextTheme = editionThemeToVisual(edition.theme_colors) ?? DEFAULT_THEME;
    const raw = edition.theme_colors as { palette?: unknown } | null;
    const nextPalette = Array.isArray(raw?.palette)
      ? raw.palette.filter((value): value is string => typeof value === "string")
      : [];
    setThemeDraft(nextTheme);
    setSavedTheme(nextTheme);
    setPalette(nextPalette);
  }, [edition]);

  if (!edition) return null;
  const artworkUrl = edition.artwork_url ?? null;
  const paletteDirty = JSON.stringify(themeDraft) !== JSON.stringify(savedTheme);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage("Uploading artwork and reading its colours…");
    try {
      const extracted = await extractThemeFromImage(file);
      const asset = await uploadEditionArtwork(edition.id, file);
      await saveEditionVisualTheme({
        editionId: edition.id,
        artworkUrl: asset.publicUrl,
        artworkStoragePath: asset.storagePath,
        theme: extracted.theme,
        palette: extracted.palette,
        generatedFromArtwork: true,
      });
      await synchroniseScoreboardThemes(extracted.theme);
      setThemeDraft(extracted.theme);
      setSavedTheme(extracted.theme);
      setPalette(extracted.palette);

      const { error: compatibilityError } = await supabase.from("editions").update({ logo: asset.publicUrl }).eq("id", edition.id);
      if (compatibilityError) throw compatibilityError;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["all-shows"] }),
      ]);
      setMessage("Official artwork saved. It will appear uncropped on the public edition page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be uploaded.");
    } finally {
      setBusy(false);
    }
  };

  const buildSyncedConfig = (configInput: unknown, nextTheme: VisualTheme) => {
    const config = { ...((configInput && typeof configInput === "object" ? configInput : {}) as Record<string, any>) };
    config.background = { ...(config.background ?? {}), type: "gradient", color: nextTheme.backgroundPrimary, gradientFrom: nextTheme.backgroundPrimary, gradientTo: nextTheme.backgroundSecondary };
    config.colors = { ...(config.colors ?? {}), primary: nextTheme.backgroundPrimary, secondary: nextTheme.backgroundSecondary, accent: nextTheme.accent, text: nextTheme.textPrimary, jury: nextTheme.accent, televote: nextTheme.backgroundSecondary };
    config.chrome = { ...(config.chrome ?? {}), headerBackground: nextTheme.backgroundPrimary, headerText: nextTheme.textPrimary, panelBackground: nextTheme.surface, panelText: nextTheme.textPrimary, progressTrack: nextTheme.backgroundSecondary, progressFill: nextTheme.accent, spokespersonBackground: nextTheme.surface, spokespersonText: nextTheme.textPrimary, spokespersonAccent: nextTheme.accent };
    config.states = { ...(config.states ?? {}), leaderBackground: nextTheme.surface, leaderBorder: nextTheme.accent, leaderText: nextTheme.textPrimary, highlight: nextTheme.accent, votingBackground: nextTheme.backgroundSecondary, votingText: nextTheme.textPrimary, selected: nextTheme.accent, hover: nextTheme.surface, qualified: nextTheme.accent };
    return config;
  };

  async function synchroniseScoreboardThemes(nextTheme: VisualTheme) {
    const { data: showRows, error: showError } = await supabase
      .from("shows")
      .select("theme_id")
      .eq("edition_id", edition.id);
    if (showError) throw showError;

    const themeIds = new Set<string>();
    const editionWithTheme = edition as EditionArtworkRow & { theme_id?: string | null };
    if (editionWithTheme.theme_id) themeIds.add(editionWithTheme.theme_id);
    for (const show of showRows ?? []) {
      if (typeof show.theme_id === "string" && show.theme_id) themeIds.add(show.theme_id);
    }

    for (const themeId of themeIds) {
      const cached = themes.find((item) => item.id === themeId);
      let sourceConfig: unknown = cached?.config;
      if (!sourceConfig) {
        const { data, error } = await supabase.from("themes").select("config").eq("id", themeId).maybeSingle();
        if (error) throw error;
        sourceConfig = data?.config;
      }
      const { error } = await supabase
        .from("themes")
        .update({ config: buildSyncedConfig(sourceConfig, nextTheme) })
        .eq("id", themeId);
      if (error) throw error;
    }
  }

  async function savePalette() {
    if (!paletteDirty || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveEditionVisualTheme({
        editionId: edition.id,
        artworkUrl: edition.artwork_url ?? null,
        artworkStoragePath: edition.artwork_storage_path ?? null,
        theme: themeDraft,
        palette,
        generatedFromArtwork: false,
      });
      await synchroniseScoreboardThemes(themeDraft);
      setSavedTheme(themeDraft);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["all-shows"] }),
      ]);
      setMessage("Edition colours saved and synced to linked scoreboard themes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Edition colours could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function setColour(key: keyof VisualTheme, value: string) {
    setThemeDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="admin-card overflow-hidden">
      <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.7fr)]">
        <div className="min-w-0">
          <p className="admin-section-label">Official artwork</p>
          <h2 className="mt-1 text-base font-bold text-foreground sm:text-lg">Edition artwork</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">Upload the official {editionLabel(edition as any)} artwork. Solaris preserves the full image without cropping it and can use its colours as the starting point for the edition visual identity.</p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="admin-action-primary cursor-pointer">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {busy ? "Processing artwork…" : artworkUrl ? "Replace artwork" : "Upload artwork"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
            </label>
            <span className="admin-action-secondary pointer-events-none"><Palette className="size-4" /> Colours live here now</span>
          </div>

          {message ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{message}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">{[themeDraft.backgroundPrimary, themeDraft.backgroundSecondary, themeDraft.accent, themeDraft.surface].map((color) => <span key={color} className="h-5 w-10 rounded-full border border-white/10" style={{ background: color }} title={color} />)}</div>

          <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Fine-tune edition colours</summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Advanced colour controls stay collapsed until you need them. Saving here also updates linked scoreboard theme colours.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ColourControl label="Background" value={themeDraft.backgroundPrimary} onChange={(value) => setColour("backgroundPrimary", value)} />
              <ColourControl label="Secondary" value={themeDraft.backgroundSecondary} onChange={(value) => setColour("backgroundSecondary", value)} />
              <ColourControl label="Accent" value={themeDraft.accent} onChange={(value) => setColour("accent", value)} />
              <ColourControl label="Surface" value={themeDraft.surface} onChange={(value) => setColour("surface", value)} />
              <ColourControl label="Main text" value={themeDraft.textPrimary} onChange={(value) => setColour("textPrimary", value)} />
              <ColourControl label="Muted text" value={themeDraft.textMuted} onChange={(value) => setColour("textMuted", value)} />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={!paletteDirty || busy} onClick={() => setThemeDraft(savedTheme)} className="admin-action-secondary flex-1">
                <RotateCcw className="size-4" /> Reset
              </button>
              <button type="button" disabled={!paletteDirty || busy} onClick={() => void savePalette()} className="admin-action-primary flex-[1.4]">
                <Save className="size-4" /> {busy ? "Saving…" : paletteDirty ? "Save colours" : "Saved"}
              </button>
            </div>
          </details>
        </div>

        <div className="grid min-h-44 place-items-center overflow-hidden rounded-2xl border border-white/[0.07] bg-black/10 p-3">
          {artworkUrl ? <img src={artworkUrl} alt={`${editionLabel(edition as any)} official artwork`} className="block h-auto max-h-64 w-auto max-w-full rounded-xl object-contain" /> : <div className="text-center text-xs text-muted-foreground"><ImagePlus className="mx-auto mb-2 size-6 opacity-60" />No official artwork uploaded yet</div>}
        </div>
      </div>
    </section>
  );
}


function ColourControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [hex, setHex] = useState(value);

  useEffect(() => {
    setHex(value);
  }, [value]);

  const commit = () => {
    const next = hex.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(next)) {
      onChange(next);
    } else {
      setHex(value);
    }
  };

  return (
    <label className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <span className="admin-section-label">{label}</span>
      <span className="mt-2 flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(event) => {
            const next = event.target.value.toLowerCase();
            setHex(next);
            onChange(next);
          }}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-white/[0.1] bg-transparent p-1"
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          value={hex}
          onChange={(event) => setHex(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            }
          }}
          className="numeric min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/10 px-3 py-2.5 text-sm text-foreground"
          aria-label={`${label} hex colour`}
          maxLength={7}
        />
      </span>
    </label>
  );
}
