import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useAllVoters,
  useEditions,
} from "@/lib/data";
import { buildEditionReadiness } from "@/lib/admin-readiness";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

export function AdminHealthStrip() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: voters = [] } = useAllVoters();
  const { data: juryVotes = [] } = useAllJuryVotes();
  const { data: televotes = [] } = useAllTelevotes();
  const { data: results = [] } = useAllResults();

  const edition = editions.find((item) => item.id === editionId) ?? editions[0] ?? null;
  if (!edition) return null;

  const readiness = buildEditionReadiness({ edition, shows, participants, voters, juryVotes, televotes, results });

  return (
    <div className="border-t border-border/45 bg-surface/35 px-3 py-2 text-xs sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            readiness.status === "ready" ? "bg-emerald-400" : readiness.status === "blocked" ? "bg-red-400" : "bg-amber-300",
          )}
        />
        <span className={cn("shrink-0 font-bold", readiness.status === "blocked" && "text-red-300")}>
          {readiness.issues.length ? `${readiness.issues.length} things need attention` : "Ready"}
        </span>
        {readiness.issues[0] && <span className="truncate text-muted-foreground">{readiness.issues[0].title}</span>}
        <span className="ml-auto shrink-0 text-[10px] font-semibold text-muted-foreground">{readiness.progress}% ready</span>
      </div>
    </div>
  );
}
