import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Gavel, KeyRound, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  getAnonymousIntegrityResolution,
  submitAnonymousIntegrityAppeal,
  type IntegrityResolutionSnapshot,
} from "@/lib/integrity-portal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/integrity/anonymous-appeal")({
  head: () => ({
    meta: [
      { title: "Anonymous Integrity Appeal — Solaris" },
      { name: "description", content: "Use an anonymous case code and recovery key to review reporter-visible sanctions and submit an SSC Integrity appeal." },
    ],
  }),
  component: AnonymousAppealPage,
});

function AnonymousAppealPage() {
  const [caseCode, setCaseCode] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [resolution, setResolution] = useState<IntegrityResolutionSnapshot | null>(null);
  const [selectedSanctionId, setSelectedSanctionId] = useState("");
  const [grounds, setGrounds] = useState("");

  const load = useMutation({
    mutationFn: () => getAnonymousIntegrityResolution(caseCode, recoveryKey),
    onSuccess: (data) => {
      setResolution(data);
      const appealed = new Set(data.appeals.map((appeal) => appeal.sanction_id));
      setSelectedSanctionId(data.sanctions.find((sanction) => sanction.status === "active" && !appealed.has(sanction.id))?.id ?? "");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not open anonymous case"),
  });

  const appeal = useMutation({
    mutationFn: () => submitAnonymousIntegrityAppeal(caseCode, recoveryKey, selectedSanctionId, grounds),
    onSuccess: async (result) => {
      toast.success(result.was_timely ? "Appeal submitted" : "Appeal recorded as late");
      setGrounds("");
      const refreshed = await getAnonymousIntegrityResolution(caseCode, recoveryKey);
      setResolution(refreshed);
      const appealed = new Set(refreshed.appeals.map((item) => item.sanction_id));
      setSelectedSanctionId(refreshed.sanctions.find((sanction) => sanction.status === "active" && !appealed.has(sanction.id))?.id ?? "");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not submit appeal"),
  });

  const appealed = new Set((resolution?.appeals ?? []).map((item) => item.sanction_id));
  const selected = resolution?.sanctions.find((sanction) => sanction.id === selectedSanctionId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <Link to="/integrity" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5"/>Trust & Integrity</Link>
        <section className="mt-5 rounded-[2rem] border border-emerald-200/14 bg-[linear-gradient(145deg,rgba(14,72,62,.25),rgba(5,19,42,.96))] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200/70">FULLY ANONYMOUS APPEAL</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">Recover the case, then appeal the decision</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">The case code and recovery key authenticate this request. They do not attach a Solaris account to the fully anonymous case.</p></div><KeyRound className="size-7 shrink-0 text-emerald-200"/></div>
        </section>

        <section className="mt-5 rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5">
          <div className="grid gap-3 sm:grid-cols-2"><label><span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Case code</span><input value={caseCode} onChange={(event) => setCaseCode(event.target.value)} placeholder="AR-…" className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm"/></label><label><span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Recovery key</span><input value={recoveryKey} onChange={(event) => setRecoveryKey(event.target.value)} placeholder="XXXX-XXXX-…" className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm"/></label></div>
          <button type="button" disabled={caseCode.trim().length < 5 || recoveryKey.trim().length < 12 || load.isPending} onClick={() => load.mutate()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-black text-slate-950 disabled:opacity-40"><Search className="size-4"/>{load.isPending ? "Opening…" : "Open case decision"}</button>
        </section>

        {resolution ? <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_.8fr]">
          <section className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5"><h2 className="font-black">Sanctions</h2><div className="mt-4 space-y-3">{resolution.sanctions.map((sanction) => { const existing = resolution.appeals.find((item) => item.sanction_id === sanction.id); const selectable = sanction.status === "active" && !existing; return <button key={sanction.id} type="button" disabled={!selectable} onClick={() => setSelectedSanctionId(sanction.id)} className={cn("w-full rounded-xl border p-4 text-left", selectedSanctionId === sanction.id ? "border-amber-200/22 bg-amber-200/[0.06]" : "border-white/[0.07] bg-black/10")}><div className="flex justify-between gap-2"><p className="text-sm font-black">Level {sanction.final_level} · {sanction.sanction_label}</p>{existing ? <span className="text-[9px] font-black uppercase text-sky-200">Appeal {existing.status.replaceAll("_", " ")}</span> : null}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{sanction.rationale}</p><p className="mt-2 text-[9px] text-muted-foreground">Appeal deadline {new Date(sanction.appeal_deadline).toLocaleString()}</p></button>; })}</div>{!resolution.sanctions.length ? <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] p-5 text-sm text-muted-foreground">No reporter-visible sanction has been recorded.</p> : null}</section>
          <section className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5"><div className="flex items-center gap-2"><Gavel className="size-4 text-amber-200"/><h2 className="font-black">Submit appeal</h2></div>{selected && !appealed.has(selected.id) ? <><div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3"><p className="text-sm font-black">Level {selected.final_level} · {selected.sanction_label}</p><p className="mt-1 text-[10px] text-muted-foreground">Deadline {new Date(selected.appeal_deadline).toLocaleString()}</p></div><textarea value={grounds} onChange={(event) => setGrounds(event.target.value)} rows={8} placeholder="Explain why the decision or sanction should be reconsidered." className="mt-4 w-full rounded-xl border p-3 text-sm leading-6"/><button type="button" disabled={grounds.trim().length < 20 || appeal.isPending} onClick={() => appeal.mutate()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 text-sm font-black text-slate-950 disabled:opacity-40"><Gavel className="size-4"/>{appeal.isPending ? "Submitting…" : "Submit anonymous appeal"}</button></> : <div className="mt-4 rounded-xl border border-emerald-200/12 bg-emerald-200/[0.035] p-4"><CheckCircle2 className="size-5 text-emerald-200"/><p className="mt-2 text-sm font-bold">No new appeal is available</p><p className="mt-1 text-xs leading-5 text-muted-foreground">There may be no active sanction, or every active sanction already has an appeal.</p></div>}</section>
        </div> : null}

        <div className="mt-5 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-4 text-xs leading-5 text-amber-50/75"><AlertTriangle className="mr-2 inline size-4"/>Do not share your recovery key. It is the credential for returning to a fully anonymous case.</div>
      </div>
    </AppShell>
  );
}
