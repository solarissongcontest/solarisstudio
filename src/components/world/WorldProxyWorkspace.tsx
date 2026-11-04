import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { useMyCountryAccount } from "@/lib/country-account";
import {
  decideWorldProxy, getMyProxyHistory, getProxyDirectory,
  getProxyReviewQueue, listProxyOrganizations, newProxyOperation,
  proxyWorldEnabled, requestWorldProxy, revokeWorldProxy,
  type WorldProxyItem,
} from "@/lib/world-proxy-commands";

type Receipt = { proxyId: string; revision: number; operationId: string };
type PreparedAction = {
  title: string;
  summary: string;
  run: () => Promise<Receipt>;
  afterSuccess?: () => void;
};

const knownRejection = (error: unknown): boolean => {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["40001", "23505", "23514", "42501", "22023"].includes(String(error.code));
};
const message = (error: unknown): string => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "The server's response is uncertain. Retry the same operation or reload the official record.";
  }
  switch (String(error.code)) {
    case "40001": return "This proxy changed on another device. Refresh the official records.";
    case "42501": return "Your current institutional or country authority could not be verified.";
    case "23505": return "Another proxy already covers this time window.";
    case "23514": return "The representation, institution or validity period is no longer eligible.";
    case "22023": return "Review the required details and time range.";
    default: return "The request could not be completed. Verify the official state before retrying.";
  }
};
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown time";
}
function titleFor(item: WorldProxyItem): string {
  return item.proxyPersonName + " · " + item.status.replaceAll("_", " ");
}

export function WorldProxyWorkspace() {
  const client = useQueryClient();
  const account = useMyCountryAccount();
  const countryId = account.data?.access.countryStatus === "active"
    ? account.data.access.countryId : null;
  const world = useQuery({
    queryKey: ["world", "proxies", "rollout"],
    queryFn: proxyWorldEnabled, retry: false, staleTime: 60_000,
  });
  const organizations = useQuery({
    queryKey: ["world", "proxies", "organizations"],
    queryFn: listProxyOrganizations, enabled: world.data === true,
    retry: false, staleTime: 60_000,
  });
  const [slug, setSlug] = useState("guard");
  const organization = organizations.data?.find((item) => item.slug === slug)
    ?? organizations.data?.[0] ?? null;
  const directory = useQuery({
    queryKey: ["world", "proxies", "directory", organization?.slug],
    queryFn: () => getProxyDirectory(organization!.slug),
    enabled: Boolean(world.data && organization), retry: false, staleTime: 60_000,
  });
  const history = useQuery({
    queryKey: ["world", "proxies", "history", countryId],
    queryFn: () => getMyProxyHistory(countryId!),
    enabled: Boolean(world.data && countryId), retry: false,
  });
  const review = useQuery({
    queryKey: ["world", "proxies", "review", organization?.id],
    queryFn: () => getProxyReviewQueue(organization!.id),
    enabled: Boolean(world.data && organization), retry: false,
  });

  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const retry = useRef<PreparedAction | null>(null);

  const representative = directory.data?.representatives.find((item) =>
    item.countryId === countryId) ?? null;
  const candidates = directory.data?.representatives.filter((item) =>
    item.personId !== representative?.personId) ?? [];
  const currentHistory = (history.data ?? []).filter((item) =>
    item.organizationId === organization?.id);

  function resetChoice() {
    setPrepared(null);
    // An uncertain submitted mutation must keep its original operation ID.
    // Changing institutions never silently discards its reconciliation path.
    if (retry.current) {
      setError("Resolve the previous uncertain operation before changing institutions.");
      return;
    }
    setError(null);
    setReceipt(null);
    setPersonId("");
  }

  function prepareRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retry.current) {
      setError("Retry the pending operation or reload authoritative state before starting another.");
      return;
    }
    if (!representative || !organization || !countryId) return;
    const chosen = candidates.find((item) => item.personId === personId);
    const start = new Date(from);
    const end = new Date(until);
    const trimmed = reason.trim();
    if (!chosen || !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end.getTime() <= start.getTime() ||
        end.getTime() - start.getTime() > 14 * 24 * 60 * 60 * 1000 ||
        trimmed.length < 5 || trimmed.length > 500) {
      setError("Select a registered representative, a valid period of no more than 14 days, and a reason of 5–500 characters.");
      return;
    }
    const operation = newProxyOperation("request");
    const args = {
      representationId: representative.id, personId: chosen.personId,
      from: start.toISOString(), until: end.toISOString(),
      reason: trimmed, expectedRevision: representative.revision, operation,
    };
    setError(null);
    setPrepared({
      title: "Confirm official proxy request",
      summary: chosen.name + " will act for " + organization.name +
        " between " + formatTime(args.from) + " and " + formatTime(args.until) +
        ". This request does not grant voting authority until formally approved.",
      run: () => requestWorldProxy(args),
      afterSuccess: () => { setPersonId(""); setFrom(""); setUntil(""); setReason(""); },
    });
  }

  function prepareDecision(item: WorldProxyItem, status: "approved" | "rejected") {
    if (retry.current) {
      setError("Resolve the previous uncertain operation before making another decision.");
      return;
    }
    const operation = newProxyOperation(status === "approved" ? "approve" : "reject");
    const args = { proxyId: item.id, status, revision: item.revision, operation };
    setError(null);
    setPrepared({
      title: status === "approved" ? "Approve this acting proxy?" : "Reject this request?",
      summary: titleFor(item) + ". The decision is official and recorded with its own receipt. " +
        (status === "approved" ? "Approval does not create an extra country vote." : "Rejection ends this request."),
      run: () => decideWorldProxy(args),
    });
  }

  function prepareRevocation(item: WorldProxyItem) {
    if (retry.current) {
      setError("Resolve the previous uncertain operation before revoking a proxy.");
      return;
    }
    const reason = revokeReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setError("Provide a revocation reason of 5–500 characters.");
      return;
    }
    const operation = newProxyOperation("revoke");
    const args = { proxyId: item.id, revision: item.revision, reason, operation };
    setError(null);
    setPrepared({
      title: "Immediately revoke this proxy?",
      summary: item.proxyPersonName + " will cease to have acting authority. Historical records are retained.",
      run: () => revokeWorldProxy(args),
      afterSuccess: () => setRevokeReason(""),
    });
  }

  async function execute(action: PreparedAction) {
    if (busy) return;
    retry.current = action;
    setBusy(true);
    setError(null);
    try {
      const next = await action.run();
      retry.current = null;
      setReceipt(next);
      setPrepared(null);
      action.afterSuccess?.();
      await client.invalidateQueries({ queryKey: ["world", "proxies"] });
    } catch (failure) {
      setPrepared(null);
      setError(message(failure));
      if (knownRejection(failure)) {
        retry.current = null;
        await client.invalidateQueries({ queryKey: ["world", "proxies"] });
      }
    } finally {
      setBusy(false);
    }
  }

  if (world.isLoading) return <p role="status" className="p-6">Checking institutional access…</p>;
  if (world.isError || world.data !== true) {
    return <section className="mx-auto max-w-3xl p-6" role="status">
      <h2 className="text-xl font-semibold">Institutional proxies are not available</h2>
      <p className="mt-2 text-muted-foreground">
        The server has not confirmed the Terra Solaris public rollout. No proxy operation can be started.
      </p>
      <button className="mt-4 rounded-lg border px-4 py-2" type="button"
        onClick={() => void world.refetch()}>Recheck availability</button>
    </section>;
  }

  return <main className="mx-auto w-full max-w-4xl space-y-8 pb-16">
    <section className="space-y-3 border-b border-border pb-5">
      <div className="flex items-center gap-3">
        <ShieldCheck aria-hidden="true" className="size-6 text-primary" />
        <h2 className="font-display text-2xl font-semibold">Institutional proxies</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Request a temporary representative, review requests when institutionally authorized,
        or revoke an existing proxy. Every change is checked by the server. A proxy never
        creates a second vote, and a valid time window alone is not voting eligibility.
      </p>
      {organizations.isError ? (
        <p role="alert">Institution list unavailable. <button type="button"
          onClick={() => void organizations.refetch()} className="underline">Retry</button></p>
      ) : organizations.isLoading ? <p role="status">Loading organizations…</p> :
        organizations.data?.length ? <label className="block max-w-sm text-sm font-medium">
          Institution
          <select className="mt-2 w-full rounded-lg border border-border bg-background p-3"
            value={organization?.slug ?? ""} disabled={busy || Boolean(retry.current)} onChange={(event) => {
              setSlug(event.target.value); resetChoice();
            }}>
            {organizations.data.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
        </label> : <p role="status">There are no published institutions available.</p>}
    </section>

    {error && <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm">{error}</p>}
    {receipt && <p role="status" className="flex items-center gap-2 text-sm text-foreground">
      <CheckCircle2 className="size-5" aria-hidden="true" />
      Recorded with operation receipt <code className="break-all">{receipt.operationId}</code>.
    </p>}
    {retry.current && <div className="rounded-lg border border-border p-4">
      <p className="text-sm">The previous operation may have committed. Retry its exact receipt identity, not a new request.</p>
      <button type="button" disabled={busy} className="mt-3 rounded-lg border px-4 py-2"
        onClick={() => void execute(retry.current!)}>Retry the same operation</button>
    </div>}

    {prepared && <section className="rounded-xl border border-primary/50 p-5"
      aria-labelledby="proxy-confirm-title">
      <h3 id="proxy-confirm-title" className="font-semibold">{prepared.title}</h3>
      <p className="mt-2 text-sm leading-relaxed">{prepared.summary}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => void execute(prepared)}>Confirm official action</button>
        <button type="button" disabled={busy} className="rounded-lg border px-4 py-2"
          onClick={() => setPrepared(null)}>Cancel</button>
      </div>
    </section>}

    <section className="space-y-4" aria-labelledby="proxy-request-title">
      <h3 id="proxy-request-title" className="font-display text-xl font-semibold">Request a proxy</h3>
      {account.isLoading || directory.isLoading ? <p role="status">Checking your representation…</p> :
        account.isError || directory.isError ? <div role="alert">Current representation unavailable.
          <button type="button" className="ml-2 underline" onClick={() => {
            void account.refetch(); void directory.refetch();
          }}>Retry</button></div> :
        !representative ? <p className="text-sm text-muted-foreground">
          Your active country does not have a published current voting representative in this institution.
          No request can be submitted until official representation is established.
        </p> : <form onSubmit={prepareRequest} className="max-w-2xl space-y-4">
          <p className="text-sm">Representing country: <strong>{representative.name}</strong>.
            Candidates below are existing public institutional representatives; no identity is invented.
          </p>
          <label className="block text-sm font-medium">Proposed acting person
            <select required value={personId} onChange={(event) => setPersonId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              <option value="">Choose a verified person</option>
              {candidates.map((item) =>
                <option key={item.id} value={item.personId}>{item.name}</option>)}
            </select>
          </label>
          {!candidates.length && <p className="text-sm text-muted-foreground">
            No other published representative is available for selection. The institution must
            first establish a durable identity through the canonical process.
          </p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Valid from
              <input required type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
            </label>
            <label className="block text-sm font-medium">Valid until
              <input required type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
            </label>
          </div>
          <label className="block text-sm font-medium">Reason (5–500 characters)
            <textarea required minLength={5} maxLength={500} value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3} className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
          </label>
          <button type="submit" disabled={busy || !candidates.length || Boolean(prepared) || Boolean(retry.current)}
            className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50">
            Review proxy request
          </button>
        </form>}
    </section>

    <section className="space-y-4 border-t border-border pt-6" aria-labelledby="my-proxy-title">
      <h3 id="my-proxy-title" className="font-display text-xl font-semibold">Your country's proxy history</h3>
      {!countryId ? <p className="text-sm text-muted-foreground">
        Sign in as a current country controller to view your institution's official history.
      </p> : history.isLoading ? <p role="status">Loading private history…</p> :
        history.isError ? <p role="alert">Private history could not be verified.
          <button className="ml-2 underline" type="button" onClick={() => void history.refetch()}>Retry</button></p> :
        !currentHistory.length ? <p className="text-sm text-muted-foreground">No proxy history for this institution.</p> :
          <div className="space-y-3">
            <label className="block max-w-xl text-sm font-medium">Reason for revocation
              <input value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)}
                maxLength={500} placeholder="Required only when revoking a proxy"
                className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
            </label>
            {currentHistory.map((item) => <article key={item.id} className="border-b border-border py-3">
              <h4 className="font-semibold">{titleFor(item)}</h4>
              <p className="text-sm text-muted-foreground">{formatTime(item.validFrom)} – {formatTime(item.validUntil)}</p>
              <p className="mt-1 text-sm">{item.reason}</p>
              {(item.status === "requested" || item.status === "approved") &&
                new Date(item.validUntil).getTime() > Date.now() && <button type="button"
                  disabled={busy || Boolean(prepared) || Boolean(retry.current)} className="mt-3 rounded-lg border px-3 py-2 text-sm"
                  onClick={() => prepareRevocation(item)}>Review revocation</button>}
            </article>)}
          </div>}
    </section>

    <section className="space-y-4 border-t border-border pt-6" aria-labelledby="proxy-review-title">
      <h3 id="proxy-review-title" className="font-display text-xl font-semibold">Institutional review</h3>
      {review.isLoading ? <p role="status">Checking official review authority…</p> :
        review.isError ? <p role="alert">The review queue could not be verified.
          <button type="button" className="ml-2 underline" onClick={() => void review.refetch()}>Retry</button></p> :
        !review.data?.length ? <p className="text-sm text-muted-foreground">
          No pending requests are visible to your current institutional permissions.
        </p> : review.data.map((item) => <article key={item.id} className="border-b border-border py-4">
          <h4 className="font-semibold">{item.proxyPersonName}</h4>
          <p className="text-sm text-muted-foreground">Country {item.countryId} ·
            {formatTime(item.validFrom)} – {formatTime(item.validUntil)}</p>
          <p className="mt-2 text-sm">{item.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy || Boolean(prepared) || Boolean(retry.current)} type="button" onClick={() => prepareDecision(item, "approved")}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Review approval</button>
            <button disabled={busy || Boolean(prepared) || Boolean(retry.current)} type="button" onClick={() => prepareDecision(item, "rejected")}
              className="rounded-lg border px-4 py-2 text-sm">Review rejection</button>
          </div>
        </article>)}
    </section>
  </main>;
}
