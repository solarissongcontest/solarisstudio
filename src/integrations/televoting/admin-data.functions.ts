import { createServerFn } from "@tanstack/react-start";

export const getMergedTelevotingOverview = createServerFn({ method: "GET" }).handler(async () => {
  const [{ requireMergedTelevotingAdminServer }, { televotingAdmin }] = await Promise.all([
    import("@/integrations/televoting/admin-session.server"),
    import("@/integrations/televoting/client.server"),
  ]);

  await requireMergedTelevotingAdminServer();

  const [editions, rounds, openRounds, submissions, blocked, activeEdition] = await Promise.all([
    televotingAdmin.from("editions").select("id", { count: "exact", head: true }),
    televotingAdmin.from("rounds").select("id", { count: "exact", head: true }),
    televotingAdmin.from("rounds").select("id", { count: "exact", head: true }).eq("status", "open"),
    televotingAdmin.from("vote_submissions").select("id", { count: "exact", head: true }),
    televotingAdmin.from("anti_abuse_events").select("id", { count: "exact", head: true }).eq("status", "blocked"),
    televotingAdmin.from("editions").select("name").eq("is_active", true).maybeSingle(),
  ]);

  for (const result of [editions, rounds, openRounds, submissions, blocked, activeEdition]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    editions: editions.count ?? 0,
    rounds: rounds.count ?? 0,
    openRounds: openRounds.count ?? 0,
    submissions: submissions.count ?? 0,
    blocked: blocked.count ?? 0,
    activeEdition: activeEdition.data?.name ?? null,
  };
});
