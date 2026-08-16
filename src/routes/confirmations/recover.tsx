import "@/confirmations.css";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recoverSubmission } from "@/lib/confirmation-recovery.functions";
import { getPublicRounds, type PublicRound } from "@/lib/public.functions";
import { getBrowserSessionId } from "@/lib/session";

export const Route = createFileRoute("/confirmations/recover")({
  head: () => ({
    meta: [
      { title: "Recover Confirmation — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: () => getPublicRounds(),
  component: RecoverConfirmationPage,
});

function RecoverConfirmationPage() {
  const rounds: PublicRound[] = Route.useLoaderData();
  const recover = useServerFn(recoverSubmission);
  const sessionId = useMemo(() => getBrowserSessionId(), []);

  const [roundId, setRoundId] = useState(rounds.length === 1 ? rounds[0]!.id : "");
  const [country, setCountry] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);

    if (!roundId) return setError("Choose the confirmation round.");
    if (!country.trim()) return setError("Enter your country.");
    if (!code.trim()) return setError("Enter your recovery code.");
    if (!sessionId) return setError("This browser is blocking local storage, so it cannot be remembered.");

    setBusy(true);
    try {
      const result = await recover({
        data: {
          round_id: roundId,
          country: country.trim(),
          recovery_code: code.trim().toUpperCase(),
          browser_session_id: sessionId,
        },
      });

      if (!result.ok || !result.token) {
        setError(
          result.error === "invalid_recovery"
            ? "That country and recovery code do not match."
            : "The response could not be recovered.",
        );
        return;
      }

      window.location.assign(`/confirmations/edit/${encodeURIComponent(result.token)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The response could not be recovered.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-12">
        <section className="confirmations-surface w-full p-6 sm:p-8">
          <Link
            to="/confirmations"
            className="inline-flex items-center gap-2 text-xs text-white/55 transition hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Back to confirmations
          </Link>

          <div className="mt-6 flex size-11 items-center justify-center rounded-full border border-sky-200/15 bg-sky-200/10 text-sky-100">
            <KeyRound className="size-5" />
          </div>
          <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">Response access</p>
          <h1 className="confirmations-display mt-3 text-4xl font-normal uppercase leading-none sm:text-5xl">Recover response</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            Use the same recovery code from the original Confirmations site. This browser will then be linked to that existing response too.
          </p>

          <div className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-round">Confirmation round</Label>
              <select
                id="recovery-round"
                value={roundId}
                onChange={(event) => setRoundId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.edition_name} — {round.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recovery-country">Country</Label>
              <Input
                id="recovery-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="Oland"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recovery-code">Recovery code</Label>
              <Input
                id="recovery-code"
                value={code}
                autoCapitalize="characters"
                autoCorrect="off"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="AB12-CD34-EF56"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div>
            ) : null}

            <Button className="w-full" disabled={busy} onClick={() => void submit()}>
              <KeyRound className="size-4" /> {busy ? "Recovering…" : "Recover response"}
            </Button>
          </div>

          <p className="mt-5 text-center text-[10px] leading-relaxed text-white/32">
            Recovery uses the same live response record as the old Confirmations page. Nothing is copied or duplicated.
          </p>
        </section>
      </main>
    </div>
  );
}
