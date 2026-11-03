import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { JuryShareAvailabilityReason } from "@/lib/v3-jury-share-card-foundation";

const COPY: Record<
  JuryShareAvailabilityReason,
  { trigger: string; title: string; detail: string }
> = {
  RESULTS_NOT_PUBLISHED: {
    trigger: "Share after results",
    title: "Share after results",
    detail: "Your official jury-vote graphic becomes available when these jury results are published.",
  },
  JURY_BREAKDOWN_PRIVATE: {
    trigger: "Share unavailable",
    title: "Sharing is not available yet",
    detail: "The publication policy for this jury breakdown does not currently allow a share card.",
  },
  BALLOT_NOT_FINAL: {
    trigger: "Share unavailable",
    title: "Ballot not final",
    detail: "Only a finalized official jury ballot can be turned into a share card.",
  },
  BALLOT_UNAVAILABLE: {
    trigger: "Share unavailable",
    title: "Jury vote unavailable",
    detail: "Solaris could not establish an official ballot that is safe to share.",
  },
};

export type V3JuryShareUnavailableSheetProps = {
  editionLabel: string;
  showLabel: string;
  sourceLabel?: string | null;
  reason?: JuryShareAvailabilityReason | null;
  className?: string;
};

export function V3JuryShareUnavailableSheet({
  editionLabel,
  showLabel,
  sourceLabel,
  reason,
  className,
}: V3JuryShareUnavailableSheetProps) {
  const copy = reason
    ? COPY[reason]
    : {
        trigger: "Share unavailable",
        title: "Jury-vote sharing is unavailable",
        detail:
          "Solaris cannot prove a publication-safe official jury ballot for this result, so it will not generate or reconstruct a share card.",
      };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className={className}>
          <LockKeyhole aria-hidden="true" />
          {copy.trigger}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="responsive"
        className="overflow-y-auto bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-[min(34rem,56vw)] sm:max-w-[34rem]"
      >
        <SheetHeader className="pr-10 text-left">
          <SheetTitle>
            {editionLabel} · {showLabel}
          </SheetTitle>
          <SheetDescription>
            {sourceLabel ? `${sourceLabel} jury vote` : "Jury vote"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5" role="status">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-background">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-semibold">{copy.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.detail}</p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          This state comes from Solaris publication and ballot authority. Refreshing or changing the device clock cannot unlock it.
        </p>
      </SheetContent>
    </Sheet>
  );
}
