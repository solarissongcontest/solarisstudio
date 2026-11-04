import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  EMPTY_GUARD_APPLICATION,
  GUARD_APPLICATION_LIMITS,
  guardApplicationStatusLabel,
  guardIntakeErrorMessage,
  loadGuardIntake,
  newGuardIntakeOperation,
  normalizeGuardApplication,
  submitGuardApplication,
  validateGuardApplication,
  type GuardApplicationErrors,
  type GuardApplicationField,
  type GuardApplicationFields,
  type GuardIntakeOperation,
} from "@/lib/terra-governance-guard-intake";

export const Route = createFileRoute("/world/membership/apply")({
  head: () => ({
    meta: [
      { title: "GUARD membership application — Solaris Studio" },
      { name: "description", content: "Official country-controlled GUARD membership application." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GuardMembershipApplicationPage,
});

const FIELD_META: readonly {
  key: GuardApplicationField;
  label: string;
  description: string;
  multiline: boolean;
}[] = [
  {
    key: "officialDesignation",
    label: "Official state designation",
    description: "Your country's official designation for this application.",
    multiline: false,
  },
  {
    key: "governmentSystem",
    label: "Government system",
    description: "Describe the country's current political system.",
    multiline: false,
  },
  {
    key: "motivation",
    label: "Reason for applying",
    description: "Explain why your country wishes to join GUARD.",
    multiline: true,
  },
  {
    key: "contributions",
    label: "Intended contributions",
    description: "Explain the military, financial or technical support your country expects to contribute.",
    multiline: true,
  },
  {
    key: "commitment",
    label: "International obligations",
    description: "State the country's commitment to GUARD's international responsibilities.",
    multiline: true,
  },
];

function GuardMembershipApplicationPage() {
  const account = useMyCountryAccount();
  const queryClient = useQueryClient();
  const countryId = account.data?.access.countryId ?? null;
  const isActiveController = account.data?.access.countryStatus === "active";
  const intake = useQuery({
    queryKey: ["world", "guard", "membership-intake", countryId],
    queryFn: () => loadGuardIntake(countryId!),
    enabled: Boolean(countryId && isActiveController),
    staleTime: 60_000,
    retry: 1,
  });
  const [fields, setFields] = useState<GuardApplicationFields>({ ...EMPTY_GUARD_APPLICATION });
  const [errors, setErrors] = useState<GuardApplicationErrors>({});
  const [confirmation, setConfirmation] = useState<{ applicationId: string; operationId: string } | null>(null);
  const requestRef = useRef<{ fields: GuardApplicationFields; operation: GuardIntakeOperation } | null>(null);
  const submit = useMutation({
    mutationFn: async (input: {
      fields: GuardApplicationFields;
      operation: GuardIntakeOperation;
      organizationId: string;
      countryId: string;
    }) => submitGuardApplication(input),
    onSuccess: async (result) => {
      setConfirmation({ applicationId: result.applicationId, operationId: result.operationId });
      requestRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ["world", "guard", "membership-intake", countryId] });
    },
  });
  const pendingApplication = intake.data?.applications.find((application) =>
    ["submitted", "under_review", "introduced", "approved"].includes(application.status),
  ) ?? null;
  const isPendingApplication = pendingApplication != null;
  const hasMembership = Boolean(intake.data?.activeMembership);
  const canSubmit = Boolean(
    countryId && isActiveController && intake.data && !hasMembership && !isPendingApplication && !confirmation && !submit.isPending,
  );

  function updateField(field: GuardApplicationField, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    // A changed semantic payload must not reuse the previous operation identity.
    requestRef.current = null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !intake.data || !countryId) return;
    const normalized = normalizeGuardApplication(fields);
    const nextErrors = validateGuardApplication(normalized);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const previous = requestRef.current;
    const operation = previous && FIELD_META.every(({ key }) => previous.fields[key] === normalized[key])
      ? previous.operation
      : newGuardIntakeOperation();
    requestRef.current = { fields: normalized, operation };
    setConfirmation(null);
    submit.mutate({
      fields: normalized,
      operation,
      organizationId: intake.data.organizationId,
      countryId,
    });
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · GUARD"
        title="Membership application"
        description="Apply on behalf of your country. Submission opens a formal review; it does not grant membership."
      />
      <main className="mx-auto w-full max-w-3xl space-y-6 pb-12">
        <section className="border-b border-border pb-5" aria-labelledby="guard-process-heading">
          <div className="flex gap-3">
            <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 id="guard-process-heading" className="font-display text-xl font-semibold">
                How admission works
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                After the application is received, the GUARD Chairperson can introduce it to
                the General Assembly of GUARD. Admission requires constitutional consideration,
                a valid vote and the required two-thirds approval. You will not gain member
                voting or private institutional access merely by applying.
              </p>
            </div>
          </div>
        </section>

        {account.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Checking delegation authority…</p>
        ) : account.isError ? (
          <RecoveryNotice title="Delegation status unavailable" retry={() => void account.refetch()} />
        ) : !countryId || !isActiveController ? (
          <section className="rounded-xl border border-border p-5" role="status">
            <h2 className="font-semibold">An active country controller is required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with the account currently authorized to represent a Terra Solaris country.
              A suspended or unassigned delegation cannot submit this application.
            </p>
          </section>
        ) : intake.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Checking GUARD membership and previous applications…</p>
        ) : intake.isError ? (
          <RecoveryNotice
            title="Current membership status could not be verified"
            retry={() => void intake.refetch()}
            detail="No application can be sent until Solaris can confirm your country has no existing membership or pending application."
          />
        ) : intake.data ? (
          <>
            <section aria-labelledby="guard-country-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Acting country
              </p>
              <h2 id="guard-country-heading" className="mt-1 font-display text-2xl font-semibold">
                {account.data?.country?.name ?? "Your country"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {intake.data.organizationName} · Official country submission
              </p>
            </section>

            {hasMembership ? (
              <div className="flex gap-3 rounded-xl border border-border bg-surface p-5" role="status">
                <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold">Your country already has a GUARD membership record</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current status: {intake.data.activeMembership}. New applications are unavailable
                    while an active membership relationship exists.
                  </p>
                </div>
              </div>
            ) : isPendingApplication && pendingApplication ? (
              <div className="flex gap-3 rounded-xl border border-border bg-surface p-5" role="status">
                <Clock3 className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold">Application already on record</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {guardApplicationStatusLabel(pendingApplication.status)} · {pendingApplication.official_state_designation}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Application ID: <span className="break-all font-mono">{pendingApplication.id}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void intake.refetch()}
                    className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Check latest status
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="space-y-6" aria-labelledby="guard-form-heading">
                <div className="border-b border-border pb-3">
                  <h2 id="guard-form-heading" className="font-display text-xl font-semibold">
                    Country application
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Provide official information. This submission is durable and cannot be silently edited after sending.
                  </p>
                </div>
                {FIELD_META.map((field) => (
                  <div key={field.key}>
                    <label htmlFor={`guard-${field.key}`} className="block text-sm font-semibold">
                      {field.label}
                    </label>
                    <p id={`guard-${field.key}-hint`} className="mt-1 text-xs text-muted-foreground">
                      {field.description}
                    </p>
                    {field.multiline ? (
                      <textarea
                        id={`guard-${field.key}`}
                        value={fields[field.key]}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        maxLength={GUARD_APPLICATION_LIMITS[field.key].max}
                        rows={4}
                        required
                        aria-invalid={Boolean(errors[field.key])}
                        aria-describedby={`guard-${field.key}-hint${errors[field.key] ? ` guard-${field.key}-error` : ""}`}
                        className="mt-2 block w-full resize-y rounded-xl border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      />
                    ) : (
                      <input
                        id={`guard-${field.key}`}
                        value={fields[field.key]}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        maxLength={GUARD_APPLICATION_LIMITS[field.key].max}
                        required
                        aria-invalid={Boolean(errors[field.key])}
                        aria-describedby={`guard-${field.key}-hint${errors[field.key] ? ` guard-${field.key}-error` : ""}`}
                        className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      />
                    )}
                    {errors[field.key] ? (
                      <p id={`guard-${field.key}-error`} className="mt-1 text-xs font-semibold text-destructive">
                        {errors[field.key]}
                      </p>
                    ) : null}
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {fields[field.key].trim().length}/{GUARD_APPLICATION_LIMITS[field.key].max}
                    </p>
                  </div>
                ))}
                <div className="border-t border-border pt-5">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Submitting confirms that this is the official application from the country
                    currently controlled by your Solaris account.
                  </p>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {submit.isPending ? "Submitting official application…" : "Submit application"}
                  </button>
                </div>
              </form>
            )}

            {confirmation ? (
              <div role="status" className="rounded-xl border border-border bg-surface p-4">
                <h2 className="font-semibold">Application confirmed by Solaris</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your application has been received for review. This is not an admission decision.
                </p>
                <p className="mt-2 break-all font-mono text-xs">
                  Application: {confirmation.applicationId}
                </p>
                <p className="mt-1 break-all font-mono text-xs">
                  Operation: {confirmation.operationId}
                </p>
              </div>
            ) : null}

            {submit.isError ? (
              <div role="alert" className="rounded-xl border border-border p-4">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                  <p className="text-sm">{guardIntakeErrorMessage(submit.error)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void intake.refetch()}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold"
                >
                  Check server status
                </button>
                {!isPendingApplication && !hasMembership ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (requestRef.current && intake.data && countryId) {
                        submit.mutate({
                          fields: requestRef.current.fields,
                          operation: requestRef.current.operation,
                          organizationId: intake.data.organizationId,
                          countryId,
                        });
                      }
                    }}
                    disabled={!canSubmit || !requestRef.current}
                    className="ml-2 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-60"
                  >
                    Retry same operation
                  </button>
                ) : null}
              </div>
            ) : null}

            {intake.data.applications.length > 0 && !isPendingApplication ? (
              <section className="border-t border-border pt-5" aria-labelledby="guard-history-heading">
                <h2 id="guard-history-heading" className="font-display text-lg font-semibold">
                  Previous applications
                </h2>
                <ul className="mt-3 divide-y divide-border" aria-label="Previous GUARD membership applications">
                  {intake.data.applications.map((application) => (
                    <li key={application.id} className="py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{application.official_state_designation}</span>
                        <span className="text-xs text-muted-foreground">
                          {guardApplicationStatusLabel(application.status)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

function RecoveryNotice({ title, detail, retry }: {
  title: string;
  detail?: string;
  retry: () => void;
}) {
  return (
    <section role="alert" className="rounded-xl border border-border p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {detail ?? "A verified country context is required before this operation can continue."}
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </section>
  );
}
