import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, ShieldCheck } from "lucide-react";

import {
  loadWorldAttendanceManage,
  newWorldAttendanceOperation,
  recordWorldAttendance,
  type WorldAttendanceReceipt,
  type WorldAttendanceStatus,
} from "@/lib/world-attendance-commands";

type Pending = {
  description: string;
  run: () => Promise<WorldAttendanceReceipt>;
};
type Draft = {
  countryId: string;
  status: WorldAttendanceStatus;
  proxyId: string;
};
const knownRejection = (error: unknown) =>
  error !== null && typeof error === "object" && "code" in error &&
  ["40001","23514","42501","22023","23505","25006"].includes(String(error.code));
const errorMessage = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "The server response is uncertain. Reconcile the exact operation before changing another attendance row.";
  }
  switch (String(error.code)) {
    case "40001": return "Attendance changed on another device. Refresh the official roll call.";
    case "42501": return "Your institutional attendance permission could not be verified.";
    case "23514": return "The session, representation or proxy is no longer eligible.";
    case "22023": return "Review the selected status and approved proxy.";
    case "25006": return "Institutional writes are disabled in the current platform operating mode.";
    default: return "The operation could not be verified. Refresh official session state.";
  }
};

export function WorldAttendanceEditor({ sessionId }: { sessionId: string }) {
  const client = useQueryClient();
  const attendance = useQuery({
    queryKey: ["world", "session", "attendance", sessionId],
    queryFn: () => loadWorldAttendanceManage(sessionId),
    retry: false,
    staleTime: 0,
  });
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldAttendanceReceipt | null>(null);
  const retry = useRef<Pending | null>(null);
  const countries = attendance.data?.countries ?? [];
  const country = countries.find((row) => row.countryId === selectedCountryId) ??
    countries[0] ?? null;
  const status = draft?.countryId === country?.countryId
    ? draft.status : country?.attendance?.status ?? "present";
  const defaultProxy = country?.proxies.find((row) =>
    row.id === country.attendance?.proxyId)?.id ?? "";
  const proxyId = draft?.countryId === country?.countryId
    ? draft.proxyId : defaultProxy;
  const mayRecord = attendance.data?.status === "open" ||
    attendance.data?.status === "recessed";

  function setChoice(next: Partial<Draft>) {
    if (!country || busy || retry.current) return;
    setDraft({
      countryId: country.countryId,
      status: next.status ?? status,
      proxyId: next.proxyId ?? proxyId,
    });
    setPending(null);
    setError(null);
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!country || !mayRecord || busy || retry.current) return;
    if (status === "proxy" &&
        (!country.proxies.some((row) => row.id === proxyId) ||
          country.membershipStatus !== "member")) {
      setError("Proxy attendance requires a currently approved, effective proxy of a full member.");
      return;
    }
    const nextProxyId = status === "proxy" ? proxyId : null;
    const operation = newWorldAttendanceOperation();
    const args = {
      sessionId,
      countryId: country.countryId,
      representationId: country.representationId,
      status,
      proxyId: nextProxyId,
      expectedRevision: country.attendance?.revision ?? null,
      operation,
    };
    setError(null);
    setPending({
      description: "Record " + status + " for " + country.countryName +
        (nextProxyId ? " with a validated acting proxy." : ".") +
        " This attendance entry does not certify quorum or create a ballot.",
      run: () => recordWorldAttendance(args),
    });
  }

  async function execute(action: Pending) {
    if (busy) return;
    retry.current = action;
    setBusy(true);
    setError(null);
    try {
      const result = await action.run();
      retry.current = null;
      setReceipt(result);
      setPending(null);
      setDraft(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["world", "session", "attendance", sessionId] }),
        client.invalidateQueries({ queryKey: ["world", "session", "manage", sessionId] }),
      ]);
    } catch (failure) {
      setPending(null);
      setError(errorMessage(failure));
      if (knownRejection(failure)) {
        retry.current = null;
        await client.invalidateQueries({
          queryKey: ["world", "session", "attendance", sessionId],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto w-full max-w-3xl space-y-7 pb-16">
    <section className="space-y-3 border-b border-border pb-5">
      <h2 className="flex items-center gap-3 font-display text-2xl font-semibold">
        <ClipboardCheck className="size-6" aria-hidden="true" /> Institutional attendance
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The official meeting officer records attendance for each represented country.
        A proxy entry requires a current approved mandate. Attendance does not
        establish an eligible electorate, count a vote, or prove constitutional quorum.
      </p>
      <Link to="/world/sessions/$sessionId" params={{ sessionId }}
        className="inline-block text-sm underline">Return to this session</Link>
    </section>

    {attendance.isLoading ? <p role="status">Checking session authority and attendance…</p> :
      attendance.isError || !attendance.data ?
        <section role="alert" className="space-y-2 rounded-xl border p-4">
          <h3 className="font-semibold">Private roll call unavailable</h3>
          <p className="text-sm">Your institutional permission or the official session state could not be verified.</p>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => void attendance.refetch()}>Retry official read</button>
        </section> : <>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{attendance.data.title}</h3>
            <p className="text-sm text-muted-foreground">
              Session state: {attendance.data.status}. {countries.length} represented countries
              in this bounded administrative view.
            </p>
            {!mayRecord && <p role="status" className="rounded-lg border p-3 text-sm">
              Attendance editing is permitted only while the session is open or recessed.
            </p>}
          </div>

          {error && <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm">{error}</p>}
          {receipt && <p role="status" className="flex items-center gap-2 text-sm">
            <ShieldCheck aria-hidden="true" className="size-5" />
            Attendance receipt <code className="break-all">{receipt.operationId}</code> recorded.
            Revision {receipt.revision}.
          </p>}
          {retry.current && <section className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold">An earlier attendance operation may have committed</h3>
            <p className="text-sm">Use its original idempotency key. New changes are locked until this result is resolved.</p>
            <button disabled={busy} type="button" className="rounded-lg border px-4 py-2 text-sm"
              onClick={() => void execute(retry.current!)}>Retry the exact operation</button>
          </section>}
          {pending && <section className="space-y-4 rounded-xl border border-primary/50 p-4"
            aria-labelledby="attendance-review-title">
            <h3 id="attendance-review-title" className="font-semibold">Confirm official attendance record</h3>
            <p className="text-sm">{pending.description}</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => void execute(pending)}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
                Confirm and record</button>
              <button type="button" disabled={busy} onClick={() => setPending(null)}
                className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            </div>
          </section>}

          {!countries.length ? <p role="status">
            No countries with current institutional representation have been recorded.
          </p> : <form className="space-y-5" onSubmit={prepare}>
            <label className="block text-sm font-medium">
              Represented country
              <select value={country?.countryId ?? ""}
                disabled={busy || Boolean(pending) || Boolean(retry.current)}
                onChange={(event) => {
                  setSelectedCountryId(event.target.value);
                  setDraft(null); setPending(null); setReceipt(null); setError(null);
                }}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3">
                {countries.map((row) => <option key={row.countryId} value={row.countryId}>
                  {row.countryName} · {row.membershipStatus}
                </option>)}
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              Current representative: {country?.representativeName}.
              {country?.attendance
                ? " Recorded " + country.attendance.status +
                  " (revision " + country.attendance.revision + ")."
                : " No attendance record yet."}
            </p>
            <label className="block text-sm font-medium">
              Attendance status
              <select value={status} disabled={!mayRecord || busy || Boolean(pending) || Boolean(retry.current)}
                onChange={(event) => setChoice({
                  status: event.target.value as WorldAttendanceStatus,
                  proxyId: event.target.value === "proxy" ? proxyId : "",
                })}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3">
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="proxy" disabled={country?.membershipStatus !== "member" || !country?.proxies.length}>
                  Acting approved proxy
                </option>
              </select>
            </label>
            {status === "proxy" && <label className="block text-sm font-medium">
              Effective, institutionally approved proxy
              <select value={proxyId} required
                disabled={!mayRecord || busy || Boolean(pending) || Boolean(retry.current)}
                onChange={(event) => setChoice({ proxyId: event.target.value })}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3">
                <option value="">Select an approved proxy</option>
                {country?.proxies.map((proxy) =>
                  <option key={proxy.id} value={proxy.id}>{proxy.proxyPersonName}</option>)}
              </select>
              {!country?.proxies.length && <span className="mt-2 block text-xs text-muted-foreground">
                No valid proxy is currently approved. Proxy attendance cannot be recorded.
              </span>}
            </label>}
            <button type="submit"
              disabled={!mayRecord || busy || Boolean(pending) || Boolean(retry.current) ||
                status === "proxy" && !proxyId}
              className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Review attendance change
            </button>
          </form>}
        </>}
  </main>;
}
