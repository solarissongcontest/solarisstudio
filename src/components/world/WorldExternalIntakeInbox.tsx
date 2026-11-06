import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ClipboardCheck, FileText, ShieldAlert } from "lucide-react";
import {
  introduceExternalMeasure, listExternalIntakes, loadExternalIntakeOptions,
  measureTypes, validateExternalIntroduction,
  type ExternalInstitution, type ExternalIntake, type ExternalIntroductionInput,
  type ExternalReceipt,
} from "@/lib/world-measure-external-intake";

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    switch (String(error.code)) {
      case "42501": return "Your current external-intake authority was rejected.";
      case "40001": return "This intake has changed or was already introduced. Refresh it before acting.";
      case "23514": return "The sponsor membership, institution or agenda organ is no longer eligible.";
      case "22023": return "The measure type or canonical topic code is invalid.";
      case "25006": return "The platform has disabled formal institutional operations.";
    }
  }
  return "The outcome is uncertain. Preserve and retry the same operation, not a new introduction.";
}
const known = (error: unknown) => Boolean(error && typeof error === "object" &&
  "code" in error && ["42501","40001","23514","22023","25006"].includes(String(error.code)));

export function WorldExternalIntakeInbox({
  actorId, institution,
}: { actorId: string; institution: ExternalInstitution }) {
  const cache = useQueryClient();
  const inbox = useQuery({
    queryKey: ["world","measures","external","private","inbox",actorId,institution.id],
    queryFn: () => listExternalIntakes(institution.id),
    staleTime: 0, gcTime: 0, refetchOnMount: "always", retry: false,
  });
  const options = useQuery({
    queryKey: ["world","measures","external","private","options",actorId,institution.id],
    queryFn: () => loadExternalIntakeOptions(institution.id),
    retry: false, staleTime: 0, gcTime: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [organId, setOrganId] = useState("");
  const [measureType, setMeasureType] = useState("proposal");
  const [categoryCode, setCategoryCode] = useState("");
  const [review, setReview] = useState<ExternalIntroductionInput | null>(null);
  const uncertain = useRef<ExternalIntroductionInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ExternalReceipt | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const selected = (inbox.data ?? []).find(row => row.id===selectedId) ?? null;
  const organ = options.data?.organs.find(row => row.id===organId)
    ?? options.data?.organs[0] ?? null;
  const category = options.data?.categories.find(row=>row.code===categoryCode) ?? null;
  const frozen = busy || !!review || !!uncertain.current || !!receipt;

  function prepare(item: ExternalIntake) {
    if (frozen || item.status!=="received" || !organ || !options.data) return;
    if (institution.slug === "guard" && !category) {
      setProblem("A real registered GUARD topic code is mandatory before introduction.");
      return;
    }
    const action: ExternalIntroductionInput = {
      intakeId:item.id,organId:organ.id,measureType,
      categoryCode:category?.code ?? null,
      expectedRevision:item.revision,operationId:crypto.randomUUID(),
    };
    const error=validateExternalIntroduction(action);
    if (error) { setProblem(error); return; }
    setProblem(null);
    setSelectedId(item.id);
    setReview(action);
  }
  async function execute(action: ExternalIntroductionInput) {
    if (busy) return;
    uncertain.current=action;
    setBusy(true);setReview(null);setProblem(null);
    try {
      const answer=await introduceExternalMeasure(action);
      setReceipt(answer);
      uncertain.current=null;
      await cache.invalidateQueries({
        queryKey:["world","measures","external","private","inbox",actorId,institution.id],
      });
    } catch (cause) {
      setProblem(errorText(cause));
      if(known(cause)) {
        uncertain.current=null;
        await cache.invalidateQueries({
          queryKey:["world","measures","external","private","inbox",actorId,institution.id],
        });
      }
    } finally { setBusy(false); }
  }
  return <div className="mt-5">
    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
      Restricted original messages. A later formal review and unique identifier
      are still required after introduction; neither action adopts a measure.
    </p>
    {(inbox.isPending || options.isPending) ? <p role="status" className="mt-5">
      Verifying private source records and institution options…
    </p> : (inbox.isError || options.isError || inbox.data===null || !options.data) ?
      <div role="alert" className="mt-5">
        <p className="text-sm">Private records are unavailable or your permission was revoked.</p>
        <button className="mt-2 min-h-11 rounded-lg border px-4 text-sm" type="button"
          onClick={()=>{void inbox.refetch();void options.refetch();}}>Recheck access</button>
      </div> :
      inbox.data.length===0 ? <p className="mt-6 border-t border-border py-7 text-sm text-muted-foreground">
        No external messages have been received for this institution.
      </p> : <>
        <p className="mt-5 text-xs text-muted-foreground">
          Latest {inbox.data.length} restricted records (maximum 30)
        </p>
        <ol className="mt-3 divide-y divide-border">
          {inbox.data.map(item=><li key={item.id} className="py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{item.countryCode}</span><span aria-hidden="true">·</span>
              <span className="capitalize">{item.sourceChannel}</span><span aria-hidden="true">·</span>
              <span>{item.receivedAt.slice(0,10)}</span><span aria-hidden="true">·</span>
              <span>{item.status}</span>
            </div>
            <h3 className="mt-2 font-semibold">{item.rawTitle}</h3>
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer text-sm font-medium">
                Read restricted original and source
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{item.rawText}</p>
              {item.sourceReference && <p className="mt-3 break-all text-xs">
                Source reference: {item.sourceReference}
              </p>}
              {item.sourceNote && <p className="mt-2 whitespace-pre-wrap text-xs">
                Provenance note: {item.sourceNote}
              </p>}
              <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
                SHA-256: {item.contentHash}
              </p>
            </details>
            {item.introducedMeasureId ? <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" aria-hidden="true"/>
              Formally submitted, awaiting normal procedural processing.
              <Link to="/world/measures/$measureId/manage"
                params={{measureId:item.introducedMeasureId}}
                className="inline-flex min-h-11 items-center underline">
                Manage formal proposal
              </Link>
            </p> :
              <button type="button"
                disabled={frozen || !options.data || options.data.organs.length===0}
                onClick={()=>{setSelectedId(item.id);setOrganId("");setProblem(null);setReceipt(null);}}
                className="mt-3 min-h-11 rounded-lg border px-4 text-sm font-medium disabled:opacity-40">
                Prepare formal introduction
              </button>}
            {selectedId===item.id && item.status==="received" && !receipt &&
              <section className="mt-4 rounded-xl border p-4" aria-label="Formal introduction options">
                <h4 className="flex items-center gap-2 font-semibold"><FileText className="size-4"/>
                  Introduce as formal proposal
                </h4>
                <p className="mt-2 text-sm text-muted-foreground">
                  The source text becomes a new unpublished formal submitted measure
                  linked to this immutable record. Publication and voting require later approval.
                </p>
                <div className="mt-4 grid gap-3">
                  <label className="block text-sm font-medium">Institutional body
                    <select value={organ?.id??""} disabled={frozen}
                      onChange={e=>setOrganId(e.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
                      {(options.data?.organs??[]).map(row=>
                        <option key={row.id} value={row.id}>{row.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">Measure type
                    <select value={measureType} disabled={frozen}
                      onChange={e=>setMeasureType(e.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
                      {measureTypes.map(([key,label])=><option value={key} key={key}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">Authoritative topic code
                    <select value={category?.code??""} disabled={frozen}
                      onChange={e=>setCategoryCode(e.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
                      <option value="">None{institution.slug==="guard"?" (GUARD requires a real code)":""}</option>
                      {(options.data?.categories??[]).map(row=>
                        <option value={row.code} key={row.code}>{row.code} · {row.label}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={frozen || !organ}
                    onClick={()=>prepare(item)}
                    className="min-h-11 justify-self-start rounded-lg border px-4 text-sm font-semibold">
                    Review formal introduction
                  </button>
                </div>
              </section>}
          </li>)}
        </ol>
      </>}
    {problem && <p role="alert" className="mt-5 rounded-xl border border-destructive/40 p-4 text-sm">
      {problem}
    </p>}
    {review && <section className="mt-6 rounded-xl border border-primary/40 p-5" aria-label="Confirm introduction">
      <h3 className="font-semibold">Confirm separate formal submission</h3>
      <p className="mt-2 text-sm">{selected?.rawTitle}</p>
      <p className="mt-2 text-sm">Measure type: {review.measureType}. Revision: {review.expectedRevision}.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        This creates exactly one ordinary submitted TG7 measure from the recorded source.
        Registration, public release and a legislative vote do NOT happen automatically.
      </p>
      <code className="mt-2 block break-all text-xs">{review.operationId}</code>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={()=>void execute(review)}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Confirm formal introduction
        </button>
        <button type="button" disabled={busy} onClick={()=>setReview(null)}
          className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button>
      </div>
    </section>}
    {uncertain.current && <section role="alert" className="mt-6 rounded-xl border p-5">
      <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4"/>
        Introduction acknowledgement uncertain
      </h3>
      <p className="mt-2 text-sm">Do not introduce a second proposal. Reconcile the identical operation.</p>
      <code className="mt-2 block break-all text-xs">{uncertain.current.operationId}</code>
      <button type="button" disabled={busy} onClick={()=>void execute(uncertain.current!)}
        className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Retry exact operation</button>
    </section>}
    {receipt && <section role="status" className="mt-6 rounded-xl border border-primary/40 p-5">
      <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4"/>
        Formal measure submitted for procedural review
      </h3>
      <p className="mt-2 text-sm">Intake revision {receipt.revision} · {receipt.status}.
        {receipt.replayed?" Existing operation reconciled.":""}
      </p>
      <p className="mt-2 break-all font-mono text-xs">Operation: {receipt.operationId}</p>
      {receipt.measureId && <Link to="/world/measures/$measureId/manage"
        params={{measureId:receipt.measureId}}
        className="mt-4 inline-flex min-h-11 items-center underline">
        Continue to normal TG7 review
      </Link>}
      <button type="button" onClick={()=>{setReceipt(null);setSelectedId(null);}}
        className="mt-4 ml-3 min-h-11 rounded-lg border px-4 text-sm">
        Return to inbox
      </button>
    </section>}
  </div>;
}
