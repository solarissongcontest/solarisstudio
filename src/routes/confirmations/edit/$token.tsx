import "@/confirmations.css";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { ConfirmationFormWithReceipt } from "@/components/ConfirmationFormWithReceipt";
import { ParticipationRouteChrome, ParticipationServiceShell } from "@/components/ParticipationServiceShell";
import {
  ConfirmationReviewStatus,
  type ConfirmationReviewEntry,
} from "@/components/ConfirmationReviewStatus";
import { Button } from "@/components/ui/button";
import { resolveEditToken } from "@/lib/confirmation-edit.functions";

export const Route = createFileRoute("/confirmations/edit/$token")({
  head: () => ({
    meta: [
      { title: "Edit Confirmation — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditConfirmationPage,
});

type EditableSubmission = Record<string, unknown> & {
  country?: string | null;
  selection_method?: string | null;
  internal_entries?: ConfirmationReviewEntry | null;
  national_finals?: {
    id?: string | null;
    nf_name?: string | null;
    winning_entry_id?: string | null;
    national_final_entries?: ConfirmationReviewEntry[] | null;
  } | null;
};

function EditConfirmationPage() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveEditToken);

  const { data, isLoading } = useQuery({
    queryKey: ["confirmation-edit-token", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <ParticipationRouteChrome>
        <ParticipationServiceShell
          service="confirmations"
          title="Edit confirmation"
          description="Loading your saved response…"
          maxWidth="max-w-3xl"
        >
          <div className="data-panel p-6 text-center text-sm text-muted-foreground">
            Loading your confirmation…
          </div>
        </ParticipationServiceShell>
      </ParticipationRouteChrome>
    );
  }

  const result = data as
    | {
        valid?: boolean;
        reason?: string;
        submission?: EditableSubmission | null;
        round?: any;
      }
    | undefined;

  if (!result?.valid || !result.submission || !result.round) {
    const editingClosed = result?.reason === "editing_closed";

    return (
      <ParticipationRouteChrome>
        <ParticipationServiceShell
          service="confirmations"
          title={editingClosed ? "Editing is closed" : "Edit link unavailable"}
          description={
            editingClosed
              ? "Your response is still saved, but editing is currently disabled for this round."
              : "This edit link may have expired, been revoked or already been replaced."
          }
          actions={[{ to: "/confirmations", label: "Back to confirmations" }]}
          maxWidth="max-w-3xl"
        >
          <div className="data-panel p-6 text-center sm:p-8">
            <LockKeyhole className="mx-auto size-7 text-muted-foreground" />
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {editingClosed
                ? "The original confirmation remains recorded. Editing can resume only if the round is reopened."
                : "Open Confirmations to find the active round or recover another saved response."}
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/confirmations">
                <ArrowLeft className="size-4" /> Return to confirmations
              </Link>
            </Button>
          </div>
        </ParticipationServiceShell>
      </ParticipationRouteChrome>
    );
  }

  const country = typeof result.submission.country === "string" ? result.submission.country : "Your country";
  const nf = result.submission.national_finals;

  return (
    <ParticipationRouteChrome>
      <ParticipationServiceShell
        service="confirmations"
        title="Edit confirmation"
        description={`${country} · ${result.round.name}. Update the same saved response without creating a duplicate.`}
        actions={[{ to: "/confirmations", label: "Back to confirmations" }]}
        maxWidth="max-w-3xl"
      >
        <div className="confirmations-theme space-y-5">
          <div className="data-panel border-primary/20 p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              {result.round.edition_name}
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-[-.02em]">Editing your existing response</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Saving changes updates the same confirmation that was originally submitted.
            </p>
          </div>

          <ConfirmationReviewStatus
            selectionMethod={result.submission.selection_method}
            internalEntry={result.submission.internal_entries}
            nationalFinal={
              nf
                ? {
                    id: nf.id,
                    nf_name: nf.nf_name,
                    winning_entry_id: nf.winning_entry_id,
                    entries: nf.national_final_entries ?? [],
                  }
                : null
            }
          />

          <ConfirmationFormWithReceipt
            round={result.round}
            editToken={token}
            prefill={result.submission}
          />
        </div>
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
