import "@/confirmations.css";

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";

import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
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
    <ParticipationRouteChrome>
      <ParticipationServiceShell
        service="confirmations"
        title="Recover response"
        description="Use your recovery code to reopen an existing confirmation response on this browser."
        actions={[
          { to: "/confirmations", label: "Confirmations" },
          { to: "/confirmations/next-in-line", label: "Next in Line" },
        ]}
        maxWidth="max-w-xl"
      >
        <div className="confirmations-theme">
          <section className="data-panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <KeyRound className="size-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold">Response access</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Recovery links this browser to the same live response record. Nothing is copied or duplicated.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-round">Confirmation round</Label>
                <select
                  id="recovery-round"
                  value={roundId}
                  onChange={(event) => setRoundId(event.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
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
          </section>
        </div>
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
