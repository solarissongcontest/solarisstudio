import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ListChecks,
  Plus,
  Settings2,
  Trash2,
  Users,
  Vote,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CountryPicker } from "@/components/CountryPicker";
import { FlagChip } from "@/components/FlagChip";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { FastJuryEntry } from "@/components/studio/FastEntry";
import { supabase } from "@/integrations/supabase/client";
import {
  VOTER_KINDS,
  editionLabel,
  matchVoterKey,
  resolveShowVoters,
  useContestEntities,
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useShowVoters,
  useShows,
  type Voter,
  type VoterKind,
  type VoterOption,
} from "@/lib/data";
import { DEFAULT_ACCENT, entityDisplayMap } from "@/lib/entities";
import { reportSupabaseError } from "@/lib/errors";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import {
  applyJuryRosterChange,
  loadJuryRosterPreview,
  type JuryRosterDependencies,
} from "@/lib/v3-jury-roster-client";
import { resolveVoting } from "@/lib/voting";

type JurySearch = { show?: string };
type View = "ballots" | "roster";

type JuryBallotStatus = {
  id: string;
  edition_id: string;
  show_id: string;
  voter_id: string | null;
  voter_country_id: string | null;
  voter_entity_id: string | null;
  status: "did_not_vote";
  note: string | null;
};

type JurySubmissionState =
  | "submitted"
  | "valid"
  | "needs_review"
  | "invalidated"
  | "superseded";

type JuryBallotSubmission = {
  id: string;
  edition_id: string;
  show_id: string;
  voter_country_id: string;
  risk_score: number;
  status: JurySubmissionState;
  review_version: number;
  review_reason: string | null;
  submitted_at: string;
};

type PendingBallotReview = {
  ballot: JuryBallotSubmission;
  targetStatus: Exclude<JurySubmissionState, "submitted">;
  expectedVersion: number;
  operationId: string;
  idempotencyKey: string;
};

type PendingDnvChange = {
  option: VoterOption;
  action: "set" | "clear";
  voterId: string | null;
  voterCountryId: string | null;
  voterEntityId: string | null;
  expectedVersion: number;
  savedVoteRows: number;
  operationId: string;
  idempotencyKey: string;
};

type PendingRosterRemoval = {
  voter: Voter;
  expectedVersion: number;
  dependencies: JuryRosterDependencies;
  canRemove: boolean;
};

type LifecycleRpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

const lifecycleRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => (supabase as any).rpc(functionName, args) as Promise<LifecycleRpcResult>;

type VoterDraft = {
  kind: VoterKind;
  countryId: string | null;
  name: string;
  flag_image: string;
  accent_color: string;
};

type EditDraft = {
  id: string;
  name: string;
  flag_image: string;
  accent_color: string;
};

const emptyVoter: VoterDraft = {
  kind: "country",
  countryId: null,
  name: "",
  flag_image: "",
  accent_color: "#8888aa",
};

function matchBallotStatusKey(status: JuryBallotStatus, options: VoterOption[]) {
  if (status.voter_id) {
    const direct = options.find((option) => option.voterId === status.voter_id);
    if (direct) return direct.key;
  }

  if (status.voter_entity_id) {
    const byEntity = options.find((option) => option.countryId === status.voter_entity_id);
    if (byEntity) return byEntity.key;
  }

  if (status.voter_country_id) {
    const byCountry = options.find((option) => option.countryId === status.voter_country_id);
    if (byCountry) return byCountry.key;
    return `c:${status.voter_country_id}`;
  }

  return status.voter_id ? `v:${status.voter_id}` : "";
}

export const Route = createFileRoute("/_authenticated/admin/jury/$slug")({
  head: () => ({ meta: [{ title: "Jury Voting — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): JurySearch => ({
    show: typeof search.show === "string" && search.show ? search.show : undefined,
  }),
  component: JuryWorkspace,
});

function JuryWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: allParticipants = [] } = useParticipants(edition?.id);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(edition?.id);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const selectedShow = orderedShows.find((show) => show.id === search.show) ?? orderedShows[0] ?? null;
  const participants = useMemo(
    () => allParticipants
      .filter((participant) => participant.show_id === selectedShow?.id)
      .sort((a, b) => (a.running_order ?? 9999) - (b.running_order ?? 9999)),
    [allParticipants, selectedShow?.id],
  );
  const { data: showVoters = [], isLoading: loadingVoters } = useShowVoters(selectedShow?.id);
  const { data: juryVotes = [], isLoading: loadingVotes } = useJuryVotes(selectedShow?.id);
  const { data: ballotStatuses = [], isLoading: loadingStatuses } = useQuery({
    enabled: !!selectedShow?.id,
    queryKey: ["jury_ballot_statuses", "show", selectedShow?.id ?? "pending"],
    queryFn: async () => {
      if (!selectedShow?.id) return [] as JuryBallotStatus[];
      const { data, error } = await (supabase as any)
        .from("jury_ballot_statuses")
        .select("*")
        .eq("show_id", selectedShow.id);
      if (error) throw error;
      return (data ?? []) as JuryBallotStatus[];
    },
  });
  const { data: submittedBallots = [], isLoading: loadingSubmittedBallots } = useQuery({
    enabled: !!selectedShow?.id,
    queryKey: ["jury_ballot_submissions", "show", selectedShow?.id ?? "pending"],
    queryFn: async () => {
      if (!selectedShow?.id) return [] as JuryBallotSubmission[];
      const { data, error } = await (supabase as any)
        .from("jury_ballot_submissions")
        .select(
          "id,edition_id,show_id,voter_country_id,risk_score,status,review_version,review_reason,submitted_at",
        )
        .eq("show_id", selectedShow.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JuryBallotSubmission[];
    },
  });

  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const order = useMemo(() => participants.map((participant) => participant.country_id).filter(Boolean), [participants]);
  const receiverDisplays = useMemo(
    () => order.map((id) => displays.get(id)).filter((item): item is NonNullable<typeof item> => !!item),
    [displays, order],
  );
  const voterOptions = useMemo(
    () => resolveShowVoters(showVoters, order, receiverDisplays),
    [order, receiverDisplays, showVoters],
  );
  const voting = useMemo(() => resolveVoting(selectedShow?.voting_config), [selectedShow?.voting_config]);
  const explicitRoster = showVoters.length > 0;
  const orderedVoters = useMemo(() => [...showVoters].sort((a, b) => a.sort_order - b.sort_order), [showVoters]);

  const [view, setView] = useState<View>("ballots");
  const [activeVoter, setActiveVoter] = useState("");
  const resolvedActiveVoter = voterOptions.some((option) => option.key === activeVoter)
    ? activeVoter
    : voterOptions[0]?.key ?? "";
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<VoterDraft>({ ...emptyVoter });
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [pendingRosterRemoval, setPendingRosterRemoval] = useState<PendingRosterRemoval | null>(null);
  const [rosterReason, setRosterReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingBallotReview, setPendingBallotReview] =
    useState<PendingBallotReview | null>(null);
  const [pendingDnvChange, setPendingDnvChange] = useState<PendingDnvChange | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");

  const neededPerBallot = voting.juryPoints.length;
  const ballotCounts = useMemo(() => {
    const counts = new Map<string, number>();
    voterOptions.forEach((option) => counts.set(option.key, 0));
    juryVotes.forEach((vote) => {
      const key = matchVoterKey(vote, voterOptions);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [juryVotes, voterOptions]);
  const didNotVoteVoterKeys = useMemo(
    () => new Set(
      ballotStatuses
        .filter((status) => status.status === "did_not_vote")
        .map((status) => matchBallotStatusKey(status, voterOptions))
        .filter(Boolean),
    ),
    [ballotStatuses, voterOptions],
  );
  const didNotVoteCount = voterOptions.filter((option) => didNotVoteVoterKeys.has(option.key)).length;
  const completedVoters = voterOptions.filter(
    (option) => !didNotVoteVoterKeys.has(option.key) && (ballotCounts.get(option.key) ?? 0) >= neededPerBallot,
  ).length;
  const resolvedVoters = voterOptions.filter(
    (option) => didNotVoteVoterKeys.has(option.key) || (ballotCounts.get(option.key) ?? 0) >= neededPerBallot,
  ).length;
  const remainingVoters = Math.max(0, voterOptions.length - resolvedVoters);
  const conflictingStatuses = voterOptions.filter(
    (option) => didNotVoteVoterKeys.has(option.key) && (ballotCounts.get(option.key) ?? 0) > 0,
  );

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["voters"] }),
      qc.invalidateQueries({ queryKey: ["jury_votes"] }),
      qc.invalidateQueries({ queryKey: ["jury_ballot_statuses"] }),
      qc.invalidateQueries({ queryKey: ["jury_ballot_submissions"] }),
      qc.invalidateQueries({ queryKey: ["admin-readiness-data"] }),
    ]);
  }

  function identityFor(key: string) {
    const entity = entities.find((item) => item.id === key || item.country_id === key);
    return entity
      ? { country_id: entity.country_id, contest_entity_id: entity.id }
      : { country_id: key || null, contest_entity_id: null };
  }

  function decodeVoterKey(key: string) {
    const option = voterOptions.find((item) => item.key === key);
    return { voterId: option?.voterId ?? null, countryId: option?.countryId ?? null };
  }

  async function assign(voterKey: string, receiver: string, points: number) {
    if (!edition || !selectedShow) return;
    if (didNotVoteVoterKeys.has(voterKey)) {
      toast.error("Restore this jury ballot before assigning points.");
      return;
    }
    const { voterId, countryId } = decodeVoterKey(voterKey);
    const voterIdentity = countryId ? identityFor(countryId) : { country_id: null, contest_entity_id: null };
    const target = identityFor(receiver);
    const { error } = await (supabase as any).rpc("assign_jury_vote", {
      p_edition_id: edition.id,
      p_show_id: selectedShow.id,
      p_voter_id: voterId,
      p_voter_country_id: voterIdentity.country_id,
      p_voter_entity_id: voterIdentity.contest_entity_id,
      p_receiving_country_id: target.country_id,
      p_receiving_entity_id: target.contest_entity_id,
      p_points: points,
    });
    if (error) {
      toast.error(reportSupabaseError(error, "Could not save that jury score. Nothing was changed."));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["jury_votes"] });
    await qc.invalidateQueries({ queryKey: ["admin-readiness-data"] });
  }

  async function clearPoint(voterKey: string, points: number) {
    if (!edition || !selectedShow) return;
    const { voterId, countryId } = decodeVoterKey(voterKey);
    const voterIdentity = countryId ? identityFor(countryId) : { country_id: null, contest_entity_id: null };
    const { error } = await (supabase as any).rpc("clear_jury_point", {
      p_edition_id: edition.id,
      p_show_id: selectedShow.id,
      p_voter_id: voterId,
      p_voter_country_id: voterIdentity.country_id,
      p_voter_entity_id: voterIdentity.contest_entity_id,
      p_points: points,
    });
    if (error) {
      toast.error(reportSupabaseError(error, "Could not clear that jury score. Nothing was changed."));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["jury_votes"] });
    await qc.invalidateQueries({ queryKey: ["admin-readiness-data"] });
  }

  async function setDidNotVote(voterKey: string, didNotVote: boolean) {
    if (!edition || !selectedShow || busy) return;
    const option = voterOptions.find((item) => item.key === voterKey);
    if (!option) return;

    const voterIdentity = option.countryId
      ? identityFor(option.countryId)
      : { country_id: null, contest_entity_id: null };
    const action = didNotVote ? "set" : "clear";

    setBusy(true);
    try {
      const previewResult = await lifecycleRpc("studio2_jury_dnv_preview", {
        p_show_id: selectedShow.id,
        p_voter_id: option.voterId,
        p_voter_country_id: voterIdentity.country_id,
        p_voter_entity_id: voterIdentity.contest_entity_id,
        p_action: action,
      });
      if (previewResult.error) {
        throw new Error(previewResult.error.message || "DNV preview failed.");
      }

      const preview = previewResult.data as {
        expectedVersion: number;
        savedVoteRows: number;
        riskClass: "R2";
      };
      const operation = createOrganisationCommand({
        command: `jury.dnv.${action}`,
        payload: {
          showId: selectedShow.id,
          voterKey,
          action,
        },
        riskClass: preview.riskClass,
        scope: {
          editionId: edition.id,
          showId: selectedShow.id,
          entityId: option.voterId ?? voterIdentity.contest_entity_id ?? voterIdentity.country_id,
        },
        expectedVersion: preview.expectedVersion,
      });

      setLifecycleReason("");
      setPendingDnvChange({
        option,
        action,
        voterId: option.voterId,
        voterCountryId: voterIdentity.country_id,
        voterEntityId: voterIdentity.contest_entity_id,
        expectedVersion: preview.expectedVersion,
        savedVoteRows: preview.savedVoteRows,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
      });
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "DNV impact preview could not be loaded."));
    } finally {
      setBusy(false);
    }
  }

  async function applyDnvChange() {
    if (!pendingDnvChange || !selectedShow || !lifecycleReason.trim() || busy) return;
    setBusy(true);
    try {
      const result = await lifecycleRpc("studio2_apply_jury_dnv", {
        p_show_id: selectedShow.id,
        p_voter_id: pendingDnvChange.voterId,
        p_voter_country_id: pendingDnvChange.voterCountryId,
        p_voter_entity_id: pendingDnvChange.voterEntityId,
        p_action: pendingDnvChange.action,
        p_reason: lifecycleReason.trim(),
        p_operation_id: pendingDnvChange.operationId,
        p_idempotency_key: pendingDnvChange.idempotencyKey,
        p_expected_version: pendingDnvChange.expectedVersion,
      });
      if (result.error) throw new Error(result.error.message || "DNV change failed.");

      toast.success(
        pendingDnvChange.action === "set"
          ? `${pendingDnvChange.option.name} marked did not vote`
          : `${pendingDnvChange.option.name} restored to ballot entry`,
      );
      setPendingDnvChange(null);
      setLifecycleReason("");
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "DNV change could not be applied."));
    } finally {
      setBusy(false);
    }
  }

  async function prepareBallotReview(
    ballot: JuryBallotSubmission,
    targetStatus: Exclude<JurySubmissionState, "submitted">,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const previewResult = await lifecycleRpc("studio2_jury_ballot_review_preview", {
        p_ballot_id: ballot.id,
        p_target_status: targetStatus,
      });
      if (previewResult.error) {
        throw new Error(previewResult.error.message || "Jury ballot review preview failed.");
      }

      const preview = previewResult.data as {
        expectedVersion: number;
        riskClass: "R2";
      };
      const operation = createOrganisationCommand({
        command: `jury.ballot.review.${targetStatus}`,
        payload: { ballotId: ballot.id, targetStatus },
        riskClass: preview.riskClass,
        scope: {
          editionId: ballot.edition_id,
          showId: ballot.show_id,
          entityId: ballot.id,
        },
        expectedVersion: preview.expectedVersion,
      });

      setLifecycleReason("");
      setPendingBallotReview({
        ballot,
        targetStatus,
        expectedVersion: preview.expectedVersion,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
      });
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury ballot impact preview could not be loaded."));
    } finally {
      setBusy(false);
    }
  }

  async function applyBallotReview() {
    if (!pendingBallotReview || busy) return;
    const requiresReason = pendingBallotReview.targetStatus !== "valid";
    if (requiresReason && !lifecycleReason.trim()) return;

    setBusy(true);
    try {
      const result = await lifecycleRpc("studio2_apply_jury_ballot_review", {
        p_ballot_id: pendingBallotReview.ballot.id,
        p_target_status: pendingBallotReview.targetStatus,
        p_reason: lifecycleReason.trim() || null,
        p_operation_id: pendingBallotReview.operationId,
        p_idempotency_key: pendingBallotReview.idempotencyKey,
        p_expected_version: pendingBallotReview.expectedVersion,
      });
      if (result.error) {
        throw new Error(result.error.message || "Jury ballot review transition failed.");
      }

      toast.success(`Jury ballot marked ${humanizeLifecycle(pendingBallotReview.targetStatus)}`);
      setPendingBallotReview(null);
      setLifecycleReason("");
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury ballot review could not be applied."));
    } finally {
      setBusy(false);
    }
  }

  async function addMissingParticipants() {
    if (!edition || !selectedShow || busy) return;
    setBusy(true);
    try {
      const preview = await loadJuryRosterPreview({ editionId: edition.id, showId: selectedShow.id });
      if (!preview.missingParticipantCount) {
        toast.info("All participating countries are already in the editable jury roster");
        return;
      }
      const result = await applyJuryRosterChange({
        editionId: edition.id,
        showId: selectedShow.id,
        changeKind: "materialize",
        expectedVersion: preview.expectedVersion,
      });
      toast.success(
        preview.explicitRoster
          ? `Added ${result.createdCount} missing countr${result.createdCount === 1 ? "y" : "ies"}`
          : `Created editable roster with ${result.createdCount} jur${result.createdCount === 1 ? "y" : "ies"}`,
      );
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury roster could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  function openAddVoter() {
    if (!explicitRoster) {
      toast.info("Create the editable roster first so the automatic participating-country juries are preserved.");
      setView("roster");
      return;
    }
    setDraft({ ...emptyVoter });
    setAddOpen(true);
  }

  async function addVoter() {
    if (!edition || !selectedShow || !explicitRoster || busy) return;
    const country = countries.find((item) => item.id === draft.countryId);
    const countryKind = draft.kind === "country" || draft.kind === "external-country";
    const name = countryKind ? country?.name ?? "" : draft.name.trim();
    if (!name) return;

    setBusy(true);
    try {
      const preview = await loadJuryRosterPreview({ editionId: edition.id, showId: selectedShow.id });
      if (!preview.explicitRoster) {
        toast.info("Create the editable roster first so participating juries are preserved.");
        setAddOpen(false);
        setView("roster");
        await refresh();
        return;
      }

      const identity = draft.kind === "country" && draft.countryId
        ? identityFor(draft.countryId)
        : { country_id: draft.countryId, contest_entity_id: null };
      await applyJuryRosterChange({
        editionId: edition.id,
        showId: selectedShow.id,
        changeKind: "add",
        expectedVersion: preview.expectedVersion,
        payload: {
          countryId: identity.country_id,
          contestEntityId: identity.contest_entity_id,
          name,
          kind: draft.kind,
          flagImage: draft.flag_image.trim() || country?.flag_image || null,
          accentColor: draft.accent_color.trim() || country?.accent_color || "#8888aa",
        },
      });
      toast.success("Jury added");
      setDraft({ ...emptyVoter });
      setAddOpen(false);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury could not be added."));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(voter: Voter) {
    setEditDraft({
      id: voter.id,
      name: voter.name,
      flag_image: voter.flag_image ?? "",
      accent_color: voter.accent_color,
    });
  }

  async function saveEdit() {
    if (!edition || !selectedShow || !editDraft?.name.trim() || busy) return;
    setBusy(true);
    try {
      const preview = await loadJuryRosterPreview({ editionId: edition.id, showId: selectedShow.id });
      if (!preview.roster.some((voter) => voter.id === editDraft.id)) {
        toast.info("That jury changed or was removed. The roster has been refreshed.");
        setEditDraft(null);
        await refresh();
        return;
      }
      await applyJuryRosterChange({
        editionId: edition.id,
        showId: selectedShow.id,
        changeKind: "update",
        expectedVersion: preview.expectedVersion,
        payload: {
          voterId: editDraft.id,
          name: editDraft.name.trim(),
          flagImage: editDraft.flag_image.trim() || null,
          accentColor: editDraft.accent_color.trim() || "#8888aa",
        },
      });
      toast.success("Jury updated");
      setEditDraft(null);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  async function moveVoter(index: number, direction: -1 | 1) {
    if (!edition || !selectedShow || busy) return;
    const clickedVoter = orderedVoters[index];
    if (!clickedVoter) return;

    setBusy(true);
    try {
      const preview = await loadJuryRosterPreview({ editionId: edition.id, showId: selectedShow.id });
      const canonicalIds = [...preview.roster]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((voter) => voter.id);
      const renderedIds = orderedVoters.map((voter) => voter.id);
      if (
        canonicalIds.length !== renderedIds.length ||
        canonicalIds.some((id, voterIndex) => id !== renderedIds[voterIndex])
      ) {
        toast.info("The Jury roster changed after this screen loaded. It has been refreshed; try the move again.");
        await refresh();
        return;
      }

      const currentIndex = canonicalIds.indexOf(clickedVoter.id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= canonicalIds.length) return;
      [canonicalIds[currentIndex], canonicalIds[targetIndex]] = [canonicalIds[targetIndex], canonicalIds[currentIndex]];

      await applyJuryRosterChange({
        editionId: edition.id,
        showId: selectedShow.id,
        changeKind: "reorder",
        expectedVersion: preview.expectedVersion,
        payload: { voterIds: canonicalIds },
      });
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury order could not be changed."));
    } finally {
      setBusy(false);
    }
  }

  async function prepareDeleteVoter(voter: Voter) {
    if (!edition || !selectedShow || busy) return;
    setBusy(true);
    try {
      const preview = await loadJuryRosterPreview({ editionId: edition.id, showId: selectedShow.id });
      const canonicalVoter = preview.roster.find((item) => item.id === voter.id);
      if (!canonicalVoter) {
        toast.info("That jury changed or was removed. The roster has been refreshed.");
        await refresh();
        return;
      }
      setRosterReason("");
      setPendingRosterRemoval({
        voter,
        expectedVersion: preview.expectedVersion,
        dependencies: canonicalVoter.dependencies,
        canRemove: canonicalVoter.canRemove,
      });
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury removal impact could not be loaded."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteVoter() {
    if (
      !edition ||
      !selectedShow ||
      !pendingRosterRemoval ||
      !pendingRosterRemoval.canRemove ||
      rosterReason.trim().length < 3 ||
      busy
    ) return;

    setBusy(true);
    try {
      await applyJuryRosterChange({
        editionId: edition.id,
        showId: selectedShow.id,
        changeKind: "remove",
        expectedVersion: pendingRosterRemoval.expectedVersion,
        reason: rosterReason,
        payload: { voterId: pendingRosterRemoval.voter.id },
      });
      toast.success(`${pendingRosterRemoval.voter.name} removed`);
      setPendingRosterRemoval(null);
      setRosterReason("");
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Jury could not be removed. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  const participatingCountryIds = new Set(participants.map((participant) => identityFor(participant.country_id).country_id).filter((id): id is string => !!id));
  const countryChoices = draft.kind === "country" ? countries.filter((country) => participatingCountryIds.has(country.id)) : countries;

  const statusForVoter = (key: string, given: number) => {
    if (didNotVoteVoterKeys.has(key)) return { label: "Did not vote", tone: "neutral" as const };
    if (given >= neededPerBallot) return { label: "Complete", tone: "ready" as const };
    if (given) return { label: "Started", tone: "attention" as const };
    return { label: "Pending", tone: "neutral" as const };
  };

  if (loadingEdition || loadingShows) return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading jury workspace…</p></AdminCard>;
  if (!edition) return <AdminCard><AdminEmptyState icon={Vote} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  if (!orderedShows.length) return <AdminPage><AdminPageHeader eyebrow={editionLabel(edition)} title="Jury voting" description="Create a show before configuring its juries and ballots." /><AdminCard><AdminEmptyState icon={Users} title="No shows yet" description="Juries belong to a show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create a show</Link>} /></AdminCard></AdminPage>;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Jury voting"
        description="Enter jury ballots quickly during production, or explicitly mark a jury as did not vote without inventing scores."
        actions={<AdminMoreMenu label="More" title="Jury actions" description="Configuration that should stay out of the way during live ballot entry."><AdminActionItem icon={Users} title="Manage jury roster" description={explicitRoster ? `${orderedVoters.length} explicit jury entities configured.` : "Participating countries are used automatically."} onClick={() => setView("roster")} /><AdminActionItem icon={Settings2} title="Voting system" description="Change point scale, weighting, self-voting and qualifier rules." onClick={() => void navigate({ to: "/admin/voting-system/$slug", params: { slug } })} /></AdminMoreMenu>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet"><ArrowLeft className="size-4" /> Edition home</Link>
        <select value={selectedShow?.id ?? ""} onChange={(event) => { setActiveVoter(""); void navigate({ search: { show: event.target.value || undefined } }); }} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
          {orderedShows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.kind.replaceAll("-", " ")}</option>)}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Juries" value={voterOptions.length} />
        <Metric label="Complete" value={completedVoters} />
        <Metric label="Did not vote" value={didNotVoteCount} />
        <Metric label="Remaining" value={remainingVoters} />
      </div>

      {conflictingStatuses.length ? (
        <AdminCard className="mb-4 !border-rose-200/20 !bg-rose-200/[0.05]">
          <p className="text-sm font-semibold text-rose-100">{conflictingStatuses.length} jury status conflict{conflictingStatuses.length === 1 ? "" : "s"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">A jury is marked “did not vote” but also has saved points. Restore the ballot status or remove the saved scores before results are treated as ready.</p>
        </AdminCard>
      ) : null}

      <AdminCard className="mb-4">
        <AdminCardHeader
          eyebrow="Participant ballots"
          title="Ballot validation"
          description="Participant submissions remain immutable evidence. Organizer review changes only the lifecycle state around the submitted ballot."
          action={
            loadingSubmittedBallots ? (
              <AdminStatus tone="neutral">Loading…</AdminStatus>
            ) : (
              <AdminStatus tone={submittedBallots.some((ballot) => ballot.status === "needs_review") ? "attention" : "ready"}>
                {submittedBallots.length} submitted
              </AdminStatus>
            )
          }
        />
        {loadingSubmittedBallots ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading submitted jury ballots…
          </p>
        ) : submittedBallots.length ? (
          <div className="mt-4 divide-y divide-white/[0.07]">
            {submittedBallots.map((ballot) => {
              const country = countries.find((item) => item.id === ballot.voter_country_id);
              return (
                <div
                  key={ballot.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{country?.name ?? ballot.voter_country_id}</p>
                      <AdminStatus tone={ballotReviewTone(ballot.status)}>
                        {humanizeLifecycle(ballot.status)}
                      </AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Risk {ballot.risk_score}/100 · submitted {formatLifecycleDate(ballot.submitted_at)}
                      {ballot.review_reason ? ` · ${ballot.review_reason}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ballot.status !== "valid" ? (
                      <button
                        type="button"
                        className="admin-action-secondary !min-h-10"
                        disabled={busy}
                        onClick={() => void prepareBallotReview(ballot, "valid")}
                      >
                        Mark valid
                      </button>
                    ) : null}
                    {ballot.status !== "needs_review" ? (
                      <button
                        type="button"
                        className="admin-action-secondary !min-h-10"
                        disabled={busy}
                        onClick={() => void prepareBallotReview(ballot, "needs_review")}
                      >
                        Needs review
                      </button>
                    ) : null}
                    {ballot.status !== "invalidated" ? (
                      <button
                        type="button"
                        className="admin-action-danger !min-h-10"
                        disabled={busy}
                        onClick={() => void prepareBallotReview(ballot, "invalidated")}
                      >
                        Invalidate
                      </button>
                    ) : null}
                    {ballot.status !== "superseded" ? (
                      <button
                        type="button"
                        className="admin-action-secondary !min-h-10"
                        disabled={busy}
                        onClick={() => void prepareBallotReview(ballot, "superseded")}
                      >
                        Supersede
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No participant-submitted jury ballot exists for this show yet.
          </p>
        )}
      </AdminCard>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1.5">
        <button type="button" onClick={() => setView("ballots")} className={view === "ballots" ? "admin-action-primary w-full" : "admin-action-quiet w-full"}><Vote className="size-4" /> Ballots</button>
        <button type="button" onClick={() => setView("roster")} className={view === "roster" ? "admin-action-primary w-full" : "admin-action-quiet w-full"}><Users className="size-4" /> Juries</button>
      </div>

      {!voting.juryEnabled ? <AdminCard className="mb-4"><div className="flex items-start gap-3"><Settings2 className="mt-0.5 size-5 shrink-0 text-amber-200" /><div><p className="text-sm font-semibold">Jury voting is disabled for this show</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The roster can still be prepared, but ballots should only be entered after enabling the jury in the voting system.</p></div></div></AdminCard> : null}

      {view === "ballots" ? (
        <AdminCard>
          <AdminCardHeader
            eyebrow="Live entry"
            title={selectedShow?.name ?? "Jury ballots"}
            description={`${neededPerBallot} awards per jury · ${voting.allowSelfVote ? "self-voting allowed" : "self-voting blocked"}. Scores save immediately; “did not vote” is a separate absence status and never inserts points.`}
            action={resolvedVoters === voterOptions.length && voterOptions.length ? <AdminStatus tone="ready"><CheckCircle2 className="size-3" /> All resolved</AdminStatus> : <AdminStatus tone="attention">{resolvedVoters}/{voterOptions.length} resolved</AdminStatus>}
          />
          {loadingVoters || loadingVotes || loadingStatuses ? <p className="py-8 text-center text-sm text-muted-foreground">Loading ballots…</p> : !participants.length ? <AdminEmptyState icon={ListChecks} title="No entries in this show" description="Build the line-up before entering jury votes." action={<Link to="/admin/entries/$slug" params={{ slug }} search={{ show: selectedShow?.id }} className="admin-action-primary">Open entries</Link>} /> : !voterOptions.length ? <AdminEmptyState icon={Users} title="No jury entities" description="Participating countries normally become juries automatically. If this show uses a custom roster, configure it in Juries." action={<button type="button" className="admin-action-primary" onClick={() => setView("roster")}>Manage juries</button>} /> : <FastJuryEntry voters={voterOptions} receivers={receiverDisplays} voting={voting} votes={juryVotes} activeVoter={resolvedActiveVoter} onVoterChange={setActiveVoter} onAssign={(voter, receiver, points) => void assign(voter, receiver, points)} onClear={(voter, points) => void clearPoint(voter, points)} didNotVoteVoterKeys={didNotVoteVoterKeys} onDidNotVoteChange={(voter, didNotVote) => void setDidNotVote(voter, didNotVote)} />}
        </AdminCard>
      ) : (
        <AdminCard>
          <AdminCardHeader eyebrow="Voting entities" title={explicitRoster ? "Editable jury roster" : "Automatic jury roster"} description={explicitRoster ? "This explicit list controls who can submit jury scores for the show." : "No custom roster exists, so participating countries are used automatically as voting entities."} action={explicitRoster ? <button type="button" className="admin-action-primary !min-h-10" onClick={openAddVoter}><Plus className="size-4" /> Add jury</button> : null} />
          {!explicitRoster ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-sky-200/10 bg-sky-200/[0.035] p-3 text-xs leading-relaxed text-muted-foreground">Automatic mode is deliberately read-only. Creating an editable roster first copies all participating countries, so adding an external jury cannot accidentally make the normal juries disappear.</div>
              {voterOptions.length ? <div className="divide-y divide-white/[0.07]">{voterOptions.map((option) => { const given = ballotCounts.get(option.key) ?? 0; const status = statusForVoter(option.key, given); return <div key={option.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><FlagChip code={option.short_code ?? "?"} color={option.accent_color} image={option.flag_image} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{option.name}</p><p className="mt-1 text-xs text-muted-foreground">Participating country · {didNotVoteVoterKeys.has(option.key) ? "no ballot expected" : `${given}/${neededPerBallot} awards`}</p></div><AdminStatus tone={status.tone}>{status.label}</AdminStatus></div>; })}</div> : <AdminEmptyState icon={Users} title="No automatic juries" description="Add entries to this show first." />}
              <button type="button" disabled={busy || !participants.length} onClick={() => void addMissingParticipants()} className="admin-action-secondary w-full"><Users className="size-4" /> {busy ? "Creating roster…" : "Create editable roster"}</button>
            </div>
          ) : !orderedVoters.length ? <AdminEmptyState icon={Users} title="No explicit juries" description="Add a country, external country, organisation, person or custom voting entity." action={<button type="button" className="admin-action-primary" onClick={openAddVoter}><Plus className="size-4" /> Add jury</button>} /> : (
            <div className="space-y-4">
              <div className="divide-y divide-white/[0.07]">{orderedVoters.map((voter, index) => { const option = voterOptions.find((item) => item.voterId === voter.id); const given = option ? ballotCounts.get(option.key) ?? 0 : 0; const key = option?.key ?? `v:${voter.id}`; const status = statusForVoter(key, given); return <div key={voter.id} className="flex min-w-0 items-center gap-2 py-3 first:pt-0 last:pb-0"><FlagChip code={option?.short_code ?? "?"} color={voter.accent_color || DEFAULT_ACCENT} image={voter.flag_image ?? option?.flag_image ?? null} size="sm" /><button type="button" onClick={() => openEdit(voter)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{voter.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{voter.kind.replaceAll("-", " ")} · {didNotVoteVoterKeys.has(key) ? "no ballot expected" : `${given}/${neededPerBallot} awards`}</span></button><AdminStatus tone={status.tone}>{status.label}</AdminStatus><div className="flex shrink-0 gap-1"><button type="button" disabled={busy || index === 0} onClick={() => void moveVoter(index, -1)} className="admin-action-quiet size-9 !p-0" aria-label={`Move ${voter.name} up`}><ArrowUp className="size-4" /></button><button type="button" disabled={busy || index === orderedVoters.length - 1} onClick={() => void moveVoter(index, 1)} className="admin-action-quiet size-9 !p-0" aria-label={`Move ${voter.name} down`}><ArrowDown className="size-4" /></button><button type="button" disabled={busy} onClick={() => void prepareDeleteVoter(voter)} className="admin-action-quiet size-9 !p-0 text-rose-200" aria-label={`Remove ${voter.name}`}><Trash2 className="size-4" /></button></div></div>; })}</div>
              <button type="button" disabled={busy} onClick={() => void addMissingParticipants()} className="admin-action-secondary w-full"><Users className="size-4" /> Add missing participating countries</button>
            </div>
          )}
        </AdminCard>
      )}

      <AdminSheet open={addOpen} onClose={() => !busy && setAddOpen(false)} title="Add jury" description="An explicit roster can include participating countries, external countries, organisations, people or custom voting entities."><div className="space-y-4"><label className="block"><span className="admin-section-label">Type</span><select value={draft.kind} onChange={(event) => setDraft({ ...emptyVoter, kind: event.target.value as VoterKind })} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30">{VOTER_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll("-", " ")}</option>)}</select></label>{draft.kind === "country" || draft.kind === "external-country" ? <label className="block"><span className="admin-section-label">Country</span><CountryPicker countries={countryChoices} value={draft.countryId} onChange={(id) => { const country = countries.find((item) => item.id === id); setDraft((current) => ({ ...current, countryId: id, name: country?.name ?? "", flag_image: country?.flag_image ?? "", accent_color: country?.accent_color ?? current.accent_color })); }} placeholder={draft.kind === "country" ? "Search participating country…" : "Search any country…"} className="mt-2" /></label> : <label className="block"><span className="admin-section-label">Name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="International Jury" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>}<label className="block"><span className="admin-section-label">Flag / logo URL</span><input value={draft.flag_image} onChange={(event) => setDraft((current) => ({ ...current, flag_image: event.target.value }))} placeholder="Optional" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label><label className="block"><span className="admin-section-label">Accent colour</span><input value={draft.accent_color} onChange={(event) => setDraft((current) => ({ ...current, accent_color: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label><button type="button" disabled={busy || !draft.name.trim()} onClick={() => void addVoter()} className="admin-action-primary w-full">{busy ? "Adding…" : "Add jury"}</button></div></AdminSheet>

      <AdminSheet open={!!editDraft} onClose={() => !busy && setEditDraft(null)} title="Edit jury" description="Identity binding and call order stay unchanged here. Reorder juries from the roster list.">{editDraft ? <div className="space-y-4"><label className="block"><span className="admin-section-label">Name</span><input value={editDraft.name} onChange={(event) => setEditDraft((current) => current ? { ...current, name: event.target.value } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label><label className="block"><span className="admin-section-label">Flag / logo URL</span><input value={editDraft.flag_image} onChange={(event) => setEditDraft((current) => current ? { ...current, flag_image: event.target.value } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label><label className="block"><span className="admin-section-label">Accent colour</span><input value={editDraft.accent_color} onChange={(event) => setEditDraft((current) => current ? { ...current, accent_color: event.target.value } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label><button type="button" disabled={busy || !editDraft.name.trim()} onClick={() => void saveEdit()} className="admin-action-primary w-full">{busy ? "Saving…" : "Save jury"}</button></div> : null}</AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingBallotReview)}
        onClose={() => {
          if (!busy) {
            setPendingBallotReview(null);
            setLifecycleReason("");
          }
        }}
        onConfirm={applyBallotReview}
        title={
          pendingBallotReview
            ? `Mark ballot ${humanizeLifecycle(pendingBallotReview.targetStatus)}?`
            : "Review jury ballot?"
        }
        description={
          pendingBallotReview ? (
            <div className="space-y-3">
              <p>
                {humanizeLifecycle(pendingBallotReview.ballot.status)} →{" "}
                <strong className="text-foreground">
                  {humanizeLifecycle(pendingBallotReview.targetStatus)}
                </strong>
                . The submitted ballot rows are not rewritten by this review decision.
              </p>
              <label className="block">
                <span className="text-xs font-semibold text-foreground">
                  Review reason
                </span>
                <textarea
                  value={lifecycleReason}
                  onChange={(event) => setLifecycleReason(event.target.value)}
                  className="admin-input mt-2 min-h-24 resize-y"
                  placeholder={
                    pendingBallotReview.targetStatus === "valid"
                      ? "Optional validation note"
                      : "Why is this ballot changing state?"
                  }
                />
              </label>
            </div>
          ) : (
            "Review the jury ballot impact before continuing."
          )
        }
        confirmLabel="Apply ballot state"
        confirmationText={pendingBallotReview?.targetStatus.toUpperCase()}
        confirmationHint={
          pendingBallotReview
            ? `Type ${pendingBallotReview.targetStatus.toUpperCase()} to confirm`
            : undefined
        }
        busy={busy}
        confirmDisabled={
          Boolean(
            pendingBallotReview &&
              pendingBallotReview.targetStatus !== "valid" &&
              lifecycleReason.trim().length < 3,
          )
        }
        danger={pendingBallotReview?.targetStatus === "invalidated"}
      />

      <AdminConfirmSheet
        open={Boolean(pendingDnvChange)}
        onClose={() => {
          if (!busy) {
            setPendingDnvChange(null);
            setLifecycleReason("");
          }
        }}
        onConfirm={applyDnvChange}
        title={pendingDnvChange?.action === "set" ? "Authorize did not vote?" : "Clear did not vote?"}
        description={
          pendingDnvChange ? (
            <div className="space-y-3">
              <p>
                {pendingDnvChange.action === "set"
                  ? `The ballot requirement for ${pendingDnvChange.option.name} will be replaced by an authorized DNV state.`
                  : `${pendingDnvChange.option.name} will return to an expected jury-ballot state.`}
              </p>
              <p className="text-xs text-muted-foreground">
                Saved jury score rows: {pendingDnvChange.savedVoteRows}. Readiness and Tasks update from canonical state after this receipt commits.
              </p>
              <label className="block">
                <span className="text-xs font-semibold text-foreground">
                  Operator reason
                </span>
                <textarea
                  value={lifecycleReason}
                  onChange={(event) => setLifecycleReason(event.target.value)}
                  className="admin-input mt-2 min-h-24 resize-y"
                  placeholder="Why is this DNV state changing?"
                />
              </label>
            </div>
          ) : (
            "Review the DNV impact before continuing."
          )
        }
        confirmLabel={pendingDnvChange?.action === "set" ? "Authorize DNV" : "Clear DNV"}
        confirmationText={pendingDnvChange?.action === "set" ? "DNV" : "RESTORE"}
        confirmationHint={
          pendingDnvChange?.action === "set"
            ? "Type DNV to confirm"
            : pendingDnvChange
              ? "Type RESTORE to confirm"
              : undefined
        }
        busy={busy}
        confirmDisabled={lifecycleReason.trim().length < 3}
        danger={pendingDnvChange?.action === "set"}
      />

      <AdminConfirmSheet
        open={Boolean(pendingRosterRemoval)}
        onClose={() => {
          if (!busy) {
            setPendingRosterRemoval(null);
            setRosterReason("");
          }
        }}
        onConfirm={deleteVoter}
        title={`Remove ${pendingRosterRemoval?.voter.name ?? "jury"}?`}
        description={
          pendingRosterRemoval ? (
            <div className="space-y-3">
              {pendingRosterRemoval.canRemove ? (
                <>
                  <p>
                    The authoritative preflight found no saved Jury score, ballot-status or submitted-ballot evidence for this voter. Removal is an R3 operation and the server will re-check those dependencies before committing.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {orderedVoters.length === 1
                      ? "Removing the final explicit jury returns this show to the automatic participating-country roster."
                      : "The remaining explicit jury roster stays active."}
                  </p>
                  <label className="block">
                    <span className="text-xs font-semibold text-foreground">Operator reason</span>
                    <textarea
                      value={rosterReason}
                      onChange={(event) => setRosterReason(event.target.value)}
                      className="admin-input mt-2 min-h-24 resize-y"
                      placeholder="Why should this jury identity be removed?"
                    />
                  </label>
                </>
              ) : (
                <div className="rounded-xl border border-rose-200/20 bg-rose-200/[0.05] p-3">
                  <p className="font-semibold text-rose-100">This jury cannot be removed.</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Official evidence exists: {pendingRosterRemoval.dependencies.scoreRows} saved score row{pendingRosterRemoval.dependencies.scoreRows === 1 ? "" : "s"}, {pendingRosterRemoval.dependencies.ballotStatuses} ballot-status row{pendingRosterRemoval.dependencies.ballotStatuses === 1 ? "" : "s"}, and {pendingRosterRemoval.dependencies.ballotSubmissions} submitted ballot{pendingRosterRemoval.dependencies.ballotSubmissions === 1 ? "" : "s"}. The roster identity is preserved; resolve that evidence through its governed lifecycle instead.
                  </p>
                </div>
              )}
            </div>
          ) : (
            "Review the authoritative removal impact before continuing."
          )
        }
        confirmLabel="Remove jury"
        confirmationText={pendingRosterRemoval?.canRemove ? pendingRosterRemoval.voter.name : undefined}
        confirmationHint={pendingRosterRemoval?.canRemove ? `Type ${pendingRosterRemoval.voter.name} to confirm` : undefined}
        busy={busy}
        confirmDisabled={!pendingRosterRemoval?.canRemove || rosterReason.trim().length < 3}
        danger
      />
    </AdminPage>
  );
}

function humanizeLifecycle(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ballotReviewTone(status: JurySubmissionState) {
  if (status === "valid") return "ready" as const;
  if (status === "needs_review" || status === "submitted") return "attention" as const;
  if (status === "invalidated") return "blocked" as const;
  return "neutral" as const;
}

function formatLifecycleDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
