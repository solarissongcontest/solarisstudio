import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImageIcon, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminConfirmSheet } from "@/components/admin/AdminUI";
import {
  createJuryShareThemeOperationIdentity,
  DEFAULT_JURY_SHARE_EDITION_COMPOSITION,
  loadJuryShareThemeSnapshot,
  saveJuryShareThemeDraft,
  setJuryShareThemeState,
  validateJuryShareEditionComposition,
  type JuryShareEditionComposition,
  type JuryShareThemeValidationIssue,
  type JuryShareThemeVersion,
} from "@/lib/v3-jury-share-theme-client";

const SAMPLE_VOTES = [
  [12, "Country A"],
  [10, "Country B"],
  [8, "Country C"],
  [7, "Country D"],
  [6, "Country E"],
  [5, "Country F"],
  [4, "Country G"],
  [3, "Country H"],
  [2, "Country I"],
  [1, "Country J"],
] as const;

function cloneComposition(value: JuryShareEditionComposition): JuryShareEditionComposition {
  return JSON.parse(JSON.stringify(value)) as JuryShareEditionComposition;
}

function compositionFingerprint(value: JuryShareEditionComposition) {
  return JSON.stringify(value);
}

function issueLabel(issue: JuryShareThemeValidationIssue) {
  const base = issue.code.replaceAll("_", " ").toLowerCase();
  const label = base.charAt(0).toUpperCase() + base.slice(1);
  return issue.key ? `${label} · ${issue.key}` : label;
}

function latestTheme(themes: JuryShareThemeVersion[]) {
  return [...themes].sort((left, right) => right.version - left.version)[0] ?? null;
}

export type JuryShareEditionThemeEditorProps = {
  editionId: string;
  editionLabel: string;
  artworkStoragePath?: string | null;
  artworkUrl?: string | null;
  /**
   * Ready is deliberately fail-closed until the authoritative render-validation
   * contract proves PNG/JPEG export and layout/contrast checks for this exact
   * saved version. JSC-8 must not treat a pretty browser preview as authority.
   */
  renderValidationReady: boolean;
  renderValidationSummary?: string;
};

export function JuryShareEditionThemeEditor({
  editionId,
  editionLabel,
  artworkStoragePath = null,
  artworkUrl = null,
  renderValidationReady,
  renderValidationSummary,
}: JuryShareEditionThemeEditorProps) {
  const snapshotQuery = useQuery({
    queryKey: ["v3-jury-share-theme-snapshot", editionId],
    queryFn: () => loadJuryShareThemeSnapshot(editionId),
  });
  const latest = useMemo(
    () => latestTheme(snapshotQuery.data?.themes ?? []),
    [snapshotQuery.data?.themes],
  );
  const canonicalKey = latest ? `${latest.version}:${latest.updatedAt}` : "empty";

  const [draft, setDraft] = useState<JuryShareEditionComposition>(() =>
    withEditionArtwork(DEFAULT_JURY_SHARE_EDITION_COMPOSITION, artworkStoragePath),
  );
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [loadedCanonicalKey, setLoadedCanonicalKey] = useState<string | null>(null);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [readyReviewOpen, setReadyReviewOpen] = useState(false);
  const [archiveReviewOpen, setArchiveReviewOpen] = useState(false);

  const draftFingerprint = compositionFingerprint(draft);
  const dirty = Boolean(savedFingerprint) && draftFingerprint !== savedFingerprint;
  const localValidation = useMemo(() => validateJuryShareEditionComposition(draft), [draft]);

  useEffect(() => {
    if (!snapshotQuery.data) return;
    const next = latest?.composition
      ? cloneComposition(latest.composition)
      : withEditionArtwork(DEFAULT_JURY_SHARE_EDITION_COMPOSITION, artworkStoragePath);
    const nextFingerprint = compositionFingerprint(next);

    if (loadedCanonicalKey === null) {
      setDraft(next);
      setSavedFingerprint(nextFingerprint);
      setLoadedCanonicalKey(canonicalKey);
      setRemoteChanged(false);
      return;
    }

    if (canonicalKey !== loadedCanonicalKey) {
      if (dirty) {
        setRemoteChanged(true);
        return;
      }
      setDraft(next);
      setSavedFingerprint(nextFingerprint);
      setLoadedCanonicalKey(canonicalKey);
      setRemoteChanged(false);
    }
  }, [
    artworkStoragePath,
    canonicalKey,
    dirty,
    latest?.composition,
    loadedCanonicalKey,
    snapshotQuery.data,
  ]);

  useEffect(() => {
    setLoadedCanonicalKey(null);
    setSavedFingerprint("");
    setRemoteChanged(false);
    setMessage(null);
  }, [editionId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (remoteChanged) {
        throw new Error("The canonical theme changed while you were editing. Reload before saving.");
      }
      const identity = createJuryShareThemeOperationIdentity("save-draft");
      return saveJuryShareThemeDraft({
        editionId,
        composition: draft,
        expectedVersion: latest?.version ?? 0,
        ...identity,
      });
    },
    onSuccess: async (result) => {
      setMessage(
        result.replayed
          ? `Draft v${result.version} was already saved. Solaris reconciled the original operation receipt.`
          : `Draft v${result.version} saved with operation ${result.operationId}.`,
      );
      const refreshed = await snapshotQuery.refetch();
      const refreshedLatest = latestTheme(refreshed.data?.themes ?? []);
      if (refreshedLatest) {
        const next = cloneComposition(refreshedLatest.composition);
        setDraft(next);
        setSavedFingerprint(compositionFingerprint(next));
        setLoadedCanonicalKey(`${refreshedLatest.version}:${refreshedLatest.updatedAt}`);
        setRemoteChanged(false);
      }
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "The theme draft could not be saved.");
    },
  });

  const stateMutation = useMutation({
    mutationFn: async (targetState: "ready" | "archived") => {
      if (!latest) throw new Error("Save a draft before changing its state.");
      const identity = createJuryShareThemeOperationIdentity(
        targetState === "ready" ? "ready" : "archive",
      );
      return setJuryShareThemeState({
        editionId,
        version: latest.version,
        targetState,
        ...identity,
      });
    },
    onSuccess: async (result) => {
      setMessage(
        `${editionLabel} Edition share theme v${result.version} is ${result.state}. Operation ${result.operationId} is receipted.`,
      );
      setReadyReviewOpen(false);
      setArchiveReviewOpen(false);
      setRemoteChanged(false);
      setSavedFingerprint("");
      setLoadedCanonicalKey(null);
      await snapshotQuery.refetch();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Theme state could not be changed.");
    },
  });

  if (snapshotQuery.isLoading) {
    return (
      <section className="admin-panel flex min-h-64 items-center justify-center" aria-live="polite">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading Share graphics…
      </section>
    );
  }

  if (snapshotQuery.isError) {
    return (
      <section className="admin-panel space-y-4" role="alert">
        <div>
          <p className="text-sm font-black text-foreground">Share graphics unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Solaris could not load the canonical Edition-theme snapshot. No fallback data is being invented in the browser.
          </p>
        </div>
        <button
          type="button"
          className="admin-action-secondary"
          onClick={() => snapshotQuery.refetch()}
        >
          <RefreshCw className="size-4" /> Retry
        </button>
      </section>
    );
  }

  const serverValidation = latest?.validation ?? null;
  const readyBlockedReason = !latest
    ? "Save a draft first."
    : dirty
      ? "Save the current draft before validation."
      : remoteChanged
        ? "Canonical state changed. Reload before validation."
        : !localValidation.valid
          ? "Fix the local preview validation errors first."
          : !serverValidation?.valid
            ? "The saved version has not passed canonical server validation."
            : !renderValidationReady
              ? renderValidationSummary ??
                "Authoritative PNG/JPEG render validation is not available for this version yet."
              : null;

  return (
    <section className="space-y-5" data-v3-organizer-jury-share-theme-editor>
      <header className="admin-panel space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">{editionLabel}</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-foreground">Share graphics</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Configure the optional Edition design used for jury share cards. This changes presentation only. Jury votes and Results remain canonical elsewhere.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="admin-status-chip" data-state={latest?.state ?? "unconfigured"}>
              {latest ? `v${latest.version} · ${latest.state}` : "Unconfigured"}
            </span>
          </div>
        </div>
      </header>

      {remoteChanged ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-50" role="alert">
          <p className="font-black">This Edition theme changed elsewhere.</p>
          <p className="mt-1 text-amber-50/80">
            Your draft is based on an older canonical version. Nothing will be overwritten silently.
          </p>
          <button
            type="button"
            className="admin-action-secondary mt-3"
            onClick={() => {
              setSavedFingerprint("");
              setLoadedCanonicalKey(null);
              setRemoteChanged(false);
              snapshotQuery.refetch();
            }}
          >
            <RefreshCw className="size-4" /> Reload canonical version
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <ThemeSummaryCard
          title="Default"
          status="Always available"
          detail="Read-only Solaris design. Edition branding never mutates the permanent Default card."
        />
        <ThemeSummaryCard
          title="Edition"
          status={latest ? `Version ${latest.version} · ${latest.state}` : "Not configured"}
          detail="Editable structured composition for this Edition. Historical versions remain versioned."
          active
        />
        <ThemeSummaryCard
          title="Liquid Glass"
          status="Solaris-level theme"
          detail="Read-only here. Renderer availability is controlled by the shared Jury Share system."
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,430px)]">
        <div className="space-y-4">
          <EditorPanel title="Artwork" description="Bind only the canonical Edition artwork and adjust its composition.">
            <label className="admin-field-row">
              <span>Use Edition artwork</span>
              <input
                type="checkbox"
                checked={Boolean(draft.artwork)}
                disabled={!artworkStoragePath}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDraft((current) => ({
                    ...current,
                    artwork: checked && artworkStoragePath
                      ? current.artwork ?? defaultArtwork(artworkStoragePath)
                      : null,
                  }));
                }}
              />
            </label>
            {!artworkStoragePath ? (
              <p className="text-xs text-muted-foreground">
                This Edition has no canonical artwork asset configured. Add artwork in Edition branding first.
              </p>
            ) : null}
            {draft.artwork ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Placement"
                  value={draft.artwork.placement}
                  options={["top", "top_fade", "background", "bottom", "bottom_fade", "full"]}
                  onChange={(value) => updateArtwork(setDraft, { placement: value as JuryShareEditionComposition["artwork"] extends infer A ? A extends { placement: infer P } ? P : never : never })}
                />
                <SelectField
                  label="Scale"
                  value={draft.artwork.scale}
                  options={["cover", "contain"]}
                  onChange={(value) => updateArtwork(setDraft, { scale: value as "cover" | "contain" })}
                />
                <RangeField label="Focal X" min={0} max={1} step={0.01} value={draft.artwork.focalX} onChange={(value) => updateArtwork(setDraft, { focalX: value })} />
                <RangeField label="Focal Y" min={0} max={1} step={0.01} value={draft.artwork.focalY} onChange={(value) => updateArtwork(setDraft, { focalY: value })} />
                <RangeField label="Opacity" min={0} max={1} step={0.05} value={draft.artwork.opacity} onChange={(value) => updateArtwork(setDraft, { opacity: value })} />
                <RangeField label="Blur" min={0} max={40} step={1} value={draft.artwork.blurPx} onChange={(value) => updateArtwork(setDraft, { blurPx: value })} />
                <SelectField label="Fade" value={draft.artwork.fadeDirection} options={["none", "up", "down", "radial"]} onChange={(value) => updateArtwork(setDraft, { fadeDirection: value as "none" | "up" | "down" | "radial" })} />
                <RangeField label="Scrim" min={0} max={1} step={0.05} value={draft.artwork.scrimStrength} onChange={(value) => updateArtwork(setDraft, { scrimStrength: value })} />
              </div>
            ) : null}
          </EditorPanel>

          <EditorPanel title="Scoreboard" description="Inherit the Edition scoreboard, with only the permitted Story-card token subset exposed.">
            <label className="admin-field-row">
              <span>Inherit Edition scoreboard</span>
              <input
                type="checkbox"
                checked={draft.scoreboard.inheritEditionScoreboard}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scoreboard: { ...current.scoreboard, inheritEditionScoreboard: event.target.checked },
                  }))
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField label="Normal row" value={draft.scoreboard.standardRowBackground} onChange={(value) => updateScoreboard(setDraft, { standardRowBackground: value })} />
              <ColorField label="Normal text" value={draft.scoreboard.standardRowForeground} onChange={(value) => updateScoreboard(setDraft, { standardRowForeground: value })} />
              <ColorField label="12 points" value={draft.scoreboard.twelvePointBackground} onChange={(value) => updateScoreboard(setDraft, { twelvePointBackground: value })} />
              <ColorField label="12-point text" value={draft.scoreboard.twelvePointForeground} onChange={(value) => updateScoreboard(setDraft, { twelvePointForeground: value })} />
              <RangeField label="Row radius" min={0} max={72} step={1} value={draft.scoreboard.rowRadius} onChange={(value) => updateScoreboard(setDraft, { rowRadius: value })} />
              <RangeField label="Row height" min={72} max={128} step={2} value={draft.scoreboard.rowHeight} onChange={(value) => updateScoreboard(setDraft, { rowHeight: value })} />
              <SelectField label="Flag frame" value={draft.scoreboard.flagTreatment} options={["plain", "soft_frame", "edition"]} onChange={(value) => updateScoreboard(setDraft, { flagTreatment: value as "plain" | "soft_frame" | "edition" })} />
              <SelectField label="Score treatment" value={draft.scoreboard.scoreTreatment} options={["plain", "capsule", "edition"]} onChange={(value) => updateScoreboard(setDraft, { scoreTreatment: value as "plain" | "capsule" | "edition" })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Header & footer" description="Keep identity treatment structured and reproducible across historical exports.">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Header logo" value={draft.header.logoMode} options={["edition", "solaris", "none"]} onChange={(value) => setDraft((current) => ({ ...current, header: { ...current.header, logoMode: value as "edition" | "solaris" | "none" } }))} />
              <SelectField label="Header alignment" value={draft.header.alignment} options={["left", "center", "right"]} onChange={(value) => setDraft((current) => ({ ...current, header: { ...current.header, alignment: value as "left" | "center" | "right" } }))} />
              <SelectField label="Source country" value={draft.footer.sourceCountryTreatment} options={["edition", "system"]} onChange={(value) => setDraft((current) => ({ ...current, footer: { ...current.footer, sourceCountryTreatment: value as "edition" | "system" } }))} />
              <SelectField label="Footer panel" value={draft.footer.backgroundTreatment} options={["none", "soft_panel"]} onChange={(value) => setDraft((current) => ({ ...current, footer: { ...current.footer, backgroundTreatment: value as "none" | "soft_panel" } }))} />
              <ColorField label="Canvas" value={draft.background.baseColor} onChange={(value) => setDraft((current) => ({ ...current, background: { ...current.background, baseColor: value } }))} />
            </div>
          </EditorPanel>

          <EditorPanel title="Story safe area" description="Critical identity, scores and footer must remain inside the protected 1080 × 1920 composition area.">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["top", "right", "bottom", "left"] as const).map((edge) => (
                <NumberField
                  key={edge}
                  label={edge.charAt(0).toUpperCase() + edge.slice(1)}
                  value={draft.safeArea[edge]}
                  min={0}
                  max={600}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      safeArea: { ...current.safeArea, [edge]: value },
                    }))
                  }
                />
              ))}
            </div>
          </EditorPanel>

          <ValidationPanel
            localIssues={localValidation.errors}
            localWarnings={localValidation.warnings}
            serverTheme={latest}
            renderValidationReady={renderValidationReady}
            renderValidationSummary={renderValidationSummary}
          />

          <div className="admin-panel flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="admin-action-primary"
              disabled={!dirty || !localValidation.valid || remoteChanged || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save draft
            </button>
            <button
              type="button"
              className="admin-action-secondary"
              disabled={Boolean(readyBlockedReason) || stateMutation.isPending}
              onClick={() => setReadyReviewOpen(true)}
              title={readyBlockedReason ?? undefined}
            >
              <ShieldCheck className="size-4" /> Mark Ready
            </button>
            {latest?.state === "ready" ? (
              <button
                type="button"
                className="admin-action-secondary"
                disabled={stateMutation.isPending}
                onClick={() => setArchiveReviewOpen(true)}
              >
                Archive / freeze
              </button>
            ) : null}
            {readyBlockedReason ? (
              <p className="basis-full text-xs text-muted-foreground">Ready blocked: {readyBlockedReason}</p>
            ) : null}
            {message ? <p className="basis-full text-xs text-muted-foreground" aria-live="polite">{message}</p> : null}
          </div>
        </div>

        <JurySharePreview
          editionLabel={editionLabel}
          composition={draft}
          artworkUrl={draft.artwork ? artworkUrl : null}
        />
      </div>

      <AdminConfirmSheet
        open={readyReviewOpen}
        onClose={() => !stateMutation.isPending && setReadyReviewOpen(false)}
        onConfirm={() => stateMutation.mutate("ready")}
        title={`Mark ${editionLabel} Jury Share theme Ready?`}
        description={
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              This activates Edition theme version {latest?.version ?? "?"} for future official jury-share renders. Default and Liquid Glass remain separate themes.
            </p>
            <p>
              Solaris will revalidate the exact saved version on the server. A later edit creates a new draft version instead of silently rewriting historical output.
            </p>
            <p>
              Render evidence: {renderValidationSummary ?? "authoritative PNG/JPEG validation passed for this exact version"}.
            </p>
          </div>
        }
        confirmLabel="Mark Ready"
        busy={stateMutation.isPending}
      />

      <AdminConfirmSheet
        open={archiveReviewOpen}
        onClose={() => !stateMutation.isPending && setArchiveReviewOpen(false)}
        onConfirm={() => stateMutation.mutate("archived")}
        title={`Archive ${editionLabel} Jury Share theme v${latest?.version ?? "?"}?`}
        description="Archived Jury Share theme versions are immutable. The server will allow this transition only when canonical Edition state permits it."
        confirmLabel="Archive theme"
        confirmationText={editionLabel}
        confirmationHint={`Type ${editionLabel} to freeze this historical theme version`}
        busy={stateMutation.isPending}
      />
    </section>
  );
}

function withEditionArtwork(
  composition: JuryShareEditionComposition,
  artworkStoragePath: string | null,
): JuryShareEditionComposition {
  const next = cloneComposition(composition);
  next.artwork = artworkStoragePath ? defaultArtwork(artworkStoragePath) : null;
  return next;
}

function defaultArtwork(assetId: string): NonNullable<JuryShareEditionComposition["artwork"]> {
  return {
    assetId,
    placement: "top_fade",
    focalX: 0.5,
    focalY: 0.5,
    scale: "cover",
    opacity: 0.9,
    blurPx: 0,
    fadeDirection: "down",
    fadeStart: 0.2,
    fadeEnd: 0.62,
    scrimStrength: 0.38,
  };
}

function updateArtwork(
  setDraft: React.Dispatch<React.SetStateAction<JuryShareEditionComposition>>,
  patch: Partial<NonNullable<JuryShareEditionComposition["artwork"]>>,
) {
  setDraft((current) => ({
    ...current,
    artwork: current.artwork ? { ...current.artwork, ...patch } : current.artwork,
  }));
}

function updateScoreboard(
  setDraft: React.Dispatch<React.SetStateAction<JuryShareEditionComposition>>,
  patch: Partial<JuryShareEditionComposition["scoreboard"]>,
) {
  setDraft((current) => ({
    ...current,
    scoreboard: { ...current.scoreboard, ...patch },
  }));
}

function ThemeSummaryCard({
  title,
  status,
  detail,
  active = false,
}: {
  title: string;
  status: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className={`admin-panel ${active ? "ring-1 ring-cyan-300/30" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-black text-foreground">{title}</p>
        {active ? <CheckCircle2 className="size-4 text-cyan-200" aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-cyan-200">{status}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function EditorPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-panel space-y-4">
      <div>
        <h3 className="font-black text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select
        className="admin-input min-h-11 w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
        ))}
      </select>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
      <span className="flex justify-between gap-2"><span>{label}</span><span>{value}</span></span>
      <input
        className="min-h-11 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <span className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <span className="font-mono text-[11px] uppercase">{value}</span>
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input
        className="admin-input min-h-11 w-full"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ValidationPanel({
  localIssues,
  localWarnings,
  serverTheme,
  renderValidationReady,
  renderValidationSummary,
}: {
  localIssues: JuryShareThemeValidationIssue[];
  localWarnings: JuryShareThemeValidationIssue[];
  serverTheme: JuryShareThemeVersion | null;
  renderValidationReady: boolean;
  renderValidationSummary?: string;
}) {
  return (
    <section className="admin-panel space-y-3" aria-labelledby="jury-share-validation-title">
      <div>
        <h3 id="jury-share-validation-title" className="font-black text-foreground">Validation</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Local preview checks assist editing. Canonical server and renderer evidence remain authoritative for Ready.
        </p>
      </div>
      <ValidationLine ok={localIssues.length === 0} label="Preview geometry and structured tokens" />
      <ValidationLine ok={serverTheme?.validation.valid === true} label="Canonical server validation" />
      <ValidationLine ok={renderValidationReady} label="Authoritative PNG/JPEG render validation" />
      {renderValidationSummary ? <p className="text-xs text-muted-foreground">{renderValidationSummary}</p> : null}
      {localIssues.length ? (
        <ul className="space-y-1 text-xs text-rose-100">
          {localIssues.map((issue, index) => <li key={`${issue.code}:${issue.key ?? index}`}>• {issueLabel(issue)}</li>)}
        </ul>
      ) : null}
      {localWarnings.length ? (
        <ul className="space-y-1 text-xs text-amber-100/90">
          {localWarnings.map((issue, index) => <li key={`${issue.code}:${issue.key ?? index}`}>• {issue.detail ?? issueLabel(issue)}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function ValidationLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-3 text-sm">
      <span>{label}</span>
      <span className={ok ? "font-bold text-emerald-200" : "font-bold text-amber-200"}>
        {ok ? "Pass" : "Required"}
      </span>
    </div>
  );
}

function JurySharePreview({
  editionLabel,
  composition,
  artworkUrl,
}: {
  editionLabel: string;
  composition: JuryShareEditionComposition;
  artworkUrl: string | null;
}) {
  const artwork = composition.artwork;
  const headerAlign = composition.header.alignment === "left"
    ? "items-start text-left"
    : composition.header.alignment === "right"
      ? "items-end text-right"
      : "items-center text-center";

  return (
    <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Preview</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Non-sensitive sample vote data only. Hidden Jury ballots are never loaded for styling.
        </p>
      </div>
      <div
        className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border border-white/10 shadow-2xl"
        style={{ aspectRatio: "9 / 16", backgroundColor: composition.background.baseColor }}
        aria-label={`${editionLabel} jury share card sample preview`}
      >
        {artwork && artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: artwork.scale,
              objectPosition: `${artwork.focalX * 100}% ${artwork.focalY * 100}%`,
              opacity: artwork.opacity,
              filter: `blur(${artwork.blurPx}px)`,
            }}
          />
        ) : null}
        {artwork ? (
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{ background: `rgba(0, 0, 0, ${artwork.scrimStrength})` }}
          />
        ) : null}
        <div
          className="absolute flex flex-col"
          style={{
            top: `${(composition.safeArea.top / 1920) * 100}%`,
            right: `${(composition.safeArea.right / 1080) * 100}%`,
            bottom: `${(composition.safeArea.bottom / 1920) * 100}%`,
            left: `${(composition.safeArea.left / 1080) * 100}%`,
          }}
        >
          <div className={`flex flex-col ${headerAlign}`}>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70">Solaris</span>
            <strong className="mt-1 text-[16px] leading-tight text-white">{editionLabel}</strong>
            <span className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-white/60">Grand Final · sample</span>
          </div>
          <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-1.5">
            {SAMPLE_VOTES.map(([points, country]) => {
              const top = points === 12;
              return (
                <div
                  key={points}
                  className="flex items-center gap-2 px-2.5 font-bold"
                  style={{
                    minHeight: `${Math.max(22, Math.min(34, composition.scoreboard.rowHeight / 4))}px`,
                    borderRadius: `${Math.max(4, composition.scoreboard.rowRadius / 4)}px`,
                    backgroundColor: top
                      ? composition.scoreboard.twelvePointBackground
                      : composition.scoreboard.standardRowBackground,
                    color: top
                      ? composition.scoreboard.twelvePointForeground
                      : composition.scoreboard.standardRowForeground,
                  }}
                >
                  <span className="inline-flex h-3.5 w-5 shrink-0 items-center justify-center rounded-sm bg-white/20 text-[6px]" aria-hidden="true">▰</span>
                  <span className="min-w-0 flex-1 truncate text-[9px]">{country}</span>
                  <span className="text-[10px] tabular-nums">{String(points).padStart(2, "0")}</span>
                </div>
              );
            })}
          </div>
          <div className={composition.footer.backgroundTreatment === "soft_panel" ? "rounded-xl bg-black/20 p-2" : "pt-2"}>
            <span className="block text-[7px] font-bold uppercase tracking-[0.18em] text-white/60">Votes of:</span>
            <strong className="mt-0.5 block text-[18px] leading-none text-white">Sample Country</strong>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs text-muted-foreground">
        <ImageIcon className="mb-2 size-4 text-cyan-200" aria-hidden="true" />
        Preview is proportional. Final Story rendering remains exactly 1080 × 1920 and must be validated by the canonical renderer before Ready can be enabled.
      </div>
    </aside>
  );
}
