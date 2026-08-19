import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  CheckCircle2,
  Eye,
  FileWarning,
  Gavel,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  createMergedIntegritySanction,
  excludeMergedIntegrityBallot,
  getMergedIntegrityModeration,
  revokeMergedIntegritySanction,
  saveMergedIntegrityDecision,
} from "@/integrations/televoting/integrity-moderation.functions";
import type {
  IntegrityHumanDecision,
  IntegrityModerationCase,
  IntegritySanctionRow,
  IntegritySanctionType,
} from "@/integrations/televoting/integrity-moderation.server";

const decisionLabels: Record<IntegrityHumanDecision, string> = {
  cleared: "Cleared · no action",
  monitor: "Monitor",
  false_declaration_confirmed: "False declaration confirmed",
  ballot_excluded: "Ballot excluded",
};

export function IntegrityModerationHub() {
  const queryClient = useQueryClient();
  const getModeration = useServerFn(getMergedIntegrityModeration);
  const saveDecision = useServerFn(saveMergedIntegrityDecision);
  const excludeBallot = useServerFn(excludeMergedIntegrityBallot);
  const createSanction = useServerFn(createMergedIntegritySanction);
  const revokeSanction = useServerFn(revokeMergedIntegritySanction);

  const [decisionCase, setDecisionCase] = useState<IntegrityModerationCase | null>(null);
  const [excludeCase, setExcludeCase] = useState<IntegrityModerationCase | null>(null);
  const [sanctionCase, setSanctionCase] = useState<IntegrityModerationCase | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<IntegritySanctionRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["integrity-human-moderation"],
    queryFn: () => getModeration(),
    refetchInterval: 15_000,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["integrity-human-moderation"] });
    await queryClient.invalidateQueries({ queryKey: ["merged-integrity-declarations"] });
  }

  const decisionMutation = useMutation({
    mutationFn: (payload: { preflightId: string; decision: IntegrityHumanDecision; reason: string; evidenceNotes?: string | null }) => saveDecision({ data: payload }),
    onSuccess: async () => {
      toast.success("Human integrity decision recorded");
      setDecisionCase(null);
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not save the decision"),
  });

  const excludeMutation = useMutation({
    mutationFn: (payload: { preflightId: string; reason: string }) => excludeBallot({ data: payload }),
    onSuccess: async () => {
      toast.success("Ballot excluded from official results; evidence preserved");
      setExcludeCase(null);
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not exclude the ballot"),
  });

  const sanctionMutation = useMutation({
    mutationFn: (payload: { preflightId: string; sanctionType: IntegritySanctionType; expiresAt?: string | null; reason: string }) => createSanction({ data: payload }),
    onSuccess: async () => {
      toast.success("SSC voting sanction created");
      setSanctionCase(null);
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not create the sanction"),
  });

  const revokeMutation = useMutation({
    mutationFn: (payload: { sanctionId: string; reason: string }) => revokeSanction({ data: payload }),
    onSuccess: async () => {
      toast.success("Sanction revoked. Any excluded ballot remains excluded.");
      setRevokeTarget(null);
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not revoke the sanction"),
  });

  const cases = data?.cases ?? [];
  const pending = cases.filter((row) => !row.human_decision).length;
  const confirmedFalse = cases.filter((row) => row.human_decision?.decision === "false_declaration_confirmed").length;
  const excluded = cases.filter((row) => Boolean(row.human_decision?.ballot_excluded_at) || row.human_decision?.decision === "ballot_excluded").length;
  const activeSanctions = data?.activeSanctions ?? [];

  const sortedCases = useMemo(() => [...cases].sort((a, b) => {
    const aPending = a.human_decision ? 1 : 0;
    const bPending = b.human_decision ? 1 : 0;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }), [cases]);

  return (
    <section className="space-y-4">
      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Human moderation"
          title="Organizer decisions"
          description="Automatic warnings are evidence for review, not misconduct findings. Only a Solaris organizer can confirm a false declaration, exclude a ballot or impose an SSC voting sanction."
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Awaiting decision" value={pending} attention={pending > 0} />
          <Metric label="False declarations" value={confirmedFalse} />
          <Metric label="Excluded ballots" value={excluded} />
          <Metric label="Active sanctions" value={activeSanctions.length} attention={activeSanctions.length > 0} />
        </div>
        <div className="mt-4 rounded-xl border border-sky-200/12 bg-sky-200/[0.035] p-3 text-xs leading-5 text-muted-foreground">
          Solaris never bans someone because an algorithm produced a high score. A ban or suspension requires a separate human finding, a written reason and another deliberate confirmation step. IP geography is never used as sanction identity.
        </div>
      </AdminCard>

      {isLoading ? (
        <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Loading human moderation…</p></AdminCard>
      ) : error ? (
        <AdminCard className="!border-rose-200/15"><p className="text-sm text-rose-100">{error instanceof Error ? error.message : "Moderation could not be loaded."}</p></AdminCard>
      ) : sortedCases.length ? (
        <div className="space-y-3">
          {sortedCases.map((row) => (
            <CaseCard
              key={row.id}
              row={row}
              onDecision={() => setDecisionCase(row)}
              onExclude={() => setExcludeCase(row)}
              onSanction={() => setSanctionCase(row)}
            />
          ))}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState icon={Gavel} title="Nothing needs a human decision" description="Cases appear here only after the automatic pre-submit system has required an integrity declaration." />
        </AdminCard>
      )}

      <AdminCard>
        <AdminCardHeader
          eyebrow="Access restrictions"
          title="SSC voting sanctions"
          description="Active sanctions block new preflight checks server-side. Revoking access later never restores an already excluded ballot."
        />
        {activeSanctions.length ? (
          <div className="space-y-2">
            {activeSanctions.map((sanction) => (
              <SanctionRow key={sanction.id} sanction={sanction} onRevoke={() => setRevokeTarget(sanction)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active SSC voting sanctions.</p>
        )}
      </AdminCard>

      <DecisionSheet
        row={decisionCase}
        busy={decisionMutation.isPending}
        onClose={() => setDecisionCase(null)}
        onSave={(decision, reason, evidenceNotes) => decisionCase && decisionMutation.mutate({ preflightId: decisionCase.id, decision, reason, evidenceNotes })}
      />
      <ExcludeSheet
        row={excludeCase}
        busy={excludeMutation.isPending}
        onClose={() => setExcludeCase(null)}
        onConfirm={(reason) => excludeCase && excludeMutation.mutate({ preflightId: excludeCase.id, reason })}
      />
      <SanctionSheet
        row={sanctionCase}
        busy={sanctionMutation.isPending}
        onClose={() => setSanctionCase(null)}
        onConfirm={(sanctionType, expiresAt, reason) => sanctionCase && sanctionMutation.mutate({ preflightId: sanctionCase.id, sanctionType, expiresAt, reason })}
      />
      <RevokeSheet
        sanction={revokeTarget}
        busy={revokeMutation.isPending}
        onClose={() => setRevokeTarget(null)}
        onConfirm={(reason) => revokeTarget && revokeMutation.mutate({ sanctionId: revokeTarget.id, reason })}
      />
    </section>
  );
}

function CaseCard({ row, onDecision, onExclude, onSanction }: {
  row: IntegrityModerationCase;
  onDecision: () => void;
  onExclude: () => void;
  onSanction: () => void;
}) {
  const decision = row.human_decision;
  const canExclude = Boolean(row.submission_id) && decision?.decision !== "cleared" && !decision?.ballot_excluded_at && row.submission_status !== "deleted";
  const canSanction = row.attested_at && decision?.decision === "false_declaration_confirmed";
  const hasActiveSanction = row.sanctions.some(isSanctionActive);

  return (
    <AdminCard className="!p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black">{row.username}</p>
            <AdminStatus tone="info">{row.country_code}</AdminStatus>
            <AdminStatus tone={row.risk_score >= 65 ? "blocked" : "attention"}>Auto {row.risk_score}/100</AdminStatus>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.edition_name ? `${row.edition_name} · ` : ""}{row.round_name}</p>
        </div>
        <AdminStatus tone={!decision ? "attention" : decision.decision === "cleared" ? "ready" : decision.decision === "false_declaration_confirmed" ? "blocked" : "info"}>
          {decision ? decisionLabels[decision.decision] : "Human review pending"}
        </AdminStatus>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini label="Signed" value={row.attested_at ? "Yes" : "No"} />
        <Mini label="Submitted" value={row.submitted_at ? "Yes" : "No"} />
        <Mini label="Findings" value={String(row.findings.length)} />
      </div>

      {decision ? (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Human decision</p>
          <p className="mt-1 text-sm font-semibold">{decisionLabels[decision.decision]}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{decision.reason}</p>
          {decision.ballot_excluded_at ? <p className="mt-2 text-xs text-rose-100">Ballot excluded · record preserved for audit and integrity analysis.</p> : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={onDecision} className="admin-action-secondary min-h-11"><Gavel className="size-4" /> {decision ? "Update decision" : "Record decision"}</button>
        <button type="button" onClick={onExclude} disabled={!canExclude} className="admin-action-secondary min-h-11 disabled:opacity-40"><Trash2 className="size-4" /> Exclude ballot</button>
        <button type="button" onClick={onSanction} disabled={!canSanction || hasActiveSanction} className="admin-action-secondary min-h-11 disabled:opacity-40"><Ban className="size-4" /> {hasActiveSanction ? "Sanction active" : "SSC sanction"}</button>
      </div>
    </AdminCard>
  );
}

function DecisionSheet({ row, busy, onClose, onSave }: {
  row: IntegrityModerationCase | null;
  busy: boolean;
  onClose: () => void;
  onSave: (decision: IntegrityHumanDecision, reason: string, evidenceNotes: string) => void;
}) {
  const [decision, setDecision] = useState<IntegrityHumanDecision>("monitor");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");

  function close() {
    if (busy) return;
    setReason("");
    setEvidence("");
    setDecision("monitor");
    onClose();
  }

  return (
    <AdminSheet open={Boolean(row)} onClose={close} title="Record human decision" description="This is an organizer finding. It is separate from the automatic risk score.">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3 text-xs leading-5 text-muted-foreground">
          <strong className="text-foreground">Automatic flag ≠ misconduct.</strong> Review the ballot evidence and signed declaration before recording a human finding.
        </div>
        <div className="space-y-2">
          <DecisionOption icon={CheckCircle2} checked={decision === "cleared"} title="Clear · no action" description="The automatic pattern does not justify further action." onClick={() => setDecision("cleared")} />
          <DecisionOption icon={Eye} checked={decision === "monitor"} title="Monitor" description="Keep the case visible, but do not exclude or sanction the voter." onClick={() => setDecision("monitor")} />
          <DecisionOption icon={FileWarning} checked={decision === "false_declaration_confirmed"} title="Confirm false declaration" description="You have independent grounds to establish that the signed independence declaration was knowingly false. This does NOT create a ban automatically." danger onClick={() => setDecision("false_declaration_confirmed")} />
        </div>
        <Field label="Reason · required">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="admin-input w-full resize-y" placeholder="What did you review, and why does this human decision follow from the evidence?" />
        </Field>
        <Field label="Evidence notes · optional">
          <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={3} className="admin-input w-full resize-y" placeholder="Links, conversation context, corroborating evidence, or anything another organizer should know." />
        </Field>
        <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => onSave(decision, reason, evidence)} className={decision === "false_declaration_confirmed" ? "admin-action-danger w-full min-h-12" : "admin-action-primary w-full min-h-12"}>
          {busy ? "Saving decision…" : decision === "false_declaration_confirmed" ? "Confirm human finding" : "Save organizer decision"}
        </button>
      </div>
    </AdminSheet>
  );
}

function ExcludeSheet({ row, busy, onClose, onConfirm }: {
  row: IntegrityModerationCase | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  return (
    <AdminSheet open={Boolean(row)} onClose={busy ? () => undefined : onClose} title="Exclude this ballot" description="Removes the ballot from official results without deleting its evidence.">
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs leading-5 text-muted-foreground">
          The submission will be marked deleted with an integrity-moderation category. Vote entries remain stored for audit and fraud analysis. Revoking a later sanction will <strong className="text-foreground">not</strong> restore this ballot.
        </div>
        <Field label="Exclusion reason">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="admin-input w-full resize-y" />
        </Field>
        <Field label="Type EXCLUDE to confirm">
          <input value={typed} onChange={(event) => setTyped(event.target.value)} className="admin-input w-full" autoComplete="off" />
        </Field>
        <button type="button" disabled={busy || typed !== "EXCLUDE" || reason.trim().length < 5} onClick={() => onConfirm(reason)} className="admin-action-danger w-full min-h-12">
          <Trash2 className="size-4" /> {busy ? "Excluding…" : "Exclude ballot, preserve record"}
        </button>
      </div>
    </AdminSheet>
  );
}

function SanctionSheet({ row, busy, onClose, onConfirm }: {
  row: IntegrityModerationCase | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (type: IntegritySanctionType, expiresAt: string | null, reason: string) => void;
}) {
  const [type, setType] = useState<IntegritySanctionType>("temporary");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const expected = type === "permanent" ? "BAN" : "SUSPEND";

  return (
    <AdminSheet open={Boolean(row)} onClose={busy ? () => undefined : onClose} title="SSC voting sanction" description="Separate deliberate action after a human false-declaration finding.">
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs leading-5 text-muted-foreground">
          Only an organizer can impose this restriction. The automatic detector did not ban this voter. Solaris will scope the restriction to the historical HOD identity when available, otherwise to the fictional country, then username only as a final fallback.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setType("temporary"); setTyped(""); }} className={type === "temporary" ? "admin-action-primary" : "admin-action-secondary"}>Temporary suspension</button>
          <button type="button" onClick={() => { setType("permanent"); setTyped(""); }} className={type === "permanent" ? "admin-action-danger" : "admin-action-secondary"}>Permanent ban</button>
        </div>
        {type === "temporary" ? (
          <Field label="Suspended until">
            <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="admin-input w-full" />
          </Field>
        ) : null}
        <Field label="Sanction reason · required">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="admin-input w-full resize-y" placeholder="Why has the organizer concluded that an SSC voting restriction is warranted?" />
        </Field>
        <Field label={`Type ${expected} to confirm`}>
          <input value={typed} onChange={(event) => setTyped(event.target.value)} className="admin-input w-full" autoComplete="off" />
        </Field>
        <button
          type="button"
          disabled={busy || typed !== expected || reason.trim().length < 8 || (type === "temporary" && !expiresAt)}
          onClick={() => onConfirm(type, type === "temporary" ? new Date(expiresAt).toISOString() : null, reason)}
          className="admin-action-danger w-full min-h-12"
        >
          <Ban className="size-4" /> {busy ? "Creating sanction…" : type === "permanent" ? "Create permanent SSC ban" : "Create temporary suspension"}
        </button>
      </div>
    </AdminSheet>
  );
}

function RevokeSheet({ sanction, busy, onClose, onConfirm }: {
  sanction: IntegritySanctionRow | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  return (
    <AdminSheet open={Boolean(sanction)} onClose={busy ? () => undefined : onClose} title="Revoke voting sanction" description="Restores future voting access only.">
      <div className="space-y-4">
        <div className="rounded-xl border border-sky-200/12 bg-sky-200/[0.035] p-3 text-xs leading-5 text-muted-foreground">
          Revocation does not restore any ballot that was previously excluded. That remains a separate historical moderation action.
        </div>
        <Field label="Revocation reason">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="admin-input w-full resize-y" />
        </Field>
        <Field label="Type REVOKE to confirm">
          <input value={typed} onChange={(event) => setTyped(event.target.value)} className="admin-input w-full" autoComplete="off" />
        </Field>
        <button type="button" disabled={busy || typed !== "REVOKE" || reason.trim().length < 5} onClick={() => onConfirm(reason)} className="admin-action-primary w-full min-h-12">
          <RotateCcw className="size-4" /> {busy ? "Revoking…" : "Revoke sanction"}
        </button>
      </div>
    </AdminSheet>
  );
}

function SanctionRow({ sanction, onRevoke }: { sanction: IntegritySanctionRow; onRevoke: () => void }) {
  const scope = sanction.scope_type === "hod" ? "Historical HOD" : sanction.scope_type === "country" ? `Country ${sanction.country_code}` : `Username ${sanction.username_normalized}`;
  return (
    <div className="rounded-xl border border-rose-200/12 bg-rose-200/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><AdminStatus tone="blocked">{sanction.sanction_type === "permanent" ? "Permanent" : "Temporary"}</AdminStatus><AdminStatus tone="neutral">{scope}</AdminStatus></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{sanction.reason}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{sanction.expires_at ? `Until ${new Date(sanction.expires_at).toLocaleString()}` : "No expiry"}</p>
        </div>
        <button type="button" onClick={onRevoke} className="admin-action-quiet shrink-0">Revoke</button>
      </div>
    </div>
  );
}

function DecisionOption({ icon: Icon, checked, title, description, onClick, danger = false }: { icon: typeof Gavel; checked: boolean; title: string; description: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-xl border p-3 text-left transition ${checked ? danger ? "border-rose-200/30 bg-rose-200/[0.08]" : "border-sky-200/25 bg-sky-200/[0.06]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07]"><Icon className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span></span></div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-semibold text-foreground">{label}</span>{children}</label>;
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`rounded-xl border p-3 ${attention ? "border-amber-200/15 bg-amber-200/[0.045]" : "border-white/[0.07] bg-white/[0.025]"}`}><p className="text-xl font-black">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"><p className="text-sm font-bold">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p></div>;
}

function isSanctionActive(sanction: IntegritySanctionRow) {
  if (sanction.revoked_at) return false;
  if (new Date(sanction.active_from).getTime() > Date.now()) return false;
  return !sanction.expires_at || new Date(sanction.expires_at).getTime() > Date.now();
}
