import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink, LockKeyhole, RadioTower, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AdminCard, AdminStatus } from "@/components/admin/AdminUI";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useEdition, useShows } from "@/lib/data";
import { resolveVoting } from "@/lib/voting";

const supabase = typedSupabase as any;

type WindowRow = {
  show_id: string;
  edition_id: string;
  status: "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

export function JuryVotingWindowControl() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const match = location.pathname.match(/^\/admin\/jury\/([^/]+)\/?$/i);
  const slug = match ? decodeURIComponent(match[1]) : null;
  const { data: edition } = useEdition(slug ?? undefined);
  const { data: shows = [] } = useShows(edition?.id);
  const queryClient = useQueryClient();

  const searchShow =
    location.search && typeof location.search === "object"
      ? (location.search as Record<string, unknown>).show
      : null;
  const orderedShows = [...shows].sort((a, b) => a.sort_order - b.sort_order);
  const selectedShow =
    orderedShows.find((show) => show.id === searchShow) ?? orderedShows[0] ?? null;

  const { data: windows = [], isLoading } = useQuery<WindowRow[]>({
    enabled: Boolean(edition?.id && slug),
    queryKey: ["jury-voting-windows", edition?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jury_voting_windows")
        .select("show_id,edition_id,status,opened_at,closed_at,updated_at")
        .eq("edition_id", edition!.id);
      if (error) throw error;
      return (data ?? []) as WindowRow[];
    },
    staleTime: 5_000,
  });

  const setStatus = useMutation({
    mutationFn: async (status: "open" | "closed") => {
      if (!selectedShow) throw new Error("Choose a show first");
      const { data, error } = await supabase.rpc("admin_set_jury_voting_status", {
        _show_id: selectedShow.id,
        _status: status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, status) => {
      toast.success(status === "open" ? "Country-account jury voting opened" : "Country-account jury voting closed");
      await queryClient.invalidateQueries({ queryKey: ["jury-voting-windows"] });
    },
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Jury voting status could not be changed");
    },
  });

  if (!slug || !edition || !selectedShow) return null;

  const window = windows.find((row) => row.show_id === selectedShow.id) ?? null;
  const open = window?.status === "open";
  const voting = resolveVoting(selectedShow.voting_config);

  return (
    <AdminCard strong className="mb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="admin-section-label">Country-account jury voting</p>
            <AdminStatus tone={open ? "ready" : "neutral"}>
              {isLoading ? "Checking…" : open ? "Open" : "Closed"}
            </AdminStatus>
          </div>
          <h2 className="mt-1 text-base font-bold text-foreground">{selectedShow.name}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            When open, signed-in country accounts in this show's jury roster can submit their official ballot. The existing manual jury editor below remains available for organizer entry and corrections.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{voting.juryPoints.join(" · ")} points</span>
            <span>{voting.allowSelfVote ? "Self-voting allowed" : "Self-voting blocked"}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> Friend-voting integrity check required</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/jury-voting"
            target="_blank"
            className="admin-action-secondary !min-h-10"
          >
            <ExternalLink className="size-3.5" /> Preview booth
          </Link>
          {open ? (
            <button
              type="button"
              className="admin-action-secondary !min-h-10"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate("closed")}
            >
              <LockKeyhole className="size-3.5" /> {setStatus.isPending ? "Closing…" : "Close jury voting"}
            </button>
          ) : (
            <button
              type="button"
              className="admin-action-primary !min-h-10"
              disabled={setStatus.isPending || !voting.juryEnabled}
              onClick={() => setStatus.mutate("open")}
            >
              <RadioTower className="size-3.5" /> {setStatus.isPending ? "Opening…" : "Open jury voting"}
            </button>
          )}
        </div>
      </div>

      {!voting.juryEnabled ? (
        <p className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.045] p-3 text-xs text-amber-100">
          Jury voting is disabled in this show's Voting system. Enable the jury component there before opening the country-account booth.
        </p>
      ) : null}
    </AdminCard>
  );
}
