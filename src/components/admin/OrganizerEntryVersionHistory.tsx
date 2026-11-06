import { useEffect, useRef, useState } from "react";
import { ChevronDown, History, LoaderCircle } from "lucide-react";

import { AdminStatus } from "@/components/admin/AdminUI";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import {
  compareOrganizerEntryRevisions,
  hasEarlierOrganizerEntryVersions,
  parseOrganizerEntryRevisions,
  type OrganizerEntryRevision,
} from "@/lib/v3-organizer-entry-version-history";

type Props = {
  editionId: string;
  submissionId: string;
  entryId: string;
  targetType: "internal" | "national_final";
  currentVersionId: string | null;
};

function readableTime(value: string | null): string {
  if (!value) return "Time not recorded";
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : "Time not recorded";
}

export function OrganizerEntryVersionHistory({
  editionId,
  submissionId,
  entryId,
  targetType,
  currentVersionId,
}: Props) {
  const scope = `${editionId}:${submissionId}:${targetType}:${entryId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const requestGeneration = useRef(0);
  const inFlight = useRef(false);
  const [versions, setVersions] = useState<OrganizerEntryRevision[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beforeRevision, setBeforeRevision] = useState<number | null>(null);
  const [hasEarlier, setHasEarlier] = useState(false);

  useEffect(() => {
    requestGeneration.current += 1;
    inFlight.current = false;
    setLoaded(false);
    setVersions([]);
    setBeforeRevision(null);
    setHasEarlier(false);
    setError(null);
    setBusy(false);
    return () => { requestGeneration.current += 1; };
  }, [scope]);

  async function loadPage(older: boolean) {
    if (inFlight.current || (older && beforeRevision == null)) return;
    inFlight.current = true;
    const generation = ++requestGeneration.current;
    const requestedScope = scope;
    const cursor = older ? beforeRevision : null;
    const isCurrent = () =>
      generation === requestGeneration.current && activeScope.current === requestedScope;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await confirmationsSupabase.rpc(
        "v3_confirmation_entry_versions",
        {
          p_target_type: targetType,
          p_entry_id: entryId,
          p_before_revision: cursor,
        },
      );
      if (!isCurrent()) return;
      if (rpcError) throw rpcError;
      const page = parseOrganizerEntryRevisions(data, entryId, submissionId);
      if (cursor !== null && page.some((item) => item.revision >= cursor)) {
        throw new Error("Entry history pagination returned a stale or repeated revision.");
      }
      if (older) {
        setVersions((existing) => {
          const seen = new Set(existing.map((item) => item.id));
          return [...existing, ...page.filter((item) => !seen.has(item.id))];
        });
      } else {
        setVersions(page);
      }
      setBeforeRevision(page.length ? page[page.length - 1].revision : null);
      setHasEarlier(hasEarlierOrganizerEntryVersions(page));
      setLoaded(true);
    } catch (caught) {
      if (isCurrent()) {
        setError(caught instanceof Error ? caught.message : "Entry history could not be loaded.");
      }
    } finally {
      if (isCurrent()) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }

  return (
    <section className="rounded-xl border border-white/[0.09] bg-white/[0.025] p-3" aria-label="Immutable Entry revision history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" /> Immutable Entry revisions
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Compare the submitted artist, song and media metadata across canonical revisions.
            Full private source URLs are deliberately not shown.
          </p>
        </div>
        {!loaded ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadPage(false)}
            className="admin-action-secondary"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
            {busy ? "Loading history…" : error ? "Retry history" : "Load history"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200/25 bg-rose-200/[0.05] px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}

      {loaded && !versions.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No immutable Entry versions were returned for this selection.
        </p>
      ) : null}

      {loaded && versions.length > 0 ? (
        <div className="mt-3 space-y-3">
          {currentVersionId && !versions.some((item) => item.id === currentVersionId) ? (
            <p className="text-xs text-amber-100">
              The current Entry version was not found in the loaded history. Refresh the response
              before relying on its review status.
            </p>
          ) : null}
          <ol className="space-y-3">
            {versions.map((version, index) => {
              const prior = versions[index + 1];
              const changes = prior ? compareOrganizerEntryRevisions(version, prior) : null;
              const changed = changes?.filter((item) => item.changed) ?? [];
              const isCurrent = Boolean(currentVersionId && currentVersionId === version.id);
              return (
                <li key={version.id} className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Revision {version.revision}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {readableTime(version.recordedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isCurrent ? <AdminStatus tone="ready">Current content</AdminStatus> : null}
                      {version.source === "organizer_restore" ? (
                        <AdminStatus tone="attention">Restored snapshot</AdminStatus>
                      ) : null}
                      {!isCurrent && version.reviews.length ? (
                        <AdminStatus tone="neutral">Historical review</AdminStatus>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-2 text-xs">
                    {version.artist ?? "Unknown artist"} · {version.songTitle ?? "Unknown song"}
                  </p>
                  {version.credits.length ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {version.credits.length} displayed credit{version.credits.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  {changes ? (
                    <div className="mt-2 space-y-1 text-[11px]">
                      <p className="font-medium text-muted-foreground">
                        Compared with revision {prior.revision}
                      </p>
                      {changed.length ? (
                        <p><span className="font-semibold">Changed:</span> {changed.map((item) => item.label).join(", ")}</p>
                      ) : (
                        <p>No changes in the displayed fields. Other recorded evidence may differ.</p>
                      )}
                      {changes.some((item) => !item.changed) ? (
                        <p className="text-muted-foreground">
                          Unchanged: {changes.filter((item) => !item.changed).map((item) => item.label).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {hasEarlier && index === versions.length - 1
                        ? "Load earlier revisions to compare this version."
                        : "No earlier version available for comparison."}
                    </p>
                  )}
                  {version.reviews.length ? (
                    <div className="mt-2 space-y-1 border-t border-white/[0.07] pt-2 text-[11px]">
                      {version.reviews.map((review) => (
                        <p key={review.id}>
                          <span className="font-semibold">{review.decision}</span>
                          {" · "}{readableTime(review.reviewedAt)}
                          {review.reason ? ` · ${review.reason}` : ""}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {version.restoredFromSubmissionVersionId ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Created from an organizer-restored Confirmation snapshot. It still requires its own current-version review.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {hasEarlier ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadPage(true)}
              className="admin-action-secondary w-full"
            >
              {busy ? "Loading older revisions…" : "Load older revisions"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
