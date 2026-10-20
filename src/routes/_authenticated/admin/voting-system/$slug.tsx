import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Calculator, RefreshCw, Save, ShieldAlert, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { VotingEditor } from "@/components/studio/VotingEditor";
import { editionLabel, useEdition, useShows } from "@/lib/data";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { toSystemError } from "@/lib/system-error";
import { reconcileSystemOperation } from "@/lib/system-operation.functions";
import {
  applyOrganizerVotingConfigChange,
  fetchOrganizerVotingConfigSnapshot,
  mergeVotingConfigWithCompatibilityMetadata,
  parseOrganizerVotingConfigApplyResult,
  preflightOrganizerVotingConfigChange,
  votingEvidenceCount,
  type OrganizerVotingConfigPreflight,
  type OrganizerVotingConfigSnapshot,
} from "@/lib/v3-organizer-voting-config-authority";
import { resolveVoting, type VotingConfig } from "@/lib/voting";

type VotingSearch = { show?: string };

type PendingSave = {
  showId: string;
  showName: string;
  config: Record<string, unknown>;
  expectedVersion: number;
  preflight: OrganizerVotingConfigPreflight;
};

type VotingConfigReceipt = {
  operationId: string;
  version: number;
  replayed: boolean;
};

export const Route = createFileRoute("/_authenticated/admin/voting-system/$slug")({
  head: () => ({
    meta: [
      { title: "Voting system — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): VotingSearch => ({
    show: typeof search.show === "string" ? search.show : undefined,
  }),
  component: VotingSystemWorkspace,
});

function evidenceText(snapshot: OrganizerVotingConfigSnapshot | null) {
  if (!snapshot) return null;
  const evidence = snapshot.evidence;
  const juryWindow =
    typeof evidence.juryWindowStatus === "string" ? evidence.juryWindowStatus : "unknown";
  const juryRows = votingEvidenceCount(evidence, "juryScoreRows");
  const juryBallots = votingEvidenceCount(evidence, "juryBallotSubmissions");
  const televoteRows = votingEvidenceCount(evidence, "televoteRows");
  const publicRows = votingEvidenceCount(evidence, "televoteContributionRows");
  const resultVersion = votingEvidenceCount(evidence, "resultCalculationVersion");

  if (
    juryWindow === "not_started" &&
    juryRows === 0 &&
    juryBallots === 0 &&
    televoteRows === 0 &&
    publicRows === 0 &&
    resultVersion === 0
  ) {
    return null;
  }

  return `Canonical evidence: Jury ${juryWindow}; ${juryRows} jury score rows; ${juryBallots} submitted jury ballots; ${televoteRows + publicRows} public-vote rows; result calculation v${resultVersion}.`;
}

function VotingSystemWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const reconcileOperation = useServerFn(reconcileSystemOperation);
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const orderedShows = useMemo(
    () => [...shows].filter((show) => show.edition_id === edition?.id).sort((a, b) => a.sort_order - b.sort_order),
    [shows, edition?.id],
  );
  const searchedShow = search.show
    ? orderedShows.find((show) => show.id === search.show) ?? null
    : null;
  const staleShowSelection = Boolean(search.show && !searchedShow);
  const selectedShow = staleShowSelection ? null : searchedShow ?? orderedShows[0] ?? null;

  const [snapshot, setSnapshot] = useState<OrganizerVotingConfigSnapshot | null>(null);
  const [authorityLoading, setAuthorityLoading] = useState(false);
  const [authorityError, setAuthorityError] = useState<string | null>(null);
  const saved = useMemo(() => resolveVoting(snapshot?.config ?? null), [snapshot]);
  const [draft, setDraft] = useState<VotingConfig>(saved);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [receipt, setReceipt] = useState<VotingConfigReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  const exactEditionReady = Boolean(
    edition && organizerEditionId && organizerEditionId === edition.id,
  );

  useEffect(() => {
    setDraft(saved);
    setPendingSave(null);
  }, [saved, selectedShow?.id]);

  useEffect(() => {
    setReceipt(null);
  }, [selectedShow?.id, edition?.id]);

  useEffect(() => {
    if (!edition || !selectedShow || organizerEditionId !== edition.id) {
      setSnapshot(null);
      setAuthorityError(null);
      setAuthorityLoading(false);
      return;
    }

    let cancelled = false;
    setSnapshot(null);
    setAuthorityError(null);
    setAuthorityLoading(true);
    void fetchOrganizerVotingConfigSnapshot({ editionId: edition.id, showId: selectedShow.id })
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
      })
      .catch((caught) => {
        if (cancelled) return;
        setAuthorityError(toSystemError(caught).message);
      })
      .finally(() => {
        if (!cancelled) setAuthorityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [edition, organizerEditionId, selectedShow]);

  const dirty = snapshot ? JSON.stringify(draft) !== JSON.stringify(saved) : false;
  const totalWeight = draft.weighting.jury + draft.weighting.televote;
  const invalidWeight = totalWeight !== 100;
  const evidenceWarning = evidenceText(snapshot);
  const saveDisabled =
    !dirty ||
    busy ||
    authorityLoading ||
    !snapshot ||
    Boolean(authorityError) ||
    invalidWeight ||
    !exactEditionReady;

  async function reloadAuthority() {
    if (!edition || !selectedShow || organizerEditionId !== edition.id) {
      throw new Error("Organizer edition context changed. Reload the selected edition before continuing.");
    }
    const nextSnapshot = await fetchOrganizerVotingConfigSnapshot({
      editionId: edition.id,
      showId: selectedShow.id,
    });
    setSnapshot(nextSnapshot);
    setDraft(resolveVoting(nextSnapshot.config));
    setAuthorityError(null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["show"] }),
      qc.invalidateQueries({ queryKey: ["results"] }),
    ]);
    return nextSnapshot;
  }

  async function requestSave() {
    if (!edition || !selectedShow || !snapshot || !dirty || busy) return;
    if (organizerEditionId !== edition.id) {
      setAuthorityError("Organizer edition context changed. Nothing was saved.");
      return;
    }
    if (invalidWeight) {
      toast.error("Jury and public weights must total 100% before saving.");
      return;
    }

    setBusy(true);
    setAuthorityError(null);
    try {
      const proposedConfig = mergeVotingConfigWithCompatibilityMetadata(snapshot.config, draft);
      const preflight = await preflightOrganizerVotingConfigChange({
        editionId: edition.id,
        showId: selectedShow.id,
        config: proposedConfig,
      });

      if (preflight.expectedVersion !== snapshot.version) {
        await reloadAuthority();
        throw new Error("Voting rules changed while you were editing. The current version has been reloaded; review your change again.");
      }
      if (!preflight.changed) {
        setDraft(resolveVoting(snapshot.config));
        toast.info("The reviewed rules already match the canonical configuration.");
        return;
      }
      if (preflight.blocked || preflight.riskClass === "blocked") {
        await reloadAuthority();
        throw new Error(
          "Voting configuration is frozen because official voting or result evidence now exists. No rule change was applied.",
        );
      }
      if (preflight.riskClass !== "R2") {
        throw new Error("Voting configuration preflight returned an unexpected risk class.");
      }

      setPendingSave({
        showId: selectedShow.id,
        showName: selectedShow.name,
        config: proposedConfig,
        expectedVersion: preflight.expectedVersion,
        preflight,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : toSystemError(caught).message;
      setAuthorityError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function recoverApply(operationId: string, editionId: string, showId: string) {
    const reconciliation = await reconcileOperation({ data: { operationId } });
    if (!reconciliation.ok) return null;
    if (reconciliation.receipt.status !== "succeeded") {
      throw new Error(
        reconciliation.receipt.error?.message ??
          "The voting-rule operation is still unresolved. Keep its operation ID and reconcile before retrying.",
      );
    }
    const result = parseOrganizerVotingConfigApplyResult(reconciliation.receipt.result);
    if (
      result.operationId !== operationId ||
      result.editionId !== editionId ||
      result.showId !== showId
    ) {
      throw new Error("Reconciled voting-rule receipt belongs to a different operation scope.");
    }
    return { ...result, replayed: true };
  }

  async function applyReviewedSave() {
    const review = pendingSave;
    if (!review || !edition || !selectedShow || busy) return;
    if (
      organizerEditionId !== edition.id ||
      review.showId !== selectedShow.id ||
      snapshot?.editionId !== edition.id ||
      snapshot.showId !== review.showId
    ) {
      setPendingSave(null);
      setAuthorityError("Organizer edition or show context changed while the review was open. Nothing was saved.");
      return;
    }

    setBusy(true);
    setAuthorityError(null);
    const command = createOrganisationCommand({
      command: "voting.config.update",
      riskClass: "R2",
      scope: { editionId: edition.id, showId: review.showId },
      payload: { config: review.config },
      expectedVersion: review.expectedVersion,
    });

    try {
      let result;
      try {
        result = await applyOrganizerVotingConfigChange({
          editionId: edition.id,
          showId: review.showId,
          config: review.config,
          reason: command.reason ?? null,
          operationId: command.operationId,
          idempotencyKey: command.idempotencyKey,
          expectedVersion: review.expectedVersion,
        });
      } catch (caught) {
        const systemError = toSystemError(caught);
        if (!systemError.retryable) throw caught;
        const recovered = await recoverApply(command.operationId, edition.id, review.showId);
        if (!recovered) throw caught;
        result = recovered;
      }

      setReceipt({
        operationId: result.operationId,
        version: result.version,
        replayed: result.replayed,
      });
      setPendingSave(null);
      await reloadAuthority();
      toast.success(
        result.replayed
          ? `${review.showName} voting rules confirmed from the operation ledger`
          : `${review.showName} voting rules saved as version ${result.version}`,
      );
    } catch (caught) {
      const systemError = toSystemError(caught);
      if (systemError.code === "STATE_CHANGED" || systemError.code === "VERSION_CONFLICT") {
        try {
          await reloadAuthority();
        } catch {
          // Keep the original conflict as the actionable message.
        }
      }
      setPendingSave(null);
      setAuthorityError(systemError.message);
      toast.error(systemError.message);
    } finally {
      setBusy(false);
    }
  }

  function resetDraft() {
    if (!snapshot) return;
    setDraft(resolveVoting(snapshot.config));
    setAuthorityError(null);
    toast.info("Unsaved voting changes discarded");
  }

  if (loadingEdition || loadingShows) {
    return (
      <AdminCard>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading voting system…</p>
      </AdminCard>
    );
  }

  if (!edition) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={Calculator}
          title="Edition not found"
          description="Choose another edition from the organizer workspace."
          action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>}
        />
      </AdminCard>
    );
  }

  if (!organizerEditionId || organizerEditionId !== edition.id) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Confirming edition context"
            description="Voting rules only open when the route edition matches the exact edition selected in Solaris Organizer. No newest-edition fallback is used."
            action={<Link to="/admin/control" className="admin-action-secondary">Back to Control</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (!orderedShows.length) {
    return (
      <AdminPage>
        <AdminPageHeader
          eyebrow={editionLabel(edition)}
          title="Voting system"
          description="Create a show before configuring how its result is calculated."
        />
        <AdminCard>
          <AdminEmptyState
            icon={Vote}
            title="No shows yet"
            description="Voting rules belong to an individual show."
            action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create show</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (staleShowSelection || !selectedShow) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Show context changed"
            description="The requested show does not belong to this Organizer edition. Solaris will not silently substitute another show."
            action={
              <button
                type="button"
                onClick={() => void navigate({ search: { show: undefined } })}
                className="admin-action-secondary"
              >
                Use this edition's first show
              </button>
            }
          />
        </AdminCard>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Voting system"
        description="Review and apply versioned pre-voting rules for one exact show. Official voting or result evidence freezes the configuration instead of silently recalculating published truth."
        actions={
          <button
            type="button"
            disabled={saveDisabled}
            onClick={() => void requestSave()}
            className="admin-action-primary"
          >
            <Save className="size-4" /> {busy ? "Checking…" : "Review rules"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet">
          <ArrowLeft className="size-4" /> Edition home
        </Link>
        <select
          value={selectedShow.id}
          onChange={(event) => void navigate({ search: { show: event.target.value || undefined } })}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
        >
          {orderedShows.map((show) => (
            <option key={show.id} value={show.id}>{show.name}</option>
          ))}
        </select>
      </div>

      {authorityLoading ? (
        <AdminCard className="mb-4">
          <p className="py-5 text-center text-sm text-muted-foreground">Loading authoritative voting configuration…</p>
        </AdminCard>
      ) : null}

      {authorityError ? (
        <div className="mb-4 rounded-xl border border-rose-200/20 bg-rose-200/[0.05] p-3 text-sm text-rose-100">
          <div className="flex items-start justify-between gap-3">
            <p>{authorityError}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reloadAuthority().catch((caught) => setAuthorityError(toSystemError(caught).message))}
              className="admin-action-quiet shrink-0"
            >
              <RefreshCw className="size-4" /> Reload
            </button>
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Metric label="Config version" value={snapshot.version} />
            <Metric label="Jury rows" value={votingEvidenceCount(snapshot.evidence, "juryScoreRows")} />
            <Metric
              label="Public rows"
              value={
                votingEvidenceCount(snapshot.evidence, "televoteRows") +
                votingEvidenceCount(snapshot.evidence, "televoteContributionRows")
              }
            />
          </div>

          <AdminCard strong className="mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="admin-section-label">Canonical calculation · v{snapshot.version}</p>
                <p className="mt-2 text-base font-bold text-foreground">
                  {snapshot.summary.jury} · {snapshot.summary.public}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {snapshot.summary.points} · {snapshot.summary.tieBreak} · {snapshot.summary.ownCountry}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {dirty ? <AdminStatus tone="attention">Unsaved draft</AdminStatus> : <AdminStatus tone="ready">Version {snapshot.version}</AdminStatus>}
                {snapshot.resultConfigVersion != null ? (
                  <AdminStatus tone="info">Result bound to v{snapshot.resultConfigVersion}</AdminStatus>
                ) : null}
              </div>
            </div>

            {invalidWeight ? (
              <p className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs text-amber-100">
                Jury and public weights total {totalWeight}%. The canonical rule contract requires exactly 100%, so review/save is blocked until this is corrected.
              </p>
            ) : null}
            {evidenceWarning ? (
              <p className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs text-amber-100">
                {evidenceWarning} A server preflight decides whether editing is still allowed; the browser does not override that decision.
              </p>
            ) : null}
          </AdminCard>

          {receipt ? (
            <AdminCard className="mb-4">
              <AdminCardHeader
                eyebrow="Operation receipt"
                title={`Voting configuration v${receipt.version}`}
                description={receipt.replayed ? "Confirmed from the canonical operation ledger after an uncertain response." : "The canonical versioned command completed successfully."}
                action={<AdminStatus tone="ready">Saved</AdminStatus>}
              />
              <p className="break-all font-mono text-[11px] text-muted-foreground">{receipt.operationId}</p>
            </AdminCard>
          ) : null}

          <AdminCard>
            <AdminCardHeader
              eyebrow={selectedShow.name}
              title="Calculation rules"
              description="Changes remain local until Review rules runs the server-authoritative consequence preflight."
            />
            <VotingEditor voting={draft} onChange={setDraft} />
            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                disabled={!dirty || busy}
                onClick={resetDraft}
                className="admin-action-secondary w-full"
              >
                Discard changes
              </button>
              <button
                type="button"
                disabled={saveDisabled}
                onClick={() => void requestSave()}
                className="admin-action-primary w-full"
              >
                <Save className="size-4" /> Review rules
              </button>
            </div>
          </AdminCard>
        </>
      ) : null}

      <AdminConfirmSheet
        open={!!pendingSave}
        onClose={() => !busy && setPendingSave(null)}
        onConfirm={() => void applyReviewedSave()}
        title={`Apply ${pendingSave?.showName ?? "show"} voting rules?`}
        description={
          pendingSave ? (
            <>
              This is a canonical R2 configuration change from version {pendingSave.expectedVersion}. The server will revalidate exact edition/show scope, configuration version and voting/result evidence at commit time. It will not recalculate or publish results as a hidden side effect.
            </>
          ) : undefined
        }
        confirmLabel="Apply versioned rules"
        busy={busy}
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-card px-3 py-3 text-center">
      <p className="numeric text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
