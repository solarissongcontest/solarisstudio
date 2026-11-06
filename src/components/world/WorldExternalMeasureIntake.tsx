import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, FileClock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listExternalIntakeInstitutions, loadExternalIntakeOptions,
  recordExternalIntake, validateExternalRecord,
  type ExternalReceipt, type ExternalRecordInput, type ExternalInstitution,
} from "@/lib/world-measure-external-intake";
import { WorldExternalIntakeInbox } from "@/components/world/WorldExternalIntakeInbox";

function knownRejection(value: unknown) {
  return Boolean(value && typeof value === "object" && "code" in value &&
    ["42501","23514","23503","22023","40001","25006"].includes(String(value.code)));
}
export function externalIntakeError(value: unknown): string {
  if (value && typeof value === "object" && "code" in value) {
    switch (String(value.code)) {
      case "42501": return "Your institutional permission was denied. Recheck your current account and assigned office.";
      case "23514": return "The organization, sponsoring membership or intake state has changed.";
      case "23503": return "The country or institutional body is no longer valid.";
      case "22023": return "The received message or category was rejected by server validation.";
      case "40001": return "Another officer changed this intake. Refresh before taking a new action.";
      case "25006": return "Official institutional operations are temporarily unavailable.";
    }
  }
  return "The acknowledgement is uncertain. Retry the exact operation ID rather than recording a duplicate.";
}
function usePrivateActor() {
  const client = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const idRef = useRef<string | null>(null);
  useEffect(() => {
    let mounted = true;
    let sessionEvent = false;
    const apply = (next: string | null) => {
      if (!mounted) return;
      if (idRef.current !== next) {
        idRef.current = next;
        client.removeQueries({ queryKey: ["world","measures","external","private"] });
        setGeneration((n) => n + 1);
      }
      setId(next);
      setReady(true);
    };
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!sessionEvent) apply(error ? null : (data.user?.id ?? null));
    }).catch(() => { if (!sessionEvent) apply(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionEvent = true;
      apply(session?.user.id ?? null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [client]);
  return { id, ready, generation, current: idRef };
}

function RecordExternalForm({ institution, actor }: {
  institution: ExternalInstitution; actor: ReturnType<typeof usePrivateActor>;
}) {
  const cache = useQueryClient();
  const options = useQuery({
    queryKey: ["world","measures","external","private","options",actor.id,institution.id],
    queryFn: () => loadExternalIntakeOptions(institution.id),
    enabled: actor.ready && Boolean(actor.id), retry: false, staleTime: 0, gcTime: 0,
  });
  const [countryId, setCountryId] = useState("");
  const [channel, setChannel] = useState<"dm"|"instagram"|"other">("dm");
  const [sourceReference, setSourceReference] = useState("");
  const [rawTitle, setRawTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [review, setReview] = useState<ExternalRecordInput | null>(null);
  const uncertain = useRef<ExternalRecordInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ExternalReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = options.data?.countries.find(c=>c.id===countryId)
    ?? options.data?.countries[0] ?? null;
  const frozen = busy || Boolean(review) || Boolean(uncertain.current) || Boolean(receipt);
  function prepare(e: FormEvent) {
    e.preventDefault();
    if (frozen || !actor.id || !country || !options.data) {
      setError("Verify current institution access and the real submitting country.");
      return;
    }
    const next: ExternalRecordInput = {
      organizationId: institution.id, countryId: country.id, sourceChannel: channel,
      sourceReference, rawTitle, rawText, sourceNote, operationId: crypto.randomUUID(),
    };
    const problem = validateExternalRecord(next);
    if (problem) { setError(problem); return; }
    setError(null);
    setReview(next);
  }
  async function execute(action: ExternalRecordInput) {
    if (busy || !actor.id) return;
    const signedIn = actor.id;
    uncertain.current = action;
    setReview(null); setBusy(true); setError(null);
    try {
      const result = await recordExternalIntake(action);
      if (actor.current.current !== signedIn) return;
      setReceipt(result);
      uncertain.current = null;
      await cache.invalidateQueries({
        queryKey: ["world","measures","external","private","inbox",signedIn,institution.id],
      });
    } catch (cause) {
      if (actor.current.current !== signedIn) return;
      setError(externalIntakeError(cause));
      if (knownRejection(cause)) {
        uncertain.current = null;
        await cache.invalidateQueries({
          queryKey: ["world","measures","external","private","inbox",signedIn,institution.id],
        });
      }
    } finally {
      if (actor.current.current === signedIn) setBusy(false);
    }
  }
  return <section className="mt-7 border-t border-border pt-6" aria-labelledby="external-record-heading">
    <h2 id="external-record-heading" className="text-xl font-semibold">Record external message</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Preserve the actual message and its source before any formal introduction.
      Recording does not register, publish, approve, vote on or enact a proposal.
      File attachments are not uploaded by this form.
    </p>
    {options.isPending ? <p role="status" className="mt-4">Verifying institutional intake options…</p> :
      options.isError || !options.data ? <div role="alert" className="mt-5 text-sm">
        You cannot access the authorized country and body choices.
        <button type="button" className="ml-2 underline" onClick={() => void options.refetch()}>Retry</button>
      </div> : null}
    {error && <p role="alert" className="mt-5 rounded-lg border border-destructive/50 p-4 text-sm">{error}</p>}
    {receipt && <div role="status" className="mt-5 rounded-xl border border-primary/40 p-4">
      <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-5"/> Message saved privately</h3>
      <p className="mt-2 text-sm">Status: {receipt.status}. This is not yet a formal measure.</p>
      <p className="mt-2 break-all font-mono text-xs">Operation: {receipt.operationId}</p>
      <p className="mt-2 break-all font-mono text-xs">Source hash: {receipt.contentHash}</p>
      <button type="button" onClick={() => {
        setReceipt(null);setSourceReference("");setRawTitle("");setRawText("");setSourceNote("");
      }} className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Record another source</button>
    </div>}
    {review && <section className="mt-5 rounded-xl border border-primary/40 p-5" aria-label="Confirm external intake">
      <h3 className="text-lg font-semibold">Confirm provenance recording</h3>
      <p className="mt-2 text-sm">{institution.shortName} · {country?.name} · {review.sourceChannel}</p>
      <p className="mt-2 text-sm font-medium">{review.rawTitle}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        An immutable private record will be created. Only a separate authorized
        introduction can make this a formal submitted proposal.
      </p>
      <code className="mt-2 block break-all text-xs">{review.operationId}</code>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void execute(review)}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Confirm official receipt
        </button>
        <button type="button" disabled={busy} onClick={() => setReview(null)}
          className="min-h-11 rounded-lg border px-4 text-sm">Return to editor</button>
      </div>
    </section>}
    {uncertain.current && <section role="alert" className="mt-5 rounded-xl border p-5">
      <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4"/>
        Acknowledgement uncertain
      </h3>
      <p className="mt-2 text-sm">The message might already be recorded.
        Retry exactly this operation, never a new submission.</p>
      <code className="mt-2 block break-all text-xs">{uncertain.current.operationId}</code>
      <button type="button" disabled={busy} onClick={() => void execute(uncertain.current!)}
        className="mt-4 min-h-11 rounded-lg border px-4 text-sm">Reconcile same operation</button>
    </section>}
    <form className="mt-6 grid gap-5" onSubmit={prepare}>
      <label className="block text-sm font-medium">Submitting country
        <select value={country?.id ?? ""} disabled={frozen || !options.data}
          onChange={e => setCountryId(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          {(options.data?.countries ?? []).map(c =>
            <option value={c.id} key={c.id}>{c.name} · {c.shortCode}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Original channel
        <select value={channel} disabled={frozen} onChange={e=>setChannel(e.target.value as typeof channel)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          <option value="dm">Direct message</option>
          <option value="instagram">Instagram</option>
          <option value="other">Other accepted channel</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Source reference (optional)
        <input value={sourceReference} maxLength={500} disabled={frozen}
          onChange={e=>setSourceReference(e.target.value)}
          placeholder="Conversation reference, date or verified link"
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"/>
      </label>
      <label className="block text-sm font-medium">Exact received title
        <input value={rawTitle} required maxLength={180} disabled={frozen}
          onChange={e=>setRawTitle(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"/>
      </label>
      <label className="block text-sm font-medium">Received proposal text
        <textarea value={rawText} required maxLength={25000} rows={10} disabled={frozen}
          onChange={e=>setRawText(e.target.value)}
          className="mt-2 w-full rounded-lg border bg-background p-3"/>
      </label>
      <label className="block text-sm font-medium">Provenance note (optional)
        <textarea value={sourceNote} rows={3} maxLength={2000} disabled={frozen}
          onChange={e=>setSourceNote(e.target.value)}
          className="mt-2 w-full rounded-lg border bg-background p-3"/>
      </label>
      <button type="submit" disabled={frozen || !options.data || !country}
        className="min-h-11 justify-self-start rounded-lg border px-5 text-sm font-semibold disabled:opacity-40">
        Review intake receipt
      </button>
    </form>
  </section>;
}

export function WorldExternalIntakeWorkspace() {
  const actor = usePrivateActor();
  const institutions = useQuery({
    queryKey: ["world","measures","external","private","institutions",actor.id],
    queryFn: listExternalIntakeInstitutions,
    enabled: actor.ready && Boolean(actor.id), retry: false, staleTime: 0, gcTime: 0,
  });
  const [selectedId, setSelectedId] = useState("");
  const institution = institutions.data?.find(o=>o.id===selectedId)
    ?? institutions.data?.[0] ?? null;
  return <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <Link to="/world/measures" className="inline-flex min-h-11 items-center gap-2 text-sm">
      <ArrowLeft className="size-4"/> Published measures
    </Link>
    <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
      Terra Solaris · Restricted institutional archive
    </p>
    <h1 className="mt-2 text-3xl font-semibold">External proposal intake</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">
      Authorized officers record actual external submissions and independently
      introduce eligible messages into the existing formal measure workflow.
    </p>
    {!actor.ready ? <p role="status" className="mt-6">Verifying your account…</p> :
      !actor.id ? <p role="status" className="mt-6">Sign in as an authorized institutional officer.</p> : null}
    {institutions.isPending && actor.id ? <p role="status" className="mt-6">Checking private institutional permissions…</p> :
      institutions.isError ? <div role="alert" className="mt-6 text-sm">
        Institutional access could not be confirmed.
        <button type="button" className="ml-2 underline" onClick={()=>void institutions.refetch()}>Retry</button>
      </div> :
      institutions.data && institutions.data.length===0 ? <p role="status" className="mt-6">
        No current external-intake authority is assigned to this account.
      </p> : null}
    {institution && actor.id ? <>
      <label className="mt-7 block max-w-md text-sm font-medium">
        Institution you can manage
        <select value={institution.id}
          onChange={e=>setSelectedId(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          {(institutions.data ?? []).map(o=>
            <option key={o.id} value={o.id}>{o.shortName}</option>)}
        </select>
      </label>
      <div key={actor.id+":"+actor.generation+":"+institution.id}>
        <RecordExternalForm actor={actor} institution={institution}/>
        <section className="mt-10 border-t border-border pt-7" aria-label="Private source history">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FileClock className="size-5"/> Previously received messages
          </h2>
          <WorldExternalIntakeInbox actorId={actor.id} institution={institution}/>
        </section>
      </div>
    </> : null}
  </main>;
}
