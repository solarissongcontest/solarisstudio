import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, RefreshCw, Users, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  acceptedFounderCount, fetchUnionWorkspace, inviteUnionFounder,
  isSixFoundersMet, mayRespondToFoundingInvitation, respondUnionFounder,
  startUnionRecognition, unionRecognitionError,
  type UnionFounder, type UnionOperation, type UnionRecognitionApplication,
} from "@/lib/world-union-recognition";

type Retry = { fingerprint: string; operation: UnionOperation };
function useStableOperation() {
  const ref = useRef<Retry | null>(null);
  const claim = (fingerprint: string): UnionOperation => {
    if (ref.current?.fingerprint === fingerprint) return ref.current.operation;
    const id = crypto.randomUUID();
    ref.current = { fingerprint, operation: { operationId: id, key: `world-union-${id}` } };
    return ref.current.operation;
  };
  const clear = () => { ref.current = null; };
  return { claim, clear };
}
function Busy({ message }: { message: string }) {
  return <p role="status" className="mt-4 rounded-xl border border-border p-5 text-sm text-muted-foreground">{message}</p>;
}
function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-destructive/50 p-4">
      <p className="text-sm">{unionRecognitionError(error)}</p>
      <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
        Retry safely
      </button>
    </div>
  );
}

function ApplicationCard({
  application, founders, currentCountryId, countries, onChange,
}: {
  application: UnionRecognitionApplication;
  founders: readonly UnionFounder[];
  currentCountryId: string | null;
  countries: readonly { id: string; name: string }[];
  onChange: () => void;
}) {
  const [invitedCountryId, setInvitedCountryId] = useState("");
  const [decision, setDecision] = useState<"accept" | "decline" | null>(null);
  const inviteOperation = useStableOperation();
  const respondOperation = useStableOperation();
  const isLead = currentCountryId === application.leadCountryId;
  const accepted = acceptedFounderCount(application.id, founders);
  const hasSix = isSixFoundersMet(application.id, founders);
  const existingCountries = new Set(founders.filter((f) => f.applicationId === application.id).map((f) => f.countryId));
  const names = new Map(countries.map((country) => [country.id, country.name]));
  const canRespond = mayRespondToFoundingInvitation(application, founders, currentCountryId);
  const invite = useMutation({
    mutationFn: async () => {
      const input = {
        applicationId: application.id,
        countryId: invitedCountryId,
        expectedRevision: application.revision,
      };
      return inviteUnionFounder(input, inviteOperation.claim(JSON.stringify(input)));
    },
    retry: false,
    onSuccess: () => {
      inviteOperation.clear();
      setInvitedCountryId("");
      onChange();
    },
  });
  const respond = useMutation({
    mutationFn: async () => {
      if (!currentCountryId || !decision) throw new Error("VALIDATION");
      const input = {
        applicationId: application.id, countryId: currentCountryId,
        accept: decision === "accept", expectedRevision: application.revision,
      };
      return respondUnionFounder(input, respondOperation.claim(JSON.stringify(input)));
    },
    retry: false,
    onSuccess: () => {
      respondOperation.clear();
      setDecision(null);
      onChange();
    },
  });

  return (
    <article className="border-b border-border py-7 last:border-b-0" aria-label={application.proposedName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{application.proposedName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {application.proposedShortName} · Proposed by {names.get(application.leadCountryId) ?? "Country"}
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
          {application.status.replaceAll("_", " ")}
        </span>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        {([
          ["Mission", application.mission],
          ["Governance", application.governance],
          ["Scope", application.scope],
        ] as const).map(([heading, detail]) => (
          <div key={heading}>
            <dt className="font-semibold">{heading}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">Consenting founding countries</h4>
        <p className="text-sm font-semibold">{accepted} / 6 usual minimum</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {hasSix
          ? "The ordinary founder-consent threshold is met. Formal submission still requires a valid founding charter and certified UNITY review."
          : "Six countries must explicitly consent, unless the UNITY General Assembly authorizes an exception."}
        {application.exceptionRequested ? " The applicant requests an exception; it has NOT been granted." : ""}
      </p>
      <ol className="mt-3 divide-y divide-border">
        {founders.filter((founder) => founder.applicationId === application.id).map((founder) => (
          <li key={founder.id} className="flex justify-between gap-3 py-2 text-sm">
            <span>{names.get(founder.countryId) ?? "Country"}</span>
            <span className="capitalize text-muted-foreground">{founder.status}</span>
          </li>
        ))}
      </ol>
      {isLead && application.status === "collecting_founders" ? (
        <form
          className="mt-6 max-w-xl border-t border-border pt-5"
          onSubmit={(event) => { event.preventDefault(); if (!invite.isPending) invite.mutate(); }}
        >
          <label htmlFor={`invite-${application.id}`} className="mb-2 block text-sm font-semibold">
            Invite another founding country
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <select
              id={`invite-${application.id}`}
              value={invitedCountryId}
              onChange={(event) => { setInvitedCountryId(event.target.value); inviteOperation.clear(); }}
              className="min-h-11 min-w-44 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              required
            >
              <option value="">Choose a country</option>
              {countries.filter((country) => !existingCountries.has(country.id)).map((country) => (
                <option key={country.id} value={country.id}>{country.name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!invitedCountryId || invite.isPending}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {invite.isPending ? "Inviting…" : "Send official invitation"}
            </button>
          </div>
          {invite.isError ? <ErrorBox error={invite.error} retry={() => invite.mutate()} /> : null}
        </form>
      ) : null}
      {canRespond ? (
        <section className="mt-6 border-t border-border pt-5" aria-label="Your founding invitation">
          <h4 className="font-semibold">Your country has been invited</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Becoming a founding country requires your explicit consent.
            Acceptance does not create an organization or authorize a recognition vote.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => { setDecision("accept"); respondOperation.clear(); }}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
              <Check size={16} aria-hidden="true" /> Accept founding invitation
            </button>
            <button type="button" onClick={() => { setDecision("decline"); respondOperation.clear(); }}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
              <X size={16} aria-hidden="true" /> Decline invitation
            </button>
          </div>
          {decision ? (
            <div className="mt-4 rounded-xl border border-border p-4">
              <p className="text-sm">
                Record an official <strong>{decision}</strong> response for
                {names.get(currentCountryId ?? "") ?? "your country"}?
                It will enter the immutable founding history.
              </p>
              <div className="mt-3 flex gap-3">
                <button type="button" disabled={respond.isPending}
                  onClick={() => respond.mutate()}
                  className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {respond.isPending ? "Recording…" : "Confirm official response"}
                </button>
                <button type="button" onClick={() => { setDecision(null); respondOperation.clear(); }}
                  className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
                  Cancel
                </button>
              </div>
              {respond.isError ? <ErrorBox error={respond.error} retry={() => respond.mutate()} /> : null}
            </div>
          ) : null}
        </section>
      ) : null}
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Founding charter: {application.charterDocumentId ? "linked, subject to legal review" : "not yet registered"}.
        Recognition, exception and General Assembly approval are not available from this intake screen.
        Revision {application.revision}.
      </p>
    </article>
  );
}

export function WorldUnionRecognitionWorkspace() {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [mission, setMission] = useState("");
  const [governance, setGovernance] = useState("");
  const [scope, setScope] = useState("");
  const [exceptionRequested, setExceptionRequested] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const operation = useStableOperation();
  const workspace = useQuery({
    queryKey: ["world", "unions", "founder-workspace"],
    queryFn: fetchUnionWorkspace,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const activeCountryId = workspace.data?.activeCountryId ?? null;
  const unityOrganizationId = workspace.data?.unityOrganizationId ?? null;
  const countries = workspace.data?.countries ?? [];
  const nameById = useMemo(
    () => new Map(countries.map((country) => [country.id, country.name])),
    [countries],
  );
  const start = useMutation({
    mutationFn: async () => {
      if (!unityOrganizationId || !activeCountryId) throw new Error("VALIDATION");
      const payload = {
        unityOrganizationId, countryId: activeCountryId,
        name: name.trim(), shortName: shortName.trim(),
        mission: mission.trim(), governance: governance.trim(),
        scope: scope.trim(), exceptionRequested,
      };
      return startUnionRecognition(payload, operation.claim(JSON.stringify(payload)));
    },
    retry: false,
    onSuccess: ({ applicationId, revision }) => {
      operation.clear();
      setReceipt(`Application ${applicationId} created at revision ${revision}.`);
      setName(""); setShortName(""); setMission(""); setGovernance(""); setScope("");
      setExceptionRequested(false);
      void workspace.refetch();
    },
  });
  const refresh = () => void workspace.refetch();
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pt-8">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> Terra Solaris
        </Link>
        <p className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Users size={20} className="text-primary" aria-hidden="true" />
          UNITY recognition process
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Found a new international union
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          New unions are independent international organizations, not subsidiaries of UNITY.
          Start a private application, invite real founding countries, and record their explicit consent.
        </p>
        {workspace.isPending || workspace.isFetching ? <Busy message="Checking current country authority and private applications…" /> : null}
        {workspace.isError ? <ErrorBox error={workspace.error} retry={refresh} /> : null}
        {workspace.isSuccess && !workspace.isFetching && !workspace.data.signedIn ? (
          <Busy message="Sign in as your country's current controller to begin or respond to a founding invitation." />
        ) : null}
        {workspace.isSuccess && !workspace.isFetching && workspace.data.signedIn ? (
          <>
            <section className="mt-9 border-t border-border pt-6" aria-labelledby="new-union-application">
              <h2 id="new-union-application" className="text-xl font-semibold">Begin an application</h2>
              {!activeCountryId ? (
                <Busy message="No active country is controlled by this account. Only a current country controller may propose a founding union." />
              ) : !unityOrganizationId ? (
                <Busy message="UNITY is not currently available for new recognition applications." />
              ) : (
                <form className="mt-5 grid max-w-xl gap-4"
                  onSubmit={(event) => { event.preventDefault(); if (!start.isPending) start.mutate(); }}>
                  <p className="text-sm text-muted-foreground">Lead country: <strong>{nameById.get(activeCountryId) ?? "Your country"}</strong></p>
                  {([
                    ["union-name", "Proposed full name", name, setName, 5, 180],
                    ["union-short-name", "Proposed short name", shortName, setShortName, 2, 64],
                  ] as const).map(([key, label, value, update, min, max]) => (
                    <div key={key}>
                      <label htmlFor={key} className="mb-2 block text-sm font-medium">{label}</label>
                      <input id={key} value={value} onChange={(event) => { update(event.target.value); operation.clear(); }}
                        minLength={min} maxLength={max} required
                        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                    </div>
                  ))}
                  {([
                    ["union-mission", "Mission", mission, setMission, 20, 5000],
                    ["union-governance", "Proposed governance", governance, setGovernance, 20, 5000],
                    ["union-scope", "Proposed scope", scope, setScope, 10, 2000],
                  ] as const).map(([key, label, value, update, min, max]) => (
                    <div key={key}>
                      <label htmlFor={key} className="mb-2 block text-sm font-medium">{label}</label>
                      <textarea id={key} value={value}
                        onChange={(event) => { update(event.target.value); operation.clear(); }}
                        minLength={min} maxLength={max} required
                        className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm" />
                    </div>
                  ))}
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 size-4"
                      checked={exceptionRequested} onChange={(event) => { setExceptionRequested(event.target.checked); operation.clear(); }} />
                    Request consideration of a founder-count exception. This does not grant an exception.
                  </label>
                  <p className="text-xs leading-5 text-muted-foreground">
                    The ordinary threshold is six consenting countries. A founding charter and a certified General Assembly vote
                    with 50% quorum and exact two-thirds support are required for recognition. GUARD remains grandfathered.
                  </p>
                  <button type="submit"
                    disabled={name.trim().length < 5 || shortName.trim().length < 2 || mission.trim().length < 20 ||
                      governance.trim().length < 20 || scope.trim().length < 10 || start.isPending}
                    className="min-h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {start.isPending ? "Creating application…" : "Create private founding application"}
                  </button>
                  {start.isError ? <ErrorBox error={start.error} retry={() => start.mutate()} /> : null}
                  {receipt ? <p role="status" className="text-sm font-semibold">{receipt}</p> : null}
                </form>
              )}
            </section>
            <section className="mt-10 border-t border-border pt-6" aria-labelledby="private-unions">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="private-unions" className="text-xl font-semibold">Your applications and invitations</h2>
                <button type="button" onClick={refresh}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">
                  <RefreshCw size={16} aria-hidden="true" /> Refresh
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Showing up to ten authorized applications. Other countries' private applications are not disclosed.
              </p>
              {workspace.data.applications.length ? (
                <div className="mt-4">
                  {workspace.data.applications.map((application) => (
                    <ApplicationCard
                      key={application.id}
                      application={application}
                      founders={workspace.data.founders}
                      currentCountryId={activeCountryId}
                      countries={countries}
                      onChange={refresh}
                    />
                  ))}
                </div>
              ) : <Busy message="No private founding application or invitation is available to this account." />}
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
