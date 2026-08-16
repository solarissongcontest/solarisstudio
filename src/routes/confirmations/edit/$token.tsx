import "@/confirmations.css";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { ConfirmationForm } from "@/components/ConfirmationForm";
import { Button } from "@/components/ui/button";
import { resolveEditToken } from "@/lib/public.functions";

export const Route = createFileRoute("/confirmations/edit/$token")({
  head: () => ({
    meta: [
      { title: "Edit Confirmation — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditConfirmationPage,
});

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
      <div className="confirmations-theme min-h-screen">
        <div className="confirmations-backdrop" aria-hidden="true" />
        <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-12">
          <div className="confirmations-surface w-full p-8 text-center text-sm text-white/55">
            Loading your confirmation…
          </div>
        </main>
      </div>
    );
  }

  const result = data as
    | {
        valid?: boolean;
        reason?: string;
        submission?: Record<string, unknown> | null;
        round?: any;
      }
    | undefined;

  if (!result?.valid || !result.submission || !result.round) {
    const editingClosed = result?.reason === "editing_closed";

    return (
      <div className="confirmations-theme min-h-screen">
        <div className="confirmations-backdrop" aria-hidden="true" />
        <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-12">
          <section className="confirmations-surface w-full p-7 text-center sm:p-9">
            <LockKeyhole className="mx-auto size-8 text-white/45" />
            <h1 className="mt-4 text-2xl font-medium text-white">
              {editingClosed ? "Editing is closed" : "This edit link is no longer valid"}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/52">
              {editingClosed
                ? "Your response is still saved, but editing is currently disabled for this round."
                : "The link may have expired, been revoked or already been replaced."}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/confirmations">
                <ArrowLeft className="size-4" /> Return to confirmations
              </Link>
            </Button>
          </section>
        </main>
      </div>
    );
  }

  const country = typeof result.submission.country === "string" ? result.submission.country : "Your country";

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-7">
          <Link
            to="/confirmations"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs text-white/65 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Confirmations
          </Link>
        </div>

        <header className="mb-7 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">
            {result.round.edition_name}
          </p>
          <h1 className="confirmations-display mt-3 text-5xl font-normal uppercase leading-none sm:text-6xl">
            Edit confirmation
          </h1>
          <p className="mt-4 text-sm text-white/55">
            {country} · {result.round.name}
          </p>
        </header>

        <div className="confirmations-surface mb-5 border-sky-200/15 p-4">
          <p className="text-sm font-medium text-white">Editing your existing response</p>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            Saving changes updates the same response stored by the original Confirmations site.
          </p>
        </div>

        <ConfirmationForm
          round={result.round}
          editToken={token}
          prefill={result.submission}
        />
      </main>
    </div>
  );
}
