import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { RuleDecisionStrip } from "@/components/rules/RuleDecisionStrip";
import {
  decideSealedIdentityDisclosure,
  getCurrentIntegrityOrganizerId,
  listIdentityDisclosureRequests,
  listSealedIntegrityCases,
  requestSealedIdentityDisclosure,
  revealSealedIdentity,
  type IdentityDisclosureRequest,
  type RevealedSealedIdentity,
  type SealedIntegrityCase,
} from "@/lib/integrity-identity";
import { getIntegrityCategory } from "@/lib/integrity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrity-identity")({
  head: () => ({
    meta: [
      { title: "Sealed Identity Access — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityIdentityDesk,
});

function IntegrityIdentityDesk() {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const casesQuery = useQuery({
    queryKey: ["admin-sealed-integrity-cases"],
    queryFn: listSealedIntegrityCases,
    refetchInterval: 30_000,
  });
  const requestsQuery = useQuery({
    queryKey: ["admin-identity-disclosure-requests"],
    queryFn: listIdentityDisclosureRequests,
    refetchInterval: 30_000,
  });
  const userQuery = useQuery({
    queryKey: ["current-integrity-organizer-id"],
    queryFn: getCurrentIntegrityOrganizerId,
    staleTime: 10 * 60 * 1000,
  });
  const cases = casesQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const currentUserId = userQuery.data ?? null;

  const refresh = async () => {
    await Promise.all([casesQuery.refetch(), requestsQuery.refetch()]);
  };

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId) throw new Error("Choose a sealed case first.");
      return requestSealedIdentityDisclosure(selectedCaseId, requestReason);
    },
    onSuccess: async () => {
      setRequestReason("");
      setSelectedCaseId(null);
      await refresh();
      toast.success("Break-glass request created. A different organizer must decide it.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not request disclosure"),
  });

  const pending = requests.filter((item) => item.status === "pending");
  const approved = requests.filter((item) => item.status === "approved");
  const history = requests.filter((item) => ["rejected", "used", "expired"].includes(item.status));
  const requestableCases = cases.filter((item) => !item.active_request_id);

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px]">
        <AdminPageHeader
          eyebrow="Trust & Integrity"
          title="Sealed identity access"
          description="Ordinary case reviewers cannot reveal a sealed reporter. Exceptional disclosure requires a written break-glass request, approval by a second organizer and a one-time reveal within 30 minutes."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/integrity-investigations" className="admin-action-secondary"><ShieldCheck className="size-4" />Investigations</Link>
              <button type="button" onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button>
            </div>
          }
        />

        <RuleDecisionStrip
          title="Identity protection & reviewer independence"
          description="Sealed identity is not available to ordinary investigators. Break-glass disclosure is exceptional, requires two different organizers and leaves an audit event visible to the reporter when identity is actually revealed."
          ruleIds={["16.3", "18.3"]}
          integrity
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric label="Sealed cases" value={cases.length} tone="info" />
          <Metric label="Pending approval" value={pending.length} tone={pending.length ? "attention" : "ready"} />
          <Metric label="Approved · unused" value={approved.length} tone={approved.length ? "blocked" : "ready"} />
          <Metric label="Historical requests" value={history.length} tone="neutral" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
          <AdminCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="admin-section-label">Request disclosure</p>
                <h2 className="mt-1 text-lg font-black">Create a break-glass request</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">This does not reveal anything. It only creates a request another organizer can approve or reject.</p>
              </div>
              <LockKeyhole className="size-5 text-emerald-200" />
            </div>

            <label className="mt-5 block">
              <span className="text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">Sealed case</span>
              <select value={selectedCaseId ?? ""} onChange={(event) => setSelectedCaseId(event.target.value || null)} className="admin-input mt-1 w-full">
                <option value="">Choose sealed case…</option>
                {requestableCases.map((item) => <option key={item.id} value={item.id}>{item.public_code} · {item.summary}</option>)}
              </select>
            </label>

            {selectedCaseId ? <SelectedCasePreview item={cases.find((item) => item.id === selectedCaseId) ?? null} /> : null}

            <label className="mt-4 block">
              <span className="text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">Exceptional reason</span>
              <textarea
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                rows={6}
                placeholder="Explain why the reporter identity is genuinely necessary and why ordinary sealed review is insufficient…"
                className="admin-input mt-1 w-full resize-y"
              />
            </label>
            <p className="mt-2 text-[10px] leading-5 text-muted-foreground">Minimum 20 characters. The request reason is internal, but any actual identity reveal produces a reporter-visible audit event.</p>
            <button
              type="button"
              disabled={!selectedCaseId || requestReason.trim().length < 20 || requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
              className="admin-action-primary mt-4 w-full justify-center disabled:opacity-50"
            >
              <KeyRound className="size-4" /> {requestMutation.isPending ? "Requesting…" : "Request sealed identity access"}
            </button>

            {!requestableCases.length && cases.length ? (
              <div className="mt-4 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-3 text-[10px] leading-5 text-amber-50/70">Every sealed case currently has a pending or unexpired approved request.</div>
            ) : null}
          </AdminCard>

          <div className="space-y-4">
            <AdminCard>
              <div className="flex items-center justify-between gap-3">
                <div><p className="admin-section-label">Pending second-person review</p><h2 className="mt-1 font-black">{pending.length} request{pending.length === 1 ? "" : "s"}</h2></div>
                <UserRoundCheck className="size-5 text-sky-200" />
              </div>
              <div className="mt-4 space-y-3">
                {pending.map((item) => <DisclosureRequestCard key={item.id} item={item} currentUserId={currentUserId} onChanged={refresh} />)}
                {!pending.length ? <EmptyState text="No sealed identity requests are waiting for a second organizer." /> : null}
              </div>
            </AdminCard>

            <AdminCard>
              <div className="flex items-center justify-between gap-3">
                <div><p className="admin-section-label">Approved break-glass windows</p><h2 className="mt-1 font-black">{approved.length} active approval{approved.length === 1 ? "" : "s"}</h2></div>
                <Clock3 className="size-5 text-amber-200" />
              </div>
              <div className="mt-4 space-y-3">
                {approved.map((item) => <DisclosureRequestCard key={item.id} item={item} currentUserId={currentUserId} onChanged={refresh} />)}
                {!approved.length ? <EmptyState text="No sealed identity approval is awaiting one-time use." /> : null}
              </div>
            </AdminCard>
          </div>
        </div>

        <AdminCard className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="admin-section-label">Disclosure history</p><h2 className="mt-1 font-black">Rejected, used and expired requests</h2></div>
            <EyeOff className="size-5 text-muted-foreground" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {history.map((item) => <DisclosureRequestCard key={item.id} item={item} currentUserId={currentUserId} onChanged={refresh} historical />)}
          </div>
          {!history.length ? <EmptyState text="No historical sealed identity disclosure requests yet." /> : null}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function DisclosureRequestCard({
  item,
  currentUserId,
  onChanged,
  historical = false,
}: {
  item: IdentityDisclosureRequest;
  currentUserId: string | null;
  onChanged: () => Promise<unknown>;
  historical?: boolean;
}) {
  const [decisionReason, setDecisionReason] = useState("");
  const [revealed, setRevealed] = useState<RevealedSealedIdentity | null>(null);
  const isRequester = Boolean(currentUserId && item.requested_by === currentUserId);
  const expiresAt = item.approval_expires_at ? new Date(item.approval_expires_at) : null;
  const expiredByClock = Boolean(expiresAt && expiresAt.getTime() <= Date.now());

  const decisionMutation = useMutation({
    mutationFn: (approve: boolean) => decideSealedIdentityDisclosure(item.id, approve, decisionReason),
    onSuccess: async (result) => {
      setDecisionReason("");
      await onChanged();
      toast.success(result.status === "approved" ? "Disclosure approved for 30 minutes" : "Disclosure request rejected");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not decide request"),
  });

  const revealMutation = useMutation({
    mutationFn: () => revealSealedIdentity(item.id),
    onSuccess: async (identity) => {
      setRevealed(identity);
      await onChanged();
      toast.success("Sealed identity revealed once and audit event recorded");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reveal sealed identity"),
  });

  const statusTone = item.status === "pending" ? "attention" : item.status === "approved" ? "blocked" : item.status === "used" ? "ready" : "neutral";

  return (
    <article className={cn("rounded-xl border p-4", historical ? "border-white/[0.07] bg-white/[0.015]" : "border-white/[0.08] bg-white/[0.025]")}> 
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{item.case_code}</span><span className="text-[9px] uppercase text-muted-foreground">{item.priority}</span></div>
          <p className="mt-2 text-sm font-black">{item.case_summary}</p>
        </div>
        <AdminStatus tone={statusTone as any}>{expiredByClock && item.status === "approved" ? "expired by clock" : item.status}</AdminStatus>
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/10 p-3">
        <p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Requested because</p>
        <p className="mt-1 text-xs leading-5 text-slate-200/80">{item.reason}</p>
      </div>
      <div className="mt-3 grid gap-1 text-[9px] text-muted-foreground sm:grid-cols-2">
        <span>Requested {new Date(item.requested_at).toLocaleString()}</span>
        <span>{isRequester ? "You are the requester" : "Requested by another organizer"}</span>
      </div>

      {item.decision_reason ? (
        <div className="mt-3 rounded-lg border border-white/[0.06] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Decision reason</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{item.decision_reason}</p></div>
      ) : null}

      {item.status === "pending" ? (
        <div className="mt-4">
          {isRequester ? (
            <div className="rounded-lg border border-sky-200/10 bg-sky-200/[0.035] p-3 text-[10px] leading-5 text-sky-50/70"><UserRoundCheck className="mr-1.5 inline size-3.5" />A different organizer must approve or reject this request. You cannot decide your own request.</div>
          ) : (
            <>
              <textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={3} placeholder="Record why disclosure should or should not be permitted…" className="admin-input w-full resize-y" />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={decisionReason.trim().length < 20 || decisionMutation.isPending} onClick={() => decisionMutation.mutate(true)} className="admin-action-primary"><CheckCircle2 className="size-4" />Approve 30 min</button>
                <button type="button" disabled={decisionReason.trim().length < 20 || decisionMutation.isPending} onClick={() => decisionMutation.mutate(false)} className="admin-action-secondary text-rose-100"><XCircle className="size-4" />Reject</button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {item.status === "approved" ? (
        <div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3">
          <div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" /><div><p className="text-xs font-black text-amber-50">One-time disclosure window</p><p className="mt-1 text-[10px] leading-5 text-amber-50/70">Expires {expiresAt ? expiresAt.toLocaleString() : "unknown"}. Only the organizer who created the request may use it.</p></div></div>
          {isRequester && !expiredByClock ? (
            <button type="button" disabled={revealMutation.isPending} onClick={() => revealMutation.mutate()} className="admin-action-secondary mt-3 text-amber-50"><Eye className="size-4" />{revealMutation.isPending ? "Revealing…" : "Reveal sealed identity once"}</button>
          ) : null}
          {!isRequester ? <p className="mt-2 text-[10px] text-muted-foreground">You approved or can observe this window, but only the original requester can use it.</p> : null}
          {expiredByClock ? <p className="mt-2 text-[10px] text-rose-100">This approval has expired and cannot be used. A new break-glass request is required.</p> : null}
        </div>
      ) : null}

      {revealed ? (
        <div className="mt-4 rounded-xl border border-rose-200/16 bg-rose-200/[0.05] p-4">
          <div className="flex items-center gap-2"><Eye className="size-4 text-rose-200" /><p className="text-[9px] font-black uppercase tracking-[.12em] text-rose-100">Identity revealed in this browser session</p></div>
          <p className="mt-3 text-sm font-black">{revealed.email ?? "Email unavailable"}</p>
          <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">User {revealed.user_id}</p>
          <p className="mt-3 text-[10px] leading-5 text-rose-50/70">This value is not written back into the case UI model. The break-glass request is now used and cannot reveal the identity again.</p>
        </div>
      ) : null}

      <div className="mt-4">
        <Link to="/admin/integrity-case/$caseId" params={{ caseId: item.case_id }} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-sky-200 hover:text-white">Open case <ArrowRight className="size-3" /></Link>
      </div>
    </article>
  );
}

function SelectedCasePreview({ item }: { item: SealedIntegrityCase | null }) {
  if (!item) return null;
  const category = getIntegrityCategory(item.category);
  return (
    <div className="mt-3 rounded-xl border border-emerald-200/10 bg-emerald-200/[0.03] p-3">
      <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{item.public_code}</span><span className="text-[9px] uppercase text-muted-foreground">{item.priority}</span></div>
      <p className="mt-2 text-xs font-black">{item.summary}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{category.label} · {item.status.replaceAll("_", " ")}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/[0.08] p-5 text-center text-xs text-muted-foreground">{text}</div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "info" | "attention" | "blocked" | "ready" | "neutral" }) {
  return <AdminCard className="!p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={tone}>{value ? "Live" : "Clear"}</AdminStatus></div></AdminCard>;
}
