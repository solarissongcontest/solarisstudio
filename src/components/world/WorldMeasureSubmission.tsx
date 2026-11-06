import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, ShieldCheck } from "lucide-react";
import {
  getMyWorldControlledCountry, listWorldMeasureCategories, listWorldMeasureOrganizations,
  submitWorldMeasure, validateWorldMeasureSubmit,
  type WorldMeasureReceipt, type WorldMeasureSubmitInput,
} from "@/lib/world-measure-commands";

const options = [
  ["proposal", "Proposal"], ["bill", "Bill"], ["motion", "Motion"],
  ["draft_resolution", "Draft resolution"], ["membership_application", "Membership application"],
  ["membership_expulsion", "Membership expulsion"], ["charter_amendment", "Charter amendment"],
  ["rule_amendment", "Rule amendment"], ["union_recognition", "Union recognition"],
  ["procedural_motion", "Procedural motion"], ["sanction_motion", "Sanction motion"], ["other", "Other"],
] as const;
function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    switch (String(error.code)) {
      case "42501": return "Your current institutional submission authority was rejected. Refresh your access.";
      case "23514": return "Your country no longer meets the institution membership rules.";
      case "23503": return "The selected institution or organ is no longer active.";
      case "22023": return "The server rejected the measure contents or category.";
      case "40001": return "A concurrent institutional change was detected. Reload the authoritative state.";
      case "25006": return "The platform currently blocks new measure submissions.";
    }
  }
  return "Submission status is uncertain. Keep the exact operation ID and retry the same submission, not a new one.";
}
function definitive(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    ["42501", "23514", "23503", "22023", "40001", "25006"].includes(String(error.code)));
}

export function WorldMeasureSubmitPage() {
  const organizations = useQuery({
    queryKey: ["world", "measures", "form-organizations"],
    queryFn: listWorldMeasureOrganizations, retry: false,
  });
  const country = useQuery({
    queryKey: ["world", "measures", "current-controlled-country"],
    queryFn: getMyWorldControlledCountry, retry: false, staleTime: 0,
  });
  const [organizationId, setOrganizationId] = useState("");
  const [organId, setOrganId] = useState("");
  const [type, setType] = useState("proposal");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [fullText, setFullText] = useState("");
  const organization = organizations.data?.find((o) => o.id === organizationId) ??
    organizations.data?.[0] ?? null;
  const organ = organization?.organs.find((o) => o.id === organId) ??
    organization?.organs[0] ?? null;
  const categories = useQuery({
    queryKey: ["world", "measures", "categories", organization?.slug],
    queryFn: () => listWorldMeasureCategories(organization!.slug),
    enabled: Boolean(organization), retry: false,
  });
  const selectedCategory = categories.data?.some((c) => c.code === category) ? category : null;
  const prepared = useRef<WorldMeasureSubmitInput | null>(null);
  const [review, setReview] = useState<WorldMeasureSubmitInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldMeasureReceipt | null>(null);
  const locked = busy || Boolean(prepared.current) || Boolean(review) || Boolean(receipt);

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (prepared.current || review || busy || receipt || !organization || !organ ||
        !country.data || !categories.data || categories.isError) {
      setProblem("Your country, institution and active categories must be verified before submission.");
      return;
    }
    const action: WorldMeasureSubmitInput = {
      organizationId: organization.id, organId: organ.id, sponsorCountryId: country.data,
      measureType: type, title, summary, fullText, categoryCode: selectedCategory,
      operationId: crypto.randomUUID(),
    };
    const invalid = validateWorldMeasureSubmit(action);
    if (invalid) { setProblem(invalid); return; }
    setProblem(null);
    setReview(action);
  }
  async function execute(action: WorldMeasureSubmitInput) {
    if (busy || receipt) return;
    prepared.current = action;
    setBusy(true);
    setProblem(null);
    try {
      setReceipt(await submitWorldMeasure(action));
      setReview(null);
      prepared.current = null;
    } catch (error) {
      setReview(null);
      setProblem(errorMessage(error));
      if (definitive(error)) prepared.current = null;
    } finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-6 sm:pt-9">
    <Link to="/world/measures" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
      <ArrowLeft className="size-4" /> Published measures
    </Link>
    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      Terra Solaris · Official submission
    </p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Submit a measure</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">
      A submission enters procedural review. It is not an enacted decision, public
      proposal, or parliamentary vote until the institution formally registers it.
      The server verifies current country control and membership before accepting it.
    </p>
    {country.isPending ? <p role="status" className="mt-5">Verifying your currently controlled country…</p> :
      country.isError ? <p role="alert" className="mt-5 text-sm">Country authority could not be verified.
        <button type="button" className="ml-2 underline" onClick={() => void country.refetch()}>Retry</button>
      </p> : !country.data ? <p role="status" className="mt-5 rounded-xl border p-5 text-sm">
        Sign in as a current country controller to submit a measure. An institutional
        delegate who is not the controller may need a separate authorized intake workflow.
      </p> : <p className="mt-5 inline-flex items-center gap-2 text-sm">
        <ShieldCheck className="size-4" /> Current country-account control verified
      </p>}
    {problem ? <p role="alert" className="mt-5 rounded-xl border border-destructive/40 p-4 text-sm">
      {problem}
    </p> : null}
    {receipt ? <section role="status" className="mt-6 rounded-xl border border-primary/40 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck className="size-5" /> Submission recorded
      </h2>
      <p className="mt-2 text-sm">Measure submitted for procedural review.
        {receipt.replayed ? " Your original operation was safely reconciled." : ""}
      </p>
      <p className="mt-2 break-all font-mono text-xs">Operation: {receipt.operationId}</p>
      <Link to="/world/measures/$measureId/manage" params={{ measureId: receipt.measureId }}
        className="mt-5 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold">
        Open your submission and receipt
      </Link>
    </section> : null}
    {prepared.current && !receipt ? <section className="mt-6 rounded-xl border p-5" role="alert">
      <h2 className="font-semibold">Submission acknowledgement is uncertain</h2>
      <p className="mt-2 text-sm">The same operation can be retried without creating a duplicate.
        Do not start another submission until its status is resolved.</p>
      <p className="mt-2 break-all font-mono text-xs">{prepared.current.operationId}</p>
      <button type="button" disabled={busy} onClick={() => void execute(prepared.current!)}
        className="mt-4 min-h-11 rounded-lg border px-4 text-sm font-semibold">Retry the exact operation</button>
    </section> : null}
    {review ? <section className="mt-6 rounded-xl border border-primary/40 p-5" aria-labelledby="world-measure-review">
      <h2 id="world-measure-review" className="text-lg font-semibold">Review official submission</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="font-medium">Institution and organ</dt><dd>{organization?.shortName} · {organ?.name}</dd></div>
        <div><dt className="font-medium">Title</dt><dd>{review.title}</dd></div>
        <div><dt className="font-medium">Type</dt><dd className="capitalize">{review.measureType.replaceAll("_", " ")}</dd></div>
        <div><dt className="font-medium">Operation ID</dt><dd className="break-all font-mono text-xs">{review.operationId}</dd></div>
      </dl>
      <p className="mt-4 text-sm">Once submitted, text corrections create immutable new versions.
        The measure remains non-public until procedural registration and publication.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void execute(review)}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Confirm formal submission
        </button>
        <button type="button" disabled={busy} onClick={() => setReview(null)}
          className="min-h-11 rounded-lg border px-4 text-sm">Go back and edit</button>
      </div>
    </section> : null}
    <form onSubmit={prepare} className="mt-8 space-y-5">
      <label className="block text-sm font-medium">Institution
        <select value={organization?.id ?? ""} disabled={locked || organizations.isPending || !country.data}
          onChange={(e) => { setOrganizationId(e.target.value); setOrganId(""); setCategory(""); }}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          {(organizations.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.shortName}</option>)}
        </select>
      </label>
      {organizations.isError && <p role="alert" className="text-sm">
        Institutions could not be loaded. <button type="button" className="underline"
          onClick={() => void organizations.refetch()}>Retry</button>
      </p>}
      <label className="block text-sm font-medium">Institutional body
        <select value={organ?.id ?? ""} disabled={locked || !organization || !country.data}
          onChange={(e) => setOrganId(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          {(organization?.organs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Measure type
        <select value={type} disabled={locked || !country.data} onChange={(e) => setType(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Institutional category
        <select value={selectedCategory ?? ""} disabled={locked || categories.isPending || categories.isError}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
          <option value="">No category</option>
          {(categories.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
        </select>
      </label>
      {categories.isError && <p role="alert" className="text-sm">
        Categories could not be verified. <button type="button" className="underline"
          onClick={() => void categories.refetch()}>Retry</button>
      </p>}
      <label className="block text-sm font-medium">Formal title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180}
          disabled={locked || !country.data} required
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" />
      </label>
      <label className="block text-sm font-medium">Short summary (optional)
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)}
          maxLength={2000} rows={3} disabled={locked || !country.data}
          className="mt-2 w-full rounded-lg border bg-background p-3" />
      </label>
      <label className="block text-sm font-medium">Full formal measure text
        <textarea value={fullText} onChange={(e) => setFullText(e.target.value)}
          maxLength={25000} rows={13} required disabled={locked || !country.data}
          className="mt-2 w-full rounded-lg border bg-background p-3" />
      </label>
      <button type="submit" disabled={locked || !organization || !organ || !country.data ||
          categories.isPending || categories.isError}
        className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        Review submission
      </button>
    </form>
  </main>;
}
