import { useMemo } from "react";

import {
  JURY_SHARE_SAMPLE_VOTES,
  JURY_SHARE_STORY_SIZE,
  formatJuryShareScore,
  validateJuryShareThemeForReady,
  validateJuryShareThemeStructure,
  type JuryShareEditionTheme,
  type JuryShareValidationEvidence,
} from "@/lib/v3-jury-share-theme";

type ArtworkOption = {
  id: string;
  label: string;
  url: string;
};

type JuryShareThemeEditorProps = {
  editionLabel: string;
  sourceCountryLabel?: string;
  theme: JuryShareEditionTheme;
  artworkOptions?: readonly ArtworkOption[];
  editionLogoUrl?: string | null;
  validationEvidence?: Partial<JuryShareValidationEvidence>;
  disabled?: boolean;
  onChange: (theme: JuryShareEditionTheme) => void;
  onRequestSaveDraft?: (theme: JuryShareEditionTheme) => void;
  onRequestReady?: (theme: JuryShareEditionTheme) => void;
};

function replaceSection<K extends keyof JuryShareEditionTheme>(
  theme: JuryShareEditionTheme,
  key: K,
  value: JuryShareEditionTheme[K],
): JuryShareEditionTheme {
  return { ...theme, [key]: value };
}

function numberFromInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function JuryShareThemePreview({
  editionLabel,
  sourceCountryLabel = "Sample delegation",
  theme,
  artworkOptions = [],
  editionLogoUrl,
}: Pick<
  JuryShareThemeEditorProps,
  "editionLabel" | "sourceCountryLabel" | "theme" | "artworkOptions" | "editionLogoUrl"
>) {
  const artwork = artworkOptions.find((candidate) => candidate.id === theme.artwork.assetId);
  const artworkPosition = `${Math.round(theme.artwork.focalX * 100)}% ${Math.round(theme.artwork.focalY * 100)}%`;
  const fadeDirection =
    theme.artwork.fadeDirection === "up"
      ? "to top"
      : theme.artwork.fadeDirection === "radial"
        ? "circle at center"
        : "to bottom";
  const fadeMask =
    theme.artwork.fadeDirection === "none"
      ? undefined
      : theme.artwork.fadeDirection === "radial"
        ? `radial-gradient(${fadeDirection}, #000 ${theme.artwork.fadeStart * 100}%, transparent ${theme.artwork.fadeEnd * 100}%)`
        : `linear-gradient(${fadeDirection}, #000 ${theme.artwork.fadeStart * 100}%, transparent ${theme.artwork.fadeEnd * 100}%)`;

  return (
    <figure className="mx-auto w-full max-w-[23rem]">
      <div
        className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#071326] shadow-2xl"
        style={{ aspectRatio: String(JURY_SHARE_STORY_SIZE.aspectRatio) }}
        aria-label={`${editionLabel} jury share graphic preview using non-sensitive sample votes`}
      >
        {theme.artwork.enabled && artwork ? (
          <img
            src={artwork.url}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: theme.artwork.scale,
              objectPosition: artworkPosition,
              opacity: theme.artwork.opacity,
              filter: theme.artwork.blurPx ? `blur(${theme.artwork.blurPx}px)` : undefined,
              maskImage: fadeMask,
              WebkitMaskImage: fadeMask,
            }}
          />
        ) : null}
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: theme.artwork.scrimStrength }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full flex-col px-[7%] pb-[8%] pt-[7%] text-white">
          <header
            className={
              theme.header.alignment === "left"
                ? "text-left"
                : theme.header.alignment === "right"
                  ? "text-right"
                  : "text-center"
            }
          >
            {theme.header.useEditionLogo && editionLogoUrl ? (
              <img
                src={editionLogoUrl}
                alt={`${editionLabel} logo`}
                className={`mb-2 inline-block max-h-12 max-w-[70%] object-contain ${
                  theme.header.alignment === "left"
                    ? "mr-auto"
                    : theme.header.alignment === "right"
                      ? "ml-auto"
                      : "mx-auto"
                }`}
              />
            ) : null}
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-white/70">
              Solaris Song Contest
            </p>
            <h3 className="mt-1 text-lg font-black leading-tight">{editionLabel}</h3>
            <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/60">
              Jury vote · sample preview
            </p>
          </header>

          <div className="my-auto grid gap-1.5 py-4">
            {JURY_SHARE_SAMPLE_VOTES.map((vote, index) => {
              const top = index === 0;
              return (
                <div
                  key={vote.points}
                  className={`grid grid-cols-[2.35rem_minmax(0,1fr)_2.3rem] items-center gap-2 rounded-xl px-2.5 py-1.5 text-[0.7rem] font-bold backdrop-blur-sm ${
                    top && theme.scoreboard.topScoreTreatment === "solaris_gold"
                      ? "bg-amber-100/95 text-slate-950"
                      : top && theme.scoreboard.topScoreTreatment === "edition"
                        ? "bg-white/90 text-slate-950"
                        : "bg-slate-950/55 text-white"
                  }`}
                >
                  <span className="tabular-nums opacity-75">
                    {formatJuryShareScore(vote.points, theme.scoreboard.scoreFormat)}
                  </span>
                  <span className="truncate">{vote.country}</span>
                  <span className="text-right tabular-nums">{vote.points}</span>
                </div>
              );
            })}
          </div>

          <footer
            className={`rounded-2xl px-3 py-2 ${
              theme.footer.backgroundTreatment === "panel"
                ? "bg-slate-950/65"
                : theme.footer.backgroundTreatment === "fade"
                  ? "bg-gradient-to-t from-slate-950/70 to-transparent"
                  : ""
            }`}
          >
            <p className="text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-white/60">Votes of</p>
            <p className="mt-0.5 text-sm font-black uppercase tracking-wide">{sourceCountryLabel}</p>
          </footer>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
        9:16 preview with sample data only. Hidden or unpublished jury votes are never required for branding work.
      </figcaption>
    </figure>
  );
}

export function JuryShareThemeEditor({
  editionLabel,
  sourceCountryLabel,
  theme,
  artworkOptions = [],
  editionLogoUrl,
  validationEvidence = {},
  disabled = false,
  onChange,
  onRequestSaveDraft,
  onRequestReady,
}: JuryShareThemeEditorProps) {
  const structuralValidation = useMemo(() => validateJuryShareThemeStructure(theme), [theme]);
  const readyValidation = useMemo(
    () => validateJuryShareThemeForReady(theme, validationEvidence),
    [theme, validationEvidence],
  );
  const ready = readyValidation.status === "valid";

  const setArtwork = (patch: Partial<JuryShareEditionTheme["artwork"]>) =>
    onChange(replaceSection(theme, "artwork", { ...theme.artwork, ...patch }));
  const setScoreboard = (patch: Partial<JuryShareEditionTheme["scoreboard"]>) =>
    onChange(replaceSection(theme, "scoreboard", { ...theme.scoreboard, ...patch }));
  const setHeader = (patch: Partial<JuryShareEditionTheme["header"]>) =>
    onChange(replaceSection(theme, "header", { ...theme.header, ...patch }));
  const setFooter = (patch: Partial<JuryShareEditionTheme["footer"]>) =>
    onChange(replaceSection(theme, "footer", { ...theme.footer, ...patch }));

  return (
    <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,26rem)]">
      <div className="min-w-0 space-y-4">
        <header>
          <p className="admin-section-label">Edition branding</p>
          <h2 className="mt-1 text-xl font-black text-foreground">Share graphics</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Configure the optional Edition design used for official jury-vote share cards. This editor changes branding only. It has no authority to read, edit, publish or reconstruct jury results.
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <p className="text-sm font-bold text-foreground">Default</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Default Solaris design. Always available and not Organizer-editable.
            </p>
          </article>
          <article className="rounded-2xl border border-primary/35 bg-primary/5 p-4" aria-current="true">
            <p className="text-sm font-bold text-foreground">Edition</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Editable edition-specific artwork, scoreboard, header and footer treatment.
            </p>
          </article>
          <article className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <p className="text-sm font-bold text-foreground">Liquid Glass</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Solaris-level alternative. Available independently from this Edition configuration.
            </p>
          </article>
        </div>

        <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
          <legend className="sr-only">Edition jury share graphic configuration</legend>

          <details open className="rounded-2xl border border-border/60 bg-card p-4">
            <summary className="cursor-pointer text-sm font-bold text-foreground">Artwork composition</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={theme.artwork.enabled}
                  onChange={(event) => setArtwork({ enabled: event.target.checked })}
                  className="size-4"
                />
                Use edition artwork
              </label>

              <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
                Artwork asset
                <select
                  value={theme.artwork.assetId ?? ""}
                  onChange={(event) => setArtwork({ assetId: event.target.value || null })}
                  disabled={!theme.artwork.enabled}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Select edition artwork</option>
                  {artworkOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Placement
                <select
                  value={theme.artwork.placement}
                  onChange={(event) => setArtwork({ placement: event.target.value as JuryShareEditionTheme["artwork"]["placement"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="top">Top</option>
                  <option value="top_fade">Top + fade</option>
                  <option value="background">Background</option>
                  <option value="bottom">Bottom</option>
                  <option value="bottom_fade">Bottom + fade</option>
                  <option value="full">Full canvas</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Scale
                <select
                  value={theme.artwork.scale}
                  onChange={(event) => setArtwork({ scale: event.target.value as JuryShareEditionTheme["artwork"]["scale"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                </select>
              </label>

              {([
                ["Focal X", "focalX", theme.artwork.focalX, 0, 1, 0.01],
                ["Focal Y", "focalY", theme.artwork.focalY, 0, 1, 0.01],
                ["Opacity", "opacity", theme.artwork.opacity, 0, 1, 0.01],
                ["Scrim", "scrimStrength", theme.artwork.scrimStrength, 0, 1, 0.01],
              ] as const).map(([label, key, value, min, max, step]) => (
                <label key={key} className="grid gap-1 text-xs font-semibold text-muted-foreground">
                  <span className="flex justify-between gap-3"><span>{label}</span><span>{formatPercent(value)}</span></span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(event) => setArtwork({ [key]: numberFromInput(event.target.value, value) })}
                    className="min-h-11 w-full"
                  />
                </label>
              ))}

              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Blur · {theme.artwork.blurPx}px
                <input
                  type="range"
                  min={0}
                  max={48}
                  step={1}
                  value={theme.artwork.blurPx}
                  onChange={(event) => setArtwork({ blurPx: numberFromInput(event.target.value, theme.artwork.blurPx) })}
                  className="min-h-11 w-full"
                />
              </label>

              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Fade direction
                <select
                  value={theme.artwork.fadeDirection}
                  onChange={(event) => setArtwork({ fadeDirection: event.target.value as JuryShareEditionTheme["artwork"]["fadeDirection"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="none">None</option>
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                  <option value="radial">Radial</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Fade start · {formatPercent(theme.artwork.fadeStart)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={theme.artwork.fadeStart}
                  onChange={(event) => setArtwork({ fadeStart: numberFromInput(event.target.value, theme.artwork.fadeStart) })}
                  className="min-h-11 w-full"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Fade end · {formatPercent(theme.artwork.fadeEnd)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={theme.artwork.fadeEnd}
                  onChange={(event) => setArtwork({ fadeEnd: numberFromInput(event.target.value, theme.artwork.fadeEnd) })}
                  className="min-h-11 w-full"
                />
              </label>
            </div>
          </details>

          <details className="rounded-2xl border border-border/60 bg-card p-4">
            <summary className="cursor-pointer text-sm font-bold text-foreground">Scoreboard treatment</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={theme.scoreboard.inheritEditionScoreboard}
                  onChange={(event) => setScoreboard({ inheritEditionScoreboard: event.target.checked })}
                  className="size-4"
                />
                Inherit Edition scoreboard tokens
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                12-point treatment
                <select
                  value={theme.scoreboard.topScoreTreatment}
                  onChange={(event) => setScoreboard({ topScoreTreatment: event.target.value as JuryShareEditionTheme["scoreboard"]["topScoreTreatment"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="edition">Edition</option>
                  <option value="solaris_gold">Solaris gold</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Flag frame
                <select
                  value={theme.scoreboard.flagFrame}
                  onChange={(event) => setScoreboard({ flagFrame: event.target.value as JuryShareEditionTheme["scoreboard"]["flagFrame"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="edition">Edition</option>
                  <option value="soft">Soft frame</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Score typography
                <select
                  value={theme.scoreboard.scoreTypography}
                  onChange={(event) => setScoreboard({ scoreTypography: event.target.value as JuryShareEditionTheme["scoreboard"]["scoreTypography"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="edition">Edition</option>
                  <option value="solaris">Solaris</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Score format
                <select
                  value={theme.scoreboard.scoreFormat}
                  onChange={(event) => setScoreboard({ scoreFormat: event.target.value as JuryShareEditionTheme["scoreboard"]["scoreFormat"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="zero_padded">08 / 07 / 06</option>
                  <option value="plain">8 / 7 / 6</option>
                </select>
              </label>
            </div>
          </details>

          <details className="rounded-2xl border border-border/60 bg-card p-4">
            <summary className="cursor-pointer text-sm font-bold text-foreground">Header & footer</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={theme.header.useEditionLogo}
                  onChange={(event) => setHeader({ useEditionLogo: event.target.checked })}
                  className="size-4"
                />
                Use edition logo
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Header alignment
                <select
                  value={theme.header.alignment}
                  onChange={(event) => setHeader({ alignment: event.target.value as JuryShareEditionTheme["header"]["alignment"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Title treatment
                <select
                  value={theme.header.titleTreatment}
                  onChange={(event) => setHeader({ titleTreatment: event.target.value as JuryShareEditionTheme["header"]["titleTreatment"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="edition">Edition</option>
                  <option value="solaris">Solaris</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Source-country treatment
                <select
                  value={theme.footer.sourceCountryTreatment}
                  onChange={(event) => setFooter({ sourceCountryTreatment: event.target.value as JuryShareEditionTheme["footer"]["sourceCountryTreatment"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="edition">Edition</option>
                  <option value="solaris">Solaris</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                Footer background
                <select
                  value={theme.footer.backgroundTreatment}
                  onChange={(event) => setFooter({ backgroundTreatment: event.target.value as JuryShareEditionTheme["footer"]["backgroundTreatment"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="fade">Fade</option>
                  <option value="panel">Panel</option>
                  <option value="clear">Clear</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
                Edition motif
                <select
                  value={theme.footer.motifTreatment}
                  onChange={(event) => setFooter({ motifTreatment: event.target.value as JuryShareEditionTheme["footer"]["motifTreatment"] })}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="edition">Use edition motif where configured</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
          </details>
        </fieldset>

        <section className="rounded-2xl border border-border/60 bg-card p-4" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">Validation</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Drafts can be previewed while incomplete. Ready requires structural, asset, typography, layout, contrast and export evidence.
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ready ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>
              {ready ? "Ready checks pass" : `${readyValidation.errors.length} checks remaining`}
            </span>
          </div>

          {structuralValidation.errors.length ? (
            <ul className="mt-3 grid gap-1 text-xs text-destructive">
              {structuralValidation.errors.map((item) => <li key={item.code}>• {item.message}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-emerald-300">Structured configuration is valid for preview.</p>
          )}

          {readyValidation.errors.length ? (
            <details className="mt-3 rounded-xl border border-border/50 p-3">
              <summary className="cursor-pointer text-xs font-bold text-foreground">Ready gate details</summary>
              <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-muted-foreground">
                {readyValidation.errors.map((item) => <li key={item.code}>• {item.message}</li>)}
              </ul>
            </details>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || structuralValidation.status === "invalid" || !onRequestSaveDraft}
              onClick={() => onRequestSaveDraft?.(theme)}
              className="admin-action-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={disabled || !ready || !onRequestReady}
              onClick={() => onRequestReady?.(theme)}
              className="admin-action-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark Ready
            </button>
          </div>

          {!onRequestSaveDraft || !onRequestReady ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Persistence controls stay disabled until the System-owned exact-edition share-theme command contract is connected. Preview and validation remain safe and local.
            </p>
          ) : null}
        </section>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-5 xl:self-start">
        <JuryShareThemePreview
          editionLabel={editionLabel}
          sourceCountryLabel={sourceCountryLabel}
          theme={theme}
          artworkOptions={artworkOptions}
          editionLogoUrl={editionLogoUrl}
        />
      </aside>
    </section>
  );
}
