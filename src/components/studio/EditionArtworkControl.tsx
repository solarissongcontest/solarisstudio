import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Palette, RotateCcw, Save } from "lucide-react";

import { AdminConfirmSheet } from "@/components/admin/AdminUI";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions, useShows, useThemes } from "@/lib/data";
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
  theme_id?: string | null;
  logo?: string | null;
  artwork_url?: string | null;
  artwork_storage_path?: string | null;
  theme_colors?: unknown;
};

type ArtworkThemeSnapshot = {
  id: string;
  config: unknown;
  configFingerprint: string;
};

type ArtworkShowSnapshot = {
  id: string;
  themeId: string | null;
};

type ArtworkBaseline = {
  editionId: string;
  editionName: string;
  editionThemeId: string | null;
  logo: string | null;
  artworkUrl: string | null;
  artworkStoragePath: string | null;
  themeColorsFingerprint: string;
  themeColors: unknown;
  shows: ArtworkShowSnapshot[];
  themes: ArtworkThemeSnapshot[];
};

type PendingArtworkReview =
  | {
      kind: "upload";
      baseline: ArtworkBaseline;
      file: File;
      theme: VisualTheme;
      palette: string[];
    }
  | {
      kind: "palette";
      baseline: ArtworkBaseline;
      theme: VisualTheme;
      palette: string[];
    };

export function EditionArtworkControl({ slug }: { slug: string }) {
  const { data: editions } = useEditions();
  const { data: themes = [] } = useThemes();
  const edition = useMemo(() => (editions ?? []).find((item) => item.slug === slug) as EditionArtworkRow | undefined, [editions, slug]);
  const { data: shows = [] } = useShows(edition?.id);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<VisualTheme>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<VisualTheme>(DEFAULT_THEME);
  const [palette, setPalette] = useState<string[]>([]);
  const [pendingReview, setPendingReview] = useState<PendingArtworkReview | null>(null);

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
    setPendingReview(null);
  }, [edition]);

  if (!edition) return null;
  const activeEdition = edition;
  const artworkUrl = activeEdition.artwork_url ?? null;
  const paletteDirty = JSON.stringify(themeDraft) !== JSON.stringify(savedTheme);
  const editionShows = shows.filter((show) => show.edition_id === activeEdition.id);

  function captureBaseline(): ArtworkBaseline | null {
    const showSnapshots = editionShows
      .map<ArtworkShowSnapshot>((show) => ({ id: show.id, themeId: show.theme_id ?? null }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const themeIds = new Set<string>();
    if (activeEdition.theme_id) themeIds.add(activeEdition.theme_id);
    for (const show of showSnapshots) if (show.themeId) themeIds.add(show.themeId);

    const themeSnapshots: ArtworkThemeSnapshot[] = [];
    for (const themeId of [...themeIds].sort()) {
      const row = themes.find((item) => item.id === themeId);
      if (!row) {
        setMessage("A linked scoreboard theme is not loaded yet. Reload this Production workspace before reviewing artwork or colour changes.");
        return null;
      }
      themeSnapshots.push({
        id: themeId,
        config: cloneForReview(row.config),
        configFingerprint: stableFingerprint(row.config),
      });
    }

    return {
      editionId: activeEdition.id,
      editionName: editionLabel(activeEdition as any),
      editionThemeId: activeEdition.theme_id ?? null,
      logo: activeEdition.logo ?? null,
      artworkUrl: activeEdition.artwork_url ?? null,
      artworkStoragePath: activeEdition.artwork_storage_path ?? null,
      themeColorsFingerprint: stableFingerprint(activeEdition.theme_colors ?? null),
      themeColors: cloneForReview(activeEdition.theme_colors ?? null),
      shows: showSnapshots,
      themes: themeSnapshots,
    };
  }

  async function prepareArtworkReview(file: File) {
    if (busy) return;
    setBusy(true);
    setMessage("Reading artwork colours locally before review…");
    try {
      const extracted = await extractThemeFromImage(file);
      const baseline = captureBaseline();
      if (!baseline) return;
      setPendingReview({
        kind: "upload",
        baseline,
        file,
        theme: cloneForReview(extracted.theme),
        palette: [...extracted.palette],
      });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be prepared for review.");
    } finally {
      setBusy(false);
    }
  }

  function preparePaletteReview() {
    if (!paletteDirty || busy) return;
    const baseline = captureBaseline();
    if (!baseline) return;
    setPendingReview({
      kind: "palette",
      baseline,
      theme: cloneForReview(themeDraft),
      palette: [...palette],
    });
    setMessage(null);
  }

  async function verifyBaseline(baseline: ArtworkBaseline) {
    const { data: liveEdition, error: editionError } = await supabase
      .from("editions")
      .select("id,theme_id,logo,artwork_url,artwork_storage_path,theme_colors")
      .eq("id", baseline.editionId)
      .maybeSingle();
    if (editionError) throw editionError;
    if (
      !liveEdition ||
      (liveEdition.theme_id ?? null) !== baseline.editionThemeId ||
      (liveEdition.logo ?? null) !== baseline.logo ||
      (liveEdition.artwork_url ?? null) !== baseline.artworkUrl ||
      (liveEdition.artwork_storage_path ?? null) !== baseline.artworkStoragePath ||
      stableFingerprint(liveEdition.theme_colors ?? null) !== baseline.themeColorsFingerprint
    ) {
      throw new Error("Edition artwork or colour state changed while this review was open. Nothing was uploaded or saved. Reload and review the latest state.");
    }

    const { data: liveShows, error: showError } = await supabase
      .from("shows")
      .select("id,theme_id")
      .eq("edition_id", baseline.editionId);
    if (showError) throw showError;
    const liveShowSnapshots = (liveShows ?? [])
      .map((show: { id: string; theme_id?: string | null }) => ({ id: show.id, themeId: show.theme_id ?? null }))
      .sort((left: ArtworkShowSnapshot, right: ArtworkShowSnapshot) => left.id.localeCompare(right.id));
    if (stableFingerprint(liveShowSnapshots) !== stableFingerprint(baseline.shows)) {
      throw new Error("Show-to-theme assignments changed while this review was open. Nothing was uploaded or saved. Reload and review again.");
    }

    if (baseline.themes.length) {
      const themeIds = baseline.themes.map((theme) => theme.id);
      const { data: liveThemes, error: themeError } = await supabase
        .from("themes")
        .select("id,config")
        .in("id", themeIds);
      if (themeError) throw themeError;
      const liveThemeById = new Map((liveThemes ?? []).map((theme: { id: string; config?: unknown }) => [theme.id, theme]));
      for (const reviewedTheme of baseline.themes) {
        const liveTheme = liveThemeById.get(reviewedTheme.id) as { id: string; config?: unknown } | undefined;
        if (!liveTheme || stableFingerprint(liveTheme.config) !== reviewedTheme.configFingerprint) {
          throw new Error("A linked scoreboard theme changed while this review was open. Nothing was uploaded or saved. Reload and review again.");
        }
      }
    }
  }

  const buildSyncedConfig = (configInput: unknown, nextTheme: VisualTheme) => {
    const config = { ...((configInput && typeof configInput === "object" ? configInput : {}) as Record<string, any>) };
    config.background = { ...(config.background ?? {}), type: "gradient", color: nextTheme.backgroundPrimary, gradientFrom: nextTheme.backgroundPrimary, gradientTo: nextTheme.backgroundSecondary };
    config.colors = { ...(config.colors ?? {}), primary: nextTheme.backgroundPrimary, secondary: nextTheme.backgroundSecondary, accent: nextTheme.accent, text: nextTheme.textPrimary, jury: nextTheme.accent, televote: nextTheme.backgroundSecondary };
    config.chrome = { ...(config.chrome ?? {}), headerBackground: nextTheme.backgroundPrimary, headerText: nextTheme.textPrimary, panelBackground: nextTheme.surface, panelText: nextTheme.textPrimary, progressTrack: nextTheme.backgroundSecondary, progressFill: nextTheme.accent, spokespersonBackground: nextTheme.surface, spokespersonText: nextTheme.textPrimary, spokespersonAccent: nextTheme.accent };
    config.states = { ...(config.states ?? {}), leaderBackground: nextTheme.surface, leaderBorder: nextTheme.accent, leaderText: nextTheme.textPrimary, highlight: nextTheme.accent, votingBackground: nextTheme.backgroundSecondary, votingText: nextTheme.textPrimary, selected: nextTheme.accent, hover: nextTheme.surface, qualified: nextTheme.accent };
    return config;
  };

  async function synchroniseReviewedScoreboardThemes(nextTheme: VisualTheme, reviewedThemes: ArtworkThemeSnapshot[]) {
    for (const reviewedTheme of reviewedThemes) {
      const { error } = await supabase
        .from("themes")
        .update({ config: buildSyncedConfig(reviewedTheme.config, nextTheme) })
        .eq("id", reviewedTheme.id);
      if (error) throw error;
    }
  }

  async function applyReviewedChange() {
    const review = pendingReview;
    if (!review || busy) return;
    setBusy(true);
    setMessage(null);
    let mutationStarted = false;
    try {
      await verifyBaseline(review.baseline);
      mutationStarted = true;

      if (review.kind === "upload") {
        const asset = await uploadEditionArtwork(review.baseline.editionId, review.file);
        await saveEditionVisualTheme({
          editionId: review.baseline.editionId,
          expected: {
            artwork_url: review.baseline.artworkUrl, artwork_storage_path: review.baseline.artworkStoragePath,
            theme_colors: review.baseline.themeColors, logo: review.baseline.logo,
            theme_id: review.baseline.editionThemeId,
          },
          artworkUrl: asset.publicUrl,
          artworkStoragePath: asset.storagePath,
          theme: review.theme,
          palette: review.palette,
          generatedFromArtwork: true,
          logoUrl: asset.publicUrl,
        });
        await synchroniseReviewedScoreboardThemes(review.theme, review.baseline.themes);

        setThemeDraft(review.theme);
        setSavedTheme(review.theme);
        setPalette(review.palette);
        setMessage("Official artwork saved. It will appear uncropped on the public edition page.");
      } else {
        await saveEditionVisualTheme({
          editionId: review.baseline.editionId,
          expected: {
            artwork_url: review.baseline.artworkUrl, artwork_storage_path: review.baseline.artworkStoragePath,
            theme_colors: review.baseline.themeColors, logo: review.baseline.logo,
            theme_id: review.baseline.editionThemeId,
          },
          artworkUrl: review.baseline.artworkUrl,
          artworkStoragePath: review.baseline.artworkStoragePath,
          theme: review.theme,
          palette: review.palette,
          generatedFromArtwork: false,
        });
        await synchroniseReviewedScoreboardThemes(review.theme, review.baseline.themes);
        setThemeDraft(review.theme);
        setSavedTheme(review.theme);
        setPalette(review.palette);
        setMessage("Edition colours saved and synced to the reviewed scoreboard themes.");
      }

      setPendingReview(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["all-shows"] }),
      ]);
    } catch (error) {
      setPendingReview(null);
      const detail = error instanceof Error ? error.message : "The reviewed edition artwork change could not be applied.";
      setMessage(
        mutationStarted
          ? `${detail} Artwork/theme persistence currently spans multiple legacy operations and is not atomic. Refresh canonical state before retrying because verified upload or theme changes may already have succeeded.`
          : detail,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
      ]);
    } finally {
      setBusy(false);
    }
  }

  function setColour(key: keyof VisualTheme, value: string) {
    setThemeDraft((current) => ({ ...current, [key]: value }));
  }

  const reviewTitle = pendingReview?.kind === "upload"
    ? `Replace ${pendingReview.baseline.editionName} official artwork?`
    : `Apply ${pendingReview?.baseline.editionName ?? "edition"} colour changes?`;

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
              {busy ? "Preparing…" : artworkUrl ? "Review replacement artwork" : "Review artwork upload"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepareArtworkReview(file); event.currentTarget.value = ""; }} />
            </label>
            <span className="admin-action-secondary pointer-events-none"><Palette className="size-4" /> Colours live here now</span>
          </div>

          {message ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{message}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">{[themeDraft.backgroundPrimary, themeDraft.backgroundSecondary, themeDraft.accent, themeDraft.surface].map((color) => <span key={color} className="h-5 w-10 rounded-full border border-white/10" style={{ background: color }} title={color} />)}</div>

          <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Fine-tune edition colours</summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Advanced colour controls stay collapsed until you need them. Applying them also updates the exact linked scoreboard themes shown in review.</p>
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
              <button type="button" disabled={!paletteDirty || busy} onClick={preparePaletteReview} className="admin-action-primary flex-[1.4]">
                <Save className="size-4" /> {busy ? "Preparing…" : paletteDirty ? "Review colour changes" : "Saved"}
              </button>
            </div>
          </details>
        </div>

        <div className="grid min-h-44 place-items-center overflow-hidden rounded-2xl border border-white/[0.07] bg-black/10 p-3">
          {artworkUrl ? <img src={artworkUrl} alt={`${editionLabel(edition as any)} official artwork`} className="block h-auto max-h-64 w-auto max-w-full rounded-xl object-contain" /> : <div className="text-center text-xs text-muted-foreground"><ImagePlus className="mx-auto mb-2 size-6 opacity-60" />No official artwork uploaded yet</div>}
        </div>
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingReview)}
        onClose={() => !busy && setPendingReview(null)}
        onConfirm={applyReviewedChange}
        title={reviewTitle}
        description={pendingReview ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Edition:</span> {pendingReview.baseline.editionName}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Stable edition ID:</span> {pendingReview.baseline.editionId}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Linked shows:</span> {pendingReview.baseline.shows.length}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Scoreboard themes to sync:</span> {pendingReview.baseline.themes.length}</p>
              {pendingReview.kind === "upload" ? (
                <>
                  <p className="mt-3"><span className="font-semibold text-foreground">File:</span> {pendingReview.file.name}</p>
                  <p className="mt-1"><span className="font-semibold text-foreground">Type:</span> {pendingReview.file.type || "unknown"}</p>
                  <p className="mt-1"><span className="font-semibold text-foreground">Size:</span> {formatBytes(pendingReview.file.size)}</p>
                </>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Solaris re-reads the edition artwork fields, edition/show theme bindings and every linked theme configuration immediately before apply. If any reviewed source changed, the operation fails closed before upload or save.
            </p>
            <p className="text-xs leading-relaxed text-amber-100/85">
              Artwork details and the compatibility logo save together. Uploads and linked scoreboard theme updates can finish separately; refresh canonical state if the operation is interrupted.
            </p>
          </div>
        ) : null}
        confirmLabel={pendingReview?.kind === "upload" ? "Upload reviewed artwork" : "Apply reviewed colours"}
        confirmationText={pendingReview?.baseline.editionName}
        confirmationHint={pendingReview ? `Type ${pendingReview.baseline.editionName} exactly to confirm this Production design change` : undefined}
        busy={busy}
        danger={pendingReview?.kind === "upload" && Boolean(pendingReview.baseline.artworkUrl)}
      />
    </section>
  );
}

function cloneForReview<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableFingerprint(value: unknown): string {
  return JSON.stringify(normalizeFingerprintValue(value));
}

function normalizeFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = normalizeFingerprintValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
