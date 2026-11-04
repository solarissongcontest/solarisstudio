import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus } from "lucide-react";

import {
  canCreateWorldSession,
  createWorldSession,
  listWorldOrganizationOptions,
  type CreateWorldSessionInput,
  type WorldOperationReceipt,
} from "@/lib/world-session-public";

type PendingAttempt = {
  signature: string;
  input: CreateWorldSessionInput;
};

function toIso(value: string): string | null {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function friendlyError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && error.code === "42501") {
    return "Your institutional permissions changed. This operation was not accepted.";
  }
  if (error instanceof Error && !("code" in error)) return error.message;
  return "The operation could not be verified. Retrying the same request is safe.";
}

/**
 * TG6 organizer operation is intentionally separate from TG3 directory/World
 * layout ownership. Creation is reviewed and committed only by the TG6 RPC.
 */
export function WorldSessionEditor() {
  const organizations = useQuery({
    queryKey: ["world", "organizations", "public", 1],
    queryFn: listWorldOrganizationOptions,
    staleTime: 90_000,
    retry: 1,
  });
  const [organizationId, setOrganizationId] = useState("");
  const [organId, setOrganId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venueType, setVenueType] = useState<CreateWorldSessionInput["venueType"]>("external");
  const [venueLabel, setVenueLabel] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldOperationReceipt | null>(null);
  const pending = useRef<PendingAttempt | null>(null);

  const organization = organizations.data?.find((row) => row.id === organizationId);
  const organ = organization?.organs.find((row) => row.id === organId);
  const permission = useQuery({
    queryKey: ["world", "session", "can-create", organizationId, organId],
    enabled: Boolean(organization && organ),
    queryFn: () => canCreateWorldSession(organizationId, organId),
    retry: false,
    staleTime: 20_000,
  });

  function editing() {
    setReviewing(false);
    setError(null);
    pending.current = null;
  }

  function validate(): string | null {
    if (!organization || !organ) return "Select an organization and an organ.";
    if (!title.trim() || title.trim().length > 180) return "Enter a title up to 180 characters.";
    const start = toIso(startsAt);
    const end = toIso(endsAt);
    if (!start || !end || Date.parse(end) <= Date.parse(start)) {
      return "The ending time must be after the starting time.";
    }
    if (Date.parse(start) < Date.now() - 5 * 60_000) return "Choose a future session start.";
    if (externalUrl.trim() && !/^https:\/\/[^\s]+$/.test(externalUrl.trim())) {
      return "Meeting links must use HTTPS.";
    }
    if (permission.data !== true || permission.isFetching) {
      return "Your session-creation permission could not be verified.";
    }
    return null;
  }

  async function commit() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    const fields = {
      organizationId, organId, title: title.trim(),
      startsAt: toIso(startsAt)!, endsAt: toIso(endsAt)!,
      venueType, venueLabel: venueLabel.trim(), externalUrl: externalUrl.trim(),
    };
    const signature = JSON.stringify(fields);
    if (!pending.current || pending.current.signature !== signature) {
      const operationId = crypto.randomUUID();
      pending.current = {
        signature,
        input: { ...fields, operationId, idempotencyKey: "world.session.create:" + operationId },
      };
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createWorldSession(pending.current.input);
      setReceipt(result);
      pending.current = null;
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <Link to={"/world/sessions" as any}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Public sessions
      </Link>
      <header className="mt-4 border-b border-border/70 pb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.17em] text-primary">Institutional control · TG6</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-4xl">Schedule a session</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Create a public institutional meeting under your authorized organization and organ.
          The server assigns its official sequence number and records an operation receipt.
        </p>
      </header>
      {receipt ? (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-6" role="status">
          <CalendarPlus className="size-7 text-primary" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-semibold">Session scheduled</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The official server accepted your session. Receipt {receipt.operationId}.
          </p>
          <Link to={"/world/sessions/$sessionId" as any}
            params={{ sessionId: receipt.sessionId } as any}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            View session
          </Link>
        </section>
      ) : organizations.isPending ? (
        <p className="py-12 text-sm text-muted-foreground" role="status">Loading institution choices…</p>
      ) : organizations.isError ? (
        <div className="py-12" role="alert">
          <h2 className="font-semibold">Institution catalogue unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Creation is unavailable until institutional scope can be verified.
          </p>
          <button type="button" onClick={() => void organizations.refetch()}
            className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Retry</button>
        </div>
      ) : (
        <form className="mt-7 space-y-6" onSubmit={(event) => {
          event.preventDefault();
          const problem = validate();
          setError(problem);
          if (!problem) setReviewing(true);
        }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Organization
              <select value={organizationId} onChange={(event) => {
                setOrganizationId(event.target.value); setOrganId(""); editing();
              }} disabled={reviewing || submitting}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">
                <option value="">Select organization</option>
                {organizations.data?.map((o) => <option key={o.id} value={o.id}>{o.shortName}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Organ
              <select value={organId} onChange={(event) => { setOrganId(event.target.value); editing(); }}
                disabled={reviewing || submitting || !organization}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">
                <option value="">Select organ</option>
                {organization?.organs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          </div>
          {organization && organ ? (
            <p className="text-xs text-muted-foreground" role="status">
              {permission.isPending || permission.isFetching
                ? "Checking institutional authorization…"
                : permission.isError
                  ? "Permission check unavailable. Creation is blocked."
                  : permission.data
                    ? "Session creation is allowed in this scope."
                    : "You cannot create sessions for this organ."}
            </p>
          ) : null}
          <label className="block text-sm font-semibold">
            Session title
            <input value={title} onChange={(event) => { setTitle(event.target.value); editing(); }}
              disabled={reviewing || submitting} maxLength={180} required
              placeholder="Regular assembly session"
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Starts (your local time)
              <input type="datetime-local" value={startsAt}
                onChange={(event) => { setStartsAt(event.target.value); editing(); }}
                disabled={reviewing || submitting} required
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
            </label>
            <label className="block text-sm font-semibold">
              Ends (your local time)
              <input type="datetime-local" value={endsAt}
                onChange={(event) => { setEndsAt(event.target.value); editing(); }}
                disabled={reviewing || submitting} required
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Your device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Solaris stores absolute instants.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Venue type
              <select value={venueType} onChange={(event) => {
                setVenueType(event.target.value as CreateWorldSessionInput["venueType"]); editing();
              }} disabled={reviewing || submitting}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">
                <option value="external">External meeting space</option>
                <option value="online">Online</option>
                <option value="physical">Physical</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Venue label
              <input value={venueLabel} onChange={(event) => { setVenueLabel(event.target.value); editing(); }}
                disabled={reviewing || submitting} maxLength={180}
                placeholder="Official meeting venue"
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Official meeting URL (optional, HTTPS)
            <input type="url" value={externalUrl}
              onChange={(event) => { setExternalUrl(event.target.value); editing(); }}
              disabled={reviewing || submitting} placeholder="https://…"
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" />
          </label>
          {reviewing ? (
            <div className="rounded-2xl border border-primary/40 bg-surface p-5" aria-label="Review public session">
              <h2 className="text-lg font-semibold">Review before publishing</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {organization?.shortName} · {organ?.name}<br />
                {title}<br />
                {startsAt} – {endsAt}<br />
                {venueLabel || venueType}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This will create a publicly visible institutional session. It cannot be undone from this screen.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => setReviewing(false)} disabled={submitting}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                  Edit details
                </button>
                <button type="button" onClick={() => void commit()}
                  disabled={submitting || permission.data !== true || permission.isFetching}
                  className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {submitting ? "Submitting…" : "Confirm and schedule"}
                </button>
              </div>
            </div>
          ) : (
            <button type="submit" disabled={submitting || permission.data !== true || permission.isFetching}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Review session
            </button>
          )}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
