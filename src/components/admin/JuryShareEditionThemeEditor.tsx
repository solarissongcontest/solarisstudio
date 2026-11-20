import type { CSSProperties, ReactNode } from "react";

import {
  AdminCard,
  AdminCardHeader,
  AdminStatus,
  WorkspaceHeader,
} from "@/components/admin/AdminUI";
import {
  FormSection,
  ObjectPage,
  WorkspaceActionBar,
} from "@/components/admin/AdminWorkspacePrimitives";
import {
  ORGANIZER_JURY_SHARE_SAMPLE_ROWS,
  organizerJuryShareStateLabel,
  validateOrganizerJuryShareComposition,
  type JuryShareArtworkPlacement,
  type JuryShareFadeDirection,
  type OrganizerJuryShareComposition,
  type OrganizerJuryShareThemeState,
  type OrganizerJuryShareValidation,
} from "@/lib/v3-organizer-jury-share-theme";

export type JuryShareEditionThemeEditorProps = {
  editionLabel: string;
  composition: OrganizerJuryShareComposition;
  state: OrganizerJuryShareThemeState;
  version: number;
  artworkUrl?: string | null;
  accentColor?: string;
  backgroundColor?: string;
  serverValidation?: OrganizerJuryShareValidation | null;
  canManage?: boolean;
  busy?: boolean;
  onChange: (next: OrganizerJuryShareComposition) => void;
  onSaveDraft?: () => void | Promise<void>;
  onRequestReady?: () => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
};

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none transition focus:border-sky-200/30 disabled:cursor-not-allowed disabled:opacity-50";

const checkboxClass =
  "size-4 rounded border-white/[0.16] bg-white/[0.04] text-sky-300 focus:ring-sky-200/30";

function FieldLabel({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {hint ? <span className="ml-1 text-[11px] text-muted-foreground">{hint}</span> : null}
      {children}
    </label>
  );
}

function ThemeSummary({
  title,
  description,
  status,
  active = false,
}: {
  title: string;
  description: string;
  status: string;
  active?: boolean;
}) {
  return (
    <AdminCard className={active ? "border-sky-300/20 bg-sky-300/[0.045]" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <AdminStatus tone={active ? "info" : "neutral"}>{status}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function ValidationList({ validation }: { validation: OrganizerJuryShareValidation }) {
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200/10 bg-emerald-200/[0.035] p-3 text-xs text-muted-foreground">
        No local editor issues. The authoritative System validator still decides whether this version may become Ready.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {validation.errors.length > 0 ? (
        <div className="rounded-xl border border-rose-200/12 bg-rose-200/[0.04] p-3">
          <p className="text-xs font-semibold text-rose-100">Fix before Ready</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {validation.errors.map((item) => (
              <li key={`${item.code}:${item.path ?? "root"}`}>• {item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {validation.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200/12 bg-amber-200/[0.035] p-3">
          <p className="text-xs font-semibold text-amber-100">Review</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {validation.warnings.map((item) => (
              <li key={`${item.code}:${item.path ?? "root"}`}>• {item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function JuryShareSamplePreview({
  editionLabel,
  composition,
  artworkUrl,
  accentColor = "#5b8fd9",
  backgroundColor = "#07152f",
}: {
  editionLabel: string;
  composition: OrganizerJuryShareComposition;
  artworkUrl?: string | null;
  accentColor?: string;
  backgroundColor?: string;
}) {
  const art = composition.artwork;
  const previewStyle: CSSProperties = {
    background: `linear-gradient(180deg, ${backgroundColor}, #061023)`,
  };

  return (
    <div className="mx-auto w-full max-w-[310px]">
      <div
        className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-white/[0.1] shadow-2xl shadow-black/25"
        style={previewStyle}
        aria-label={`Sample 9:16 Jury Share preview for ${editionLabel}`}
      >
        {art && artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            className="absolute inset-0 size-full"
            style={{
              objectFit: art.scale,
              objectPosition: `${art.focalX * 100}% ${art.focalY * 100}%`,
              opacity: art.opacity,
              filter: `blur(${art.blurPx}px)`,
            }}
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{ background: `rgba(3, 10, 24, ${art?.scrimStrength ?? composition.background.strength * 0.35})` }}
        />
        {art && art.fadeDirection !== "none" ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                art.fadeDirection === "radial"
                  ? `radial-gradient(circle at center, transparent ${art.fadeStart * 100}%, ${backgroundColor} ${art.fadeEnd * 100}%)`
                  : `linear-gradient(${art.fadeDirection === "up" ? "0deg" : "180deg"}, transparent ${art.fadeStart * 100}%, ${backgroundColor} ${art.fadeEnd * 100}%)`,
            }}
          />
        ) : null}

        <div className="relative z-10 flex h-full flex-col px-[7%] pb-[8%] pt-[8%]">
          <div className={composition.header.alignment === "center" ? "text-center" : "text-left"}>
            {composition.header.showSolarisMark ? (
              <p className="text-[9px] font-black tracking-[0.28em] text-white/80">SOLARIS</p>
            ) : null}
            {composition.header.showEditionLabel ? (
              <p className="mt-1 text-[13px] font-black leading-tight text-white">{editionLabel}</p>
            ) : null}
            {composition.header.showShowLabel ? (
              <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/60">Grand Final · sample data</p>
            ) : null}
          </div>

          <div className="mt-auto space-y-[3px]">
            {ORGANIZER_JURY_SHARE_SAMPLE_ROWS.map((row) => {
              const twelve = row.points === 12;
              return (
                <div
                  key={row.points}
                  className="flex items-center gap-2 px-2.5 text-[8px] font-bold"
                  style={{
                    height: `${Math.max(19, Math.min(28, composition.scoreboard.rowHeight / 4))}px`,
                    borderRadius: `${Math.max(5, composition.scoreboard.rowRadius / 4)}px`,
                    background: twelve && composition.scoreboard.emphasizeTwelvePoints ? "#f0d596" : `${accentColor}cc`,
                    color: twelve && composition.scoreboard.emphasizeTwelvePoints ? "#13213b" : "white",
                  }}
                >
                  <span
                    className={composition.scoreboard.flagTreatment === "framed" ? "rounded border border-current/20 px-1 py-0.5" : undefined}
                    aria-hidden="true"
                  >
                    ◧
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.country}</span>
                  <span
                    className={composition.scoreboard.scoreTreatment === "capsule" ? "rounded-full bg-black/10 px-1.5 py-0.5" : undefined}
                  >
                    {String(row.points).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={composition.footer.alignment === "center" ? "mt-4 text-center" : "mt-4 text-left"}>
            {composition.footer.showVotesOfLabel ? (
              <p className="text-[7px] font-bold tracking-[0.16em] text-white/60">VOTES OF:</p>
            ) : null}
            <p className="mt-0.5 text-[12px] font-black text-white">SAMPLE COUNTRY</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        Preview uses fixed sample countries only. Hidden jury votes are never required for branding work.
      </p>
    </div>
  );
}

export function JuryShareEditionThemeEditor({
  editionLabel,
  composition,
  state,
  version,
  artworkUrl,
  accentColor,
  backgroundColor,
  serverValidation,
  canManage = false,
  busy = false,
  onChange,
  onSaveDraft,
  onRequestReady,
  onArchive,
}: JuryShareEditionThemeEditorProps) {
  const localValidation = validateOrganizerJuryShareComposition(composition);
  const effectiveValidation = serverValidation ?? localValidation;
  const disabled = busy || !canManage || state === "archived";

  const patchArtwork = (patch: Partial<NonNullable<OrganizerJuryShareComposition["artwork"]>>) => {
    if (!composition.artwork) return;
    onChange({ ...composition, artwork: { ...composition.artwork, ...patch } });
  };

  const patchScoreboard = (patch: Partial<OrganizerJuryShareComposition["scoreboard"]>) =>
    onChange({ ...composition, scoreboard: { ...composition.scoreboard, ...patch } });

  const patchHeader = (patch: Partial<OrganizerJuryShareComposition["header"]>) =>
    onChange({ ...composition, header: { ...composition.header, ...patch } });

  const patchFooter = (patch: Partial<OrganizerJuryShareComposition["footer"]>) =>
    onChange({ ...composition, footer: { ...composition.footer, ...patch } });

  const patchSafeArea = (patch: Partial<OrganizerJuryShareComposition["safeArea"]>) =>
    onChange({ ...composition, safeArea: { ...composition.safeArea, ...patch } });

  return (
    <ObjectPage>
      <WorkspaceHeader
        eyebrow={editionLabel}
        title="Share graphics"
        description="Configure the optional Edition design used for jury share cards. Default and Liquid Glass remain Solaris-owned themes."
        actions={<AdminStatus tone={state === "ready" ? "ready" : state === "invalid" ? "blocked" : "neutral"}>{organizerJuryShareStateLabel(state)} · v{version}</AdminStatus>}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <ThemeSummary
          title="Default"
          description="Permanent Solaris jury-card identity. Organizer configuration cannot change it."
          status="Always available"
        />
        <ThemeSummary
          title="Edition"
          description="Versioned composition using this edition's visual identity and structured tokens."
          status={organizerJuryShareStateLabel(state)}
          active
        />
        <ThemeSummary
          title="Liquid Glass"
          description="Universal Solaris alternative rendered by the shared Jury Share renderer."
          status="Solaris-managed"
        />
      </div>

      {!canManage ? (
        <AdminCard>
          <p className="text-sm font-semibold text-foreground">Read-only access</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Viewing this edition theme does not grant branding modification. Editing requires the dedicated edition share-theme capability.
          </p>
        </AdminCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <FormSection
            eyebrow="Edition design"
            title="Artwork composition"
            description="Controls produce a bounded composition recipe. There is deliberately no Custom CSS, Custom HTML or Custom JavaScript escape hatch."
          >
            {composition.artwork ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label="Placement">
                  <select
                    className={fieldClass}
                    disabled={disabled}
                    value={composition.artwork.placement}
                    onChange={(event) => patchArtwork({ placement: event.target.value as JuryShareArtworkPlacement })}
                  >
                    <option value="top">Top</option>
                    <option value="top_fade">Top + fade</option>
                    <option value="background">Background</option>
                    <option value="bottom">Bottom</option>
                    <option value="bottom_fade">Bottom + fade</option>
                    <option value="full">Full canvas</option>
                  </select>
                </FieldLabel>
                <FieldLabel label="Scale">
                  <select
                    className={fieldClass}
                    disabled={disabled}
                    value={composition.artwork.scale}
                    onChange={(event) => patchArtwork({ scale: event.target.value as "cover" | "contain" })}
                  >
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                  </select>
                </FieldLabel>
                <FieldLabel label="Horizontal focal point" hint={`${Math.round(composition.artwork.focalX * 100)}%`}>
                  <input className="mt-2 w-full" type="range" min="0" max="1" step="0.01" disabled={disabled} value={composition.artwork.focalX} onChange={(event) => patchArtwork({ focalX: Number(event.target.value) })} />
                </FieldLabel>
                <FieldLabel label="Vertical focal point" hint={`${Math.round(composition.artwork.focalY * 100)}%`}>
                  <input className="mt-2 w-full" type="range" min="0" max="1" step="0.01" disabled={disabled} value={composition.artwork.focalY} onChange={(event) => patchArtwork({ focalY: Number(event.target.value) })} />
                </FieldLabel>
                <FieldLabel label="Opacity" hint={`${Math.round(composition.artwork.opacity * 100)}%`}>
                  <input className="mt-2 w-full" type="range" min="0" max="1" step="0.01" disabled={disabled} value={composition.artwork.opacity} onChange={(event) => patchArtwork({ opacity: Number(event.target.value) })} />
                </FieldLabel>
                <FieldLabel label="Blur" hint={`${composition.artwork.blurPx}px`}>
                  <input className="mt-2 w-full" type="range" min="0" max="40" step="1" disabled={disabled} value={composition.artwork.blurPx} onChange={(event) => patchArtwork({ blurPx: Number(event.target.value) })} />
                </FieldLabel>
                <FieldLabel label="Fade direction">
                  <select className={fieldClass} disabled={disabled} value={composition.artwork.fadeDirection} onChange={(event) => patchArtwork({ fadeDirection: event.target.value as JuryShareFadeDirection })}>
                    <option value="none">None</option>
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="radial">Radial</option>
                  </select>
                </FieldLabel>
                <FieldLabel label="Scrim strength" hint={`${Math.round(composition.artwork.scrimStrength * 100)}%`}>
                  <input className="mt-2 w-full" type="range" min="0" max="1" step="0.01" disabled={disabled} value={composition.artwork.scrimStrength} onChange={(event) => patchArtwork({ scrimStrength: Number(event.target.value) })} />
                </FieldLabel>
                <FieldLabel label="Fade start" hint={`${Math.round(composition.artwork.fadeStart * 100)}%`}>
                  <input className="mt-2 w-full" type="range" min="0" max="1" step="0.01" disabled={disabled || composition.artwork.fadeDirection === "none"} value={composition.artwork.fadeStart} onChange={(event) => patchArtwork({ fadeStart: Number(event.target.value) })} />
                </FieldLabel>
                <FieldLabel label="Fade end" hint={`${Math.round(composition.artwork.fadeEnd * 100)}%`}>
                  <input className="mt-2 w-full" type="range" min="0" max="1" step="0.01" disabled={disabled || composition.artwork.fadeDirection === "none"} value={composition.artwork.fadeEnd} onChange={(event) => patchArtwork({ fadeEnd: Number(event.target.value) })} />
                </FieldLabel>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/[0.1] p-4 text-xs leading-relaxed text-muted-foreground">
                No edition artwork asset is attached to this recipe. Add/select artwork in the canonical Edition branding workspace first; this editor stores only its asset identity, never an arbitrary remote URL.
              </div>
            )}
          </FormSection>

          <FormSection
            eyebrow="Scoreboard"
            title="Score rows"
            description="Edition styling is inherited by default. Only a bounded visual subset may be overridden for the Story composition."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm">
                <input className={checkboxClass} type="checkbox" disabled={disabled} checked={composition.scoreboard.inheritEditionScoreboard} onChange={(event) => patchScoreboard({ inheritEditionScoreboard: event.target.checked })} />
                Inherit edition scoreboard
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm">
                <input className={checkboxClass} type="checkbox" disabled={disabled} checked={composition.scoreboard.emphasizeTwelvePoints} onChange={(event) => patchScoreboard({ emphasizeTwelvePoints: event.target.checked })} />
                Emphasize 12 points
              </label>
              <FieldLabel label="Row radius" hint={`${composition.scoreboard.rowRadius}px`}>
                <input className="mt-2 w-full" type="range" min="0" max="80" step="1" disabled={disabled} value={composition.scoreboard.rowRadius} onChange={(event) => patchScoreboard({ rowRadius: Number(event.target.value) })} />
              </FieldLabel>
              <FieldLabel label="Row height" hint={`${composition.scoreboard.rowHeight}px`}>
                <input className="mt-2 w-full" type="range" min="64" max="132" step="1" disabled={disabled} value={composition.scoreboard.rowHeight} onChange={(event) => patchScoreboard({ rowHeight: Number(event.target.value) })} />
              </FieldLabel>
              <FieldLabel label="Flag treatment">
                <select className={fieldClass} disabled={disabled} value={composition.scoreboard.flagTreatment} onChange={(event) => patchScoreboard({ flagTreatment: event.target.value as "plain" | "framed" })}>
                  <option value="plain">Plain</option>
                  <option value="framed">Framed</option>
                </select>
              </FieldLabel>
              <FieldLabel label="Score treatment">
                <select className={fieldClass} disabled={disabled} value={composition.scoreboard.scoreTreatment} onChange={(event) => patchScoreboard({ scoreTreatment: event.target.value as "plain" | "capsule" })}>
                  <option value="plain">Plain</option>
                  <option value="capsule">Capsule</option>
                </select>
              </FieldLabel>
            </div>
          </FormSection>

          <FormSection eyebrow="Composition" title="Header, footer and safe area">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm">
                <input className={checkboxClass} type="checkbox" disabled={disabled} checked={composition.header.showSolarisMark} onChange={(event) => patchHeader({ showSolarisMark: event.target.checked })} />
                Show Solaris mark
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm">
                <input className={checkboxClass} type="checkbox" disabled={disabled} checked={composition.header.showShowLabel} onChange={(event) => patchHeader({ showShowLabel: event.target.checked })} />
                Show show label
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm">
                <input className={checkboxClass} type="checkbox" disabled={disabled} checked={composition.footer.showVotesOfLabel} onChange={(event) => patchFooter({ showVotesOfLabel: event.target.checked })} />
                Show “VOTES OF”
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm">
                <input className={checkboxClass} type="checkbox" disabled={disabled} checked={composition.footer.showSourceFlag} onChange={(event) => patchFooter({ showSourceFlag: event.target.checked })} />
                Reserve source-flag treatment
              </label>
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <FieldLabel key={side} label={`${side[0].toUpperCase()}${side.slice(1)} safe area`} hint="px">
                  <input className={fieldClass} type="number" min="0" disabled={disabled} value={composition.safeArea[side]} onChange={(event) => patchSafeArea({ [side]: Number(event.target.value) })} />
                </FieldLabel>
              ))}
            </div>
          </FormSection>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Preview" title="9:16 Story" description="The preview and final renderer should consume the same structured composition model." />
            <JuryShareSamplePreview editionLabel={editionLabel} composition={composition} artworkUrl={artworkUrl} accentColor={accentColor} backgroundColor={backgroundColor} />
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Validation" title={effectiveValidation.valid ? "Ready for server validation" : "Needs attention"} description={serverValidation ? "Showing the latest authoritative validation returned by System." : "Showing immediate local editor feedback. System remains authoritative."} />
            <ValidationList validation={effectiveValidation} />
          </AdminCard>
        </div>
      </div>

      {canManage && state !== "archived" ? (
        <WorkspaceActionBar>
          {state === "ready" && onArchive ? (
            <button type="button" className="admin-action-secondary" disabled={busy} onClick={() => void onArchive()}>
              Archive version
            </button>
          ) : null}
          {onSaveDraft ? (
            <button type="button" className="admin-action-secondary" disabled={busy} onClick={() => void onSaveDraft()}>
              {busy ? "Working…" : "Save draft"}
            </button>
          ) : null}
          {state !== "ready" && onRequestReady ? (
            <button type="button" className="admin-action-primary" disabled={busy || !localValidation.valid} onClick={() => void onRequestReady()}>
              Validate & mark Ready
            </button>
          ) : null}
        </WorkspaceActionBar>
      ) : null}
    </ObjectPage>
  );
}
