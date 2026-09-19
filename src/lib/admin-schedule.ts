import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AdminScheduleItem = {
  id: string;
  source: "submission" | "publication" | "communication" | "edition" | "reminder";
  kind: "opens" | "closes" | "reveal" | "send" | "event" | "reminder";
  label: string;
  at: string;
  href: string;
  detail: string;
};

const db = supabase as any;

/**
 * Canonical operational schedule.
 *
 * Workflow dates are read from the workflows that actually own them. The
 * legacy admin_deadlines table is retained only for explicit custom reminders.
 * This prevents Organizer Home/Calendar from inventing a second set of dates
 * that does not control the underlying service.
 */
export function useAdminOperationalSchedule(editionId?: string | null, slug?: string | null) {
  return useQuery({
    queryKey: ["admin-operational-schedule", editionId ?? "none", slug ?? ""],
    enabled: Boolean(editionId),
    queryFn: async () => {
      if (!editionId) return [] as AdminScheduleItem[];

      const [roundsResult, entriesResult, noticesResult, editionResult, remindersResult] =
        await Promise.all([
          db
            .from("submission_rounds")
            .select("id,name,status,opens_at,closes_at")
            .eq("edition_id", editionId),
          db
            .from("participants")
            .select("id,artist,song,publication_status,scheduled_publish_at")
            .eq("edition_id", editionId)
            .is("show_id", null)
            .eq("publication_status", "scheduled")
            .not("scheduled_publish_at", "is", null),
          db
            .from("studio2_official_notices")
            .select("id,title,status,scheduled_at")
            .eq("edition_id", editionId)
            .eq("status", "scheduled")
            .not("scheduled_at", "is", null),
          db.from("editions").select("id,event_date").eq("id", editionId).maybeSingle(),
          db
            .from("admin_deadlines")
            .select("id,label,due_at,notes,completed_at")
            .eq("edition_id", editionId)
            .is("completed_at", null),
        ]);

      const failures = [
        ["submission rounds", roundsResult.error],
        ["entry publication", entriesResult.error],
        ["communications", noticesResult.error],
        ["edition", editionResult.error],
        ["custom reminders", remindersResult.error],
      ].filter(([, error]) => Boolean(error));

      if (failures.length) {
        throw new Error(
          `Operational schedule could not be verified: ${failures
            .map(([source]) => source)
            .join(", ")}.`,
        );
      }

      const items: AdminScheduleItem[] = [];
      const confirmationHref = "/confirmations/admin/rounds";
      const entriesHref = slug ? `/admin/entries/${slug}` : "/admin";
      const editionHref = slug ? `/admin/shows/${slug}` : "/admin";

      for (const round of roundsResult.data ?? []) {
        if (round.opens_at) {
          items.push({
            id: `submission-open:${round.id}`,
            source: "submission",
            kind: "opens",
            label: `${round.name} opens`,
            at: round.opens_at,
            href: confirmationHref,
            detail: "Confirmation submission round",
          });
        }
        if (round.closes_at) {
          items.push({
            id: `submission-close:${round.id}`,
            source: "submission",
            kind: "closes",
            label: `${round.name} closes`,
            at: round.closes_at,
            href: confirmationHref,
            detail: "Confirmation submission round",
          });
        }
      }

      for (const entry of entriesResult.data ?? []) {
        if (!entry.scheduled_publish_at) continue;
        const entryLabel = [entry.artist, entry.song].filter(Boolean).join(" — ");
        items.push({
          id: `entry-reveal:${entry.id}`,
          source: "publication",
          kind: "reveal",
          label: entryLabel ? `Reveal: ${entryLabel}` : "Scheduled entry reveal",
          at: entry.scheduled_publish_at,
          href: entriesHref,
          detail: "Entry publication schedule",
        });
      }

      for (const notice of noticesResult.data ?? []) {
        if (!notice.scheduled_at) continue;
        items.push({
          id: `notice:${notice.id}`,
          source: "communication",
          kind: "send",
          label: `Send: ${notice.title}`,
          at: notice.scheduled_at,
          href: "/admin/communications",
          detail: "Official communication",
        });
      }

      if (editionResult.data?.event_date) {
        items.push({
          id: `edition-event:${editionId}`,
          source: "edition",
          kind: "event",
          label: "Edition event date",
          at: `${editionResult.data.event_date}T12:00:00`,
          href: editionHref,
          detail: "Edition schedule",
        });
      }

      for (const reminder of remindersResult.data ?? []) {
        items.push({
          id: `reminder:${reminder.id}`,
          source: "reminder",
          kind: "reminder",
          label: reminder.label,
          at: reminder.due_at,
          href: "/admin/system",
          detail: reminder.notes || "Custom organizer reminder",
        });
      }

      return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    },
  });
}
