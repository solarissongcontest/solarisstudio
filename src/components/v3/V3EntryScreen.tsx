import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  PencilLine,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import type {
  V3EntryCandidate,
  V3EntryProjection,
  V3EntryVersionEvidence,
} from "@/lib/v3-entry";
import { cn } from "@/lib/utils";
import { V3Screen, V3ScreenHeader, V3Section, V3Surface } from "./V3Foundation";

function reviewLabel(candidate: V3EntryCandidate) {
  if (candidate.reviewStatus === "accepted" && candidate.reviewMatchesCurrentVersion) {
    return "Current version accepted";
  }
  if (candidate.reviewStatus === "accepted") return "Older version accepted · review current version";
  if (candidate.reviewStatus === "declined") return "Changes required";
  if (candidate.reviewStatus === "removed") return "Removed by organizer";
  if (candidate.currentVersionId) return "Waiting for organizer review";
  return "Legacy review evidence";
}

function reviewTone(candidate: V3EntryCandidate) {
  if (candidate.reviewStatus === "accepted" && candidate.reviewMatchesCurrentVersion) return "text-emerald-300";
  if (candidate.reviewStatus === "declined" || candidate.reviewStatus === "removed") return "text-[var(--v3-danger)]";
  return "text-amber-200";
}

function CandidateCard({ candidate, winner }: { candidate: V3EntryCandidate; winner?: boolean }) {
  return (
    <V3Surface className="p-4" data-v3-entry-candidate={candidate.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {candidate.songTitle ?? "Song not supplied"}
          </p>
          <p className="mt-1 truncate text-sm text-[var(--v3-text-secondary)]">
            {candidate.artist ?? "Artist not supplied"}
          </p>
        </div>
        {winner ? (
          <span className="shrink-0 rounded-full border border-emerald-400/30 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
            Selected
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={cn("font-semibold", reviewTone(candidate))}>{reviewLabel(candidate)}</span>
        {candidate.contentRevision != null ? (
          <span className="text-[var(--v3-text-tertiary)]">Revision {candidate.contentRevision}</span>
        ) : null}
      </div>
      {candidate.reviewReason ? (
        <p className="mt-3 text-sm leading-6 text-[var(--v3-text-secondary)]">
          {candidate.reviewReason}
        </p>
      ) : null}
    </V3Surface>
  );
}

function versionSource(version: V3EntryVersionEvidence) {
  if (version.source === "organizer_restore") return "Restored historical content";
  if (version.source === "legacy_observation") return "Legacy observation";
  return "Submitted content";
}

function statusIcon(level: string) {
  if (level === "pass") return CheckCircle2;
  if (level === "blocked") return AlertTriangle;
  return Clock3;
}

export function V3EntryScreen({
  projection,
  focusReadiness = false,
}: {
  projection: V3EntryProjection;
  focusReadiness?: boolean;
}) {
  if (projection.state === "no-edition") {
    return (
      <V3Screen>
        <V3ScreenHeader
          kicker="Participate · Entry"
          title="Your entry"
          description="There is no current public edition to manage yet."
        />
        <V3Surface className="p-5">
          <p className="text-sm leading-6 text-[var(--v3-text-secondary)]">
            Entry tools will appear when a current edition is available.
          </p>
        </V3Surface>
      </V3Screen>
    );
  }

  if (projection.state === "no-delegation") {
    return (
      <V3Screen>
        <V3ScreenHeader
          kicker="Participate · Entry"
          title="Your entry"
          description={projection.edition?.label ?? "Current edition"}
        />
        <V3Surface className="p-5" data-v3-entry-state="no-delegation">
          <h2 className="font-semibold">Choose your delegation first</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">
            Solaris needs an active country account before it can show private entry readiness or review evidence.
          </p>
          <Link
            to={"/my-solaris/country" as any}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
          >
            Set up delegation
          </Link>
        </V3Surface>
      </V3Screen>
    );
  }

  const confirmation = projection.confirmation;
  const internalEntry = confirmation?.internalEntry ?? null;
  const nationalFinal = confirmation?.nationalFinal ?? null;
  const sameRouteActions = projection.readiness.actions.filter(
    (action) => action.href !== "/my-solaris/entry",
  );

  return (
    <V3Screen>
      <div data-v3-entry-root="" data-v3-entry-state="ready">
        <V3ScreenHeader
          kicker="Participate · Entry"
          title="Your entry"
          description={`${projection.delegation?.name ?? "Your delegation"} · ${projection.edition?.label ?? "Current edition"}`}
        />

        <V3Section title="Current selection">
          {confirmation ? (
            <V3Surface className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--v3-text-tertiary)]">
                    Selection method
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {confirmation.selectionMethod === "national_final"
                      ? "National final"
                      : confirmation.selectionMethod === "internal"
                        ? "Internal selection"
                        : "Entry confirmation"}
                  </h2>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    confirmation.canEdit
                      ? "border-emerald-400/30 text-emerald-300"
                      : "border-[var(--v3-border)] text-[var(--v3-text-secondary)]",
                  )}
                >
                  {confirmation.canEdit ? "Editing available" : "Editing closed"}
                </span>
              </div>

              <Link
                to="/confirmations"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
              >
                <PencilLine className="size-4" aria-hidden="true" />
                {confirmation.canEdit ? "Manage confirmation" : "Open confirmation record"}
              </Link>
              {!confirmation.canEdit && confirmation.editReason ? (
                <p className="mt-3 text-xs text-[var(--v3-text-tertiary)]">
                  {confirmation.editReason === "locked"
                    ? "This response is locked."
                    : "Editing is not currently open for this response."}
                </p>
              ) : null}
            </V3Surface>
          ) : (
            <V3Surface className="p-5">
              <h2 className="font-semibold">No current confirmation response</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">
                Start from Confirmation. Entry review and readiness will appear here from the same canonical response.
              </p>
              <Link
                to="/confirmations"
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
              >
                Open Confirmation
              </Link>
            </V3Surface>
          )}

          {internalEntry ? <CandidateCard candidate={internalEntry} /> : null}
          {nationalFinal ? (
            <div className="grid gap-3" data-v3-entry-national-final="">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--v3-text-tertiary)]">
                    National final
                  </p>
                  <p className="mt-1 font-semibold">{nationalFinal.name ?? "Candidates"}</p>
                </div>
                <span className="text-xs text-[var(--v3-text-tertiary)]">
                  {nationalFinal.entries.length} candidate{nationalFinal.entries.length === 1 ? "" : "s"}
                </span>
              </div>
              {nationalFinal.entries.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  winner={candidate.id === nationalFinal.winnerEntryId}
                />
              ))}
            </div>
          ) : null}
        </V3Section>

        <V3Section title="Entry readiness">
          <div
            id="entry-readiness"
            tabIndex={focusReadiness ? -1 : undefined}
            data-v3-entry-readiness=""
          >
            <V3Surface className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--v3-text-tertiary)]">
                    Operational readiness
                  </p>
                  <p className="mt-1 text-3xl font-black tabular-nums">
                    {projection.readiness.score == null ? "—" : `${projection.readiness.score}%`}
                  </p>
                </div>
                {projection.readiness.state ? (
                  <span className="text-right text-sm font-semibold capitalize text-[var(--v3-text-secondary)]">
                    {projection.readiness.state.replaceAll("_", " ")}
                  </span>
                ) : null}
              </div>
            </V3Surface>

            <div className="mt-3 grid gap-2">
              {projection.readiness.checks.map((check) => {
                const Icon = statusIcon(check.level);
                return (
                  <div
                    key={check.id}
                    className="flex gap-3 rounded-xl border border-[var(--v3-border-subtle)] p-3"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{check.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                        {check.message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {sameRouteActions.length ? (
              <nav className="mt-3 grid gap-2" aria-label="Entry readiness actions">
                {sameRouteActions.map((action) => (
                  <Link
                    key={action.id}
                    to={action.href as any}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--v3-border)] px-4 text-sm font-semibold"
                  >
                    <span>{action.label}</span>
                    <span className="text-xs capitalize text-[var(--v3-text-tertiary)]">{action.priority}</span>
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </V3Section>

        {projection.versionHistory.length ? (
          <V3Section title="Version history">
            <V3Surface className="overflow-hidden" data-v3-entry-version-history="">
              {projection.versionHistory.map((version, index) => (
                <div
                  key={version.id}
                  className={cn("p-4", index > 0 && "border-t border-[var(--v3-border-subtle)]")}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-[var(--v3-border)]">
                      {version.source === "organizer_restore" ? (
                        <RotateCcw className="size-4" aria-hidden="true" />
                      ) : version.reviews.length ? (
                        <ShieldCheck className="size-4" aria-hidden="true" />
                      ) : (
                        <History className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">Revision {version.revision}</p>
                        <span className="text-xs text-[var(--v3-text-tertiary)]">
                          {versionSource(version)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-[var(--v3-text-secondary)]">
                        {[version.artist, version.songTitle].filter(Boolean).join(" · ") || "Entry details"}
                      </p>
                      {version.source === "organizer_restore" ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--v3-text-tertiary)]">
                          Historical content was restored as a new immutable version. Previous approval was not reused.
                        </p>
                      ) : null}
                      {version.reviews.map((review, reviewIndex) => (
                        <p key={`${version.id}-${reviewIndex}`} className="mt-2 text-xs leading-5">
                          <span className="font-semibold capitalize">{review.decision}</span>
                          {review.reason ? ` · ${review.reason}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </V3Surface>
            <p className="px-1 text-xs leading-5 text-[var(--v3-text-tertiary)]">
              Version history is immutable review evidence. Submission receipts remain owned by Confirmation.
            </p>
          </V3Section>
        ) : null}
      </div>
    </V3Screen>
  );
}
