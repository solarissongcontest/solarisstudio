import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Gavel, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  getProtectedIntegrityResolution,
  submitProtectedIntegrityAppeal,
  type IntegritySanctionRecord,
} from "@/lib/integrity-portal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/integrity/appeal/$caseId")({
  head: () => ({
    meta: [
      { title: "Appeal Integrity Decision — Solaris" },
      { name: "description", content: "Review a reporter-visible Integrity sanction and submit an appeal within the applicable SSC appeal window." },
    ],
  }),
  component: ProtectedAppealPage,
});

function ProtectedAppealPage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const resolution = useQuery({
    queryKey: ["reporter-integrity-resolution", caseId],
    queryFn: () => getProtectedIntegrityResolution(caseId),
    retry: 1,
  });
  const [selectedSanctionId, setSelectedSanctionId] = useState("");
  const [grounds, setGrounds] = useState("");

  const mutation = useMutation({
    mutationFn: () => submitProtectedIntegrityAppeal(caseId, selectedSanctionId, grounds),
    onSuccess: async (result) => {
      setGrounds("");
      await queryClient.invalidateQueries({ queryKey: ["reporter-integrity-resolution", caseId] });
      toast.success(result.was_timely ? "Appeal submitted" : "Appeal recorded as late");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not submit appeal"),
  });

  const data = resolution.data;
  const appealBySanction = new Map((data?.appeals ?? []).map((appeal) => [appeal.sanction_id, appeal]));
  const appealable = (data?.sanctions ?? []).filter((sanction) => sanction.status === "active" && !appealBySanction.has(sanction.id));
  const selected = appealable.find((sanction) => sanction.id === selectedSanctionId) ?? appealable[0] ?? null;

  if (resolution.isLoading) {
    return <AppShell><div className="grid min-h-[55vh] place-items-center"><RefreshCw className="size-6 animate-spin text-sky-200" /></div></AppShell>;
  }

  if (resolution.isError) {
    return <AppShell><div className="mx-auto max-w-2xl py-10"><div className="rounded-[1.6rem] border border-rose-200/15 bg-rose-200/[0.04] p-6"><AlertTriangle className="size-6 text-rose-200"/><h1 className="mt-4 text-2xl font-black">This protected case is not available</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with the Solaris account that owns the sealed or confidential case, then return here.</p><Link to="/integrity" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-sky-200"><ArrowLeft className="size-4"/>Trust & Integrity</Link></div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <Link to="/integrity" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5"/>Trust & Integrity</Link>
        <section className="mt-5 rounded-[2rem] border border-amber-200/14 bg-[linear-gradient(145deg,rgba(83,58,18,.28),rgba(5,19,42,.96))] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-200/70">APPEAL</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">Challenge an Integrity sanction</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">SSC normally allows 48 hours from the sanction decision. Your appeal becomes a separate record and is reviewed by someone other than the original finding author and sanction decision-maker.</p></div><Gavel className="size-7 shrink-0 text-amber-200"/></div>
        </section>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_.8fr]">
          <section className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5">
            <h2 className="font-black">Reporter-visible sanctions</h2>
            <div className="mt-4 space-y-3">{(data?.sanctions ?? []).map((sanction) => <SanctionCard key={sanction.id} sanction={sanction} appeal={appealBySanction.get(sanction.id)} selected={selected?.id === sanction.id} onSelect={() => { if (sanction.status === "active" && !appealBySanction.has(sanction.id)) setSelectedSanctionId(sanction.id); }}/>)}</div>
            {!data?.sanctions.length ? <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] p-5 text-sm text-muted-foreground">No reporter-visible sanction has been recorded for this case.</p> : null}
          </section>

          <section className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-200"/><h2 className="font-black">Submit appeal</h2></div>
            {selected ? <>
              <div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-amber-200">Selected decision</p><p className="mt-1 text-sm font-black">Level {selected.final_level} · {selected.sanction_label}</p><p className="mt-1 text-[10px] text-muted-foreground">Deadline {new Date(selected.appeal_deadline).toLocaleString()}</p></div>
              <label className="mt-4 block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Appeal grounds</span><textarea value={grounds} onChange={(event) => setGrounds(event.target.value)} rows={8} placeholder="Explain what you believe was incorrect in the finding, sanction level, evidence assessment or rule application." className="mt-2 w-full rounded-xl border p-3 text-sm leading-6"/></label>
              <p className="mt-2 text-[10px] leading-5 text-muted-foreground">The appeal does not erase the original decision. If the outcome changes, the revised sanction is linked to the original in the audit history.</p>
              <button type="button" disabled={grounds.trim().length < 20 || mutation.isPending} onClick={() => mutation.mutate()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 text-sm font-black text-slate-950 disabled:opacity-40"><Gavel className="size-4"/>{mutation.isPending ? "Submitting…" : "Submit appeal"}</button>
            </> : <div className="mt-4 rounded-xl border border-emerald-200/12 bg-emerald-200/[0.035] p-4"><CheckCircle2 className="size-5 text-emerald-200"/><p className="mt-2 text-sm font-bold">No new appeal is available</p><p className="mt-1 text-xs leading-5 text-muted-foreground">There may be no active sanction, or an appeal has already been submitted for every active sanction.</p></div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function SanctionCard({ sanction, appeal, selected, onSelect }: { sanction: IntegritySanctionRecord; appeal?: { status: string; was_timely: boolean; decision_rationale: string | null }; selected: boolean; onSelect: () => void }) {
  const appealable = sanction.status === "active" && !appeal;
  return <button type="button" onClick={onSelect} disabled={!appealable} className={cn("w-full rounded-xl border p-4 text-left", selected ? "border-amber-200/22 bg-amber-200/[0.06]" : "border-white/[0.07] bg-black/10", appealable ? "cursor-pointer" : "cursor-default")}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">Level {sanction.final_level} · {sanction.sanction_label}</p><p className="mt-1 text-[9px] uppercase tracking-[.1em] text-muted-foreground">{sanction.status.replaceAll("_", " ")}</p></div>{appeal ? <span className="rounded-full border border-sky-200/12 bg-sky-200/[0.05] px-2 py-1 text-[9px] font-black uppercase text-sky-100">Appeal {appeal.status.replaceAll("_", " ")}</span> : null}</div><p className="mt-3 text-xs leading-5 text-muted-foreground">{sanction.rationale}</p>{appeal?.decision_rationale ? <div className="mt-3 rounded-lg border border-emerald-200/10 bg-emerald-200/[0.03] p-2.5 text-[10px] leading-5 text-emerald-50/75">Appeal decision: {appeal.decision_rationale}</div> : null}</button>;
}
