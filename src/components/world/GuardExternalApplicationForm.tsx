import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, FileInput } from "lucide-react";

import {
  EMPTY_GUARD_APPLICATION,
  GUARD_APPLICATION_LIMITS,
  normalizeGuardApplication,
  type GuardApplicationField,
  type GuardApplicationFields,
} from "@/lib/terra-governance-guard-intake";
import {
  guardReviewErrorMessage,
  loadGuardReviewCountries,
  newGuardExternalIntakeOperation,
  registerExternalGuardApplication,
  validateGuardExternalIntake,
  type GuardExternalIntakeRequest,
} from "@/lib/terra-governance-guard-review";

const FIELDS: readonly { key: GuardApplicationField; label: string; multiline: boolean }[] = [
  { key: "officialDesignation", label: "Official state designation", multiline: false },
  { key: "governmentSystem", label: "Government system", multiline: false },
  { key: "motivation", label: "Reason for applying", multiline: true },
  { key: "contributions", label: "Military, financial or technical contributions", multiline: true },
  { key: "commitment", label: "Commitment to international obligations", multiline: true },
];

type PendingExternal = {
  request: GuardExternalIntakeRequest;
  fingerprint: string;
};

export function GuardExternalApplicationForm({
  organizationId,
  actorId,
}: {
  organizationId: string;
  actorId: string;
}) {
  const queryClient = useQueryClient();
  const countries = useQuery({
    queryKey: ["world", "tg5", "guard-country-options"],
    queryFn: loadGuardReviewCountries,
    staleTime: 300_000,
    retry: 1,
  });
  const [expanded, setExpanded] = useState(false);
  const [countryId, setCountryId] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [fields, setFields] = useState<GuardApplicationFields>({ ...EMPTY_GUARD_APPLICATION });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState<{ applicationId: string; operationId: string } | null>(null);
  const pendingRef = useRef<PendingExternal | null>(null);

  const create = useMutation({
    mutationFn: registerExternalGuardApplication,
    onSuccess: async (result) => {
      pendingRef.current = null;
      setReview(false);
      setReceipt({ applicationId: result.applicationId, operationId: result.operationId });
      await queryClient.invalidateQueries({
        queryKey: ["world", "tg5", "guard-review", actorId],
      });
    },
  });

  function invalidateReview() {
    setReview(false);
    setReceipt(null);
    pendingRef.current = null;
  }

  function updateField(key: GuardApplicationField, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
    invalidateReview();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!countryId || !countries.data?.some((country) => country.id === countryId)) {
      setErrors((previous) => ({ ...previous, countryId: "Select a verified Terra Solaris country." }));
      return;
    }
    const normalized = normalizeGuardApplication(fields);
    const validation = validateGuardExternalIntake(normalized, sourceReference);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    if (!review) {
      setReview(true);
      return;
    }
    if (create.isPending) return;
    const fingerprint = JSON.stringify([organizationId, countryId, normalized, sourceReference.trim()]);
    const previous = pendingRef.current;
    const operation = previous?.fingerprint === fingerprint
      ? previous.request.operation : newGuardExternalIntakeOperation();
    const request = {
      organizationId, countryId, fields: normalized,
      sourceReference: sourceReference.trim(), operation,
    };
    pendingRef.current = { request, fingerprint };
    create.mutate(request);
  }

  return (
    <section className="border-b border-border pb-4" aria-labelledby="guard-external-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileInput className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 id="guard-external-title" className="font-semibold">Register an external application</h2>
            <p className="text-xs text-muted-foreground">
              For a country request already received directly by the GUARD Chairperson.
            </p>
          </div>
        </div>
        <button type="button" aria-expanded={expanded} aria-controls="guard-external-form"
          onClick={() => setExpanded((current) => !current)}
          className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
          {expanded ? "Close form" : "Register"}
        </button>
      </div>
      {expanded && (
        <div id="guard-external-form" className="mt-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Record the actual five application fields and where the Chairperson received
            the request. This creates only a pending application, never GUARD membership,
            an official ballot or the country's consent on behalf of its controller.
          </p>
          {receipt ? (
            <div role="status" className="flex gap-3 rounded-xl border border-border p-4">
              <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold">External application registered</p>
                <p className="mt-1 break-all text-muted-foreground">
                  Application {receipt.applicationId}
                </p>
                <button type="button" onClick={() => {
                  setCountryId("");
                  setSourceReference("");
                  setFields({ ...EMPTY_GUARD_APPLICATION });
                  setErrors({});
                  setReceipt(null);
                  setReview(false);
                  create.reset();
                }} className="mt-3 min-h-11 rounded-lg border border-border px-3 font-semibold">
                  Register another
                </button>
              </div>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="guard-external-country" className="block text-sm font-semibold">
                  Applying country
                </label>
                {countries.isPending ? (
                  <p className="mt-2 text-sm text-muted-foreground" role="status">Loading official countries…</p>
                ) : countries.isError ? (
                  <div role="alert" className="mt-2 text-sm text-destructive">
                    Country directory unavailable.
                    <button type="button" className="ml-2 underline"
                      onClick={() => void countries.refetch()}>Retry</button>
                  </div>
                ) : (
                  <select id="guard-external-country" required value={countryId}
                    disabled={create.isPending}
                    onChange={(event) => {
                      setCountryId(event.target.value);
                      setErrors((previous) => ({ ...previous, countryId: "" }));
                      invalidateReview();
                    }}
                    aria-invalid={Boolean(errors.countryId)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                    <option value="">Select country</option>
                    {countries.data?.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name} ({country.short_code})
                      </option>
                    ))}
                  </select>
                )}
                {errors.countryId && <p role="alert" className="mt-1 text-xs text-destructive">{errors.countryId}</p>}
              </div>

              {FIELDS.map(({ key, label, multiline }) => (
                <div key={key}>
                  <label htmlFor={"guard-external-" + key}
                    className="block text-sm font-semibold">{label}</label>
                  {multiline ? (
                    <textarea id={"guard-external-" + key} rows={3} required
                      minLength={GUARD_APPLICATION_LIMITS[key].min}
                      maxLength={GUARD_APPLICATION_LIMITS[key].max}
                      value={fields[key]} disabled={create.isPending}
                      onChange={(event) => updateField(key, event.target.value)}
                      aria-invalid={Boolean(errors[key])}
                      className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"/>
                  ) : (
                    <input id={"guard-external-" + key} type="text" required
                      minLength={GUARD_APPLICATION_LIMITS[key].min}
                      maxLength={GUARD_APPLICATION_LIMITS[key].max}
                      value={fields[key]} disabled={create.isPending}
                      onChange={(event) => updateField(key, event.target.value)}
                      aria-invalid={Boolean(errors[key])}
                      className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"/>
                  )}
                  {errors[key] && <p role="alert" className="mt-1 text-xs text-destructive">{errors[key]}</p>}
                </div>
              ))}

              <div>
                <label htmlFor="guard-external-reference" className="block text-sm font-semibold">
                  Source reference
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Private record of the received message, date or document, 8–500 characters.
                </p>
                <textarea id="guard-external-reference" value={sourceReference}
                  rows={2} required minLength={8} maxLength={500}
                  disabled={create.isPending} aria-invalid={Boolean(errors.sourceReference)}
                  onChange={(event) => {
                    setSourceReference(event.target.value);
                    setErrors((previous) => ({ ...previous, sourceReference: "" }));
                    invalidateReview();
                  }}
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"/>
                {errors.sourceReference && <p role="alert" className="mt-1 text-xs text-destructive">{errors.sourceReference}</p>}
              </div>

              {review && (
                <div role="status" className="rounded-xl border border-primary/50 p-4 text-sm">
                  <p className="font-semibold">Review official registration</p>
                  <p className="mt-2 text-muted-foreground">
                    Country: {countries.data?.find((country) => country.id === countryId)?.name}.
                    The full source record is private, and registration does not admit
                    the country. Confirm only if the received request is genuine.
                  </p>
                  <button type="button" disabled={create.isPending}
                    onClick={() => setReview(false)}
                    className="mt-3 min-h-11 rounded-lg border border-border px-3">
                    Return to editing
                  </button>
                </div>
              )}

              {create.isError && (
                <div role="alert" className="text-sm">
                  <p className="text-destructive">{guardReviewErrorMessage(create.error)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The operation may have reached the server. Check the new application
                    in the review inbox before submitting another.
                  </p>
                  <button type="button" onClick={() => void queryClient.invalidateQueries({
                    queryKey: ["world", "tg5", "guard-review", actorId],
                  })} className="mt-2 min-h-11 rounded-lg border border-border px-3">
                    Refresh inbox
                  </button>
                </div>
              )}
              <button type="submit" disabled={create.isPending || countries.isPending || countries.isError}
                className="min-h-11 rounded-xl border border-primary px-5 text-sm font-semibold disabled:opacity-60">
                {create.isPending ? "Recording…" : review ? "Confirm official registration" : "Review registration"}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
