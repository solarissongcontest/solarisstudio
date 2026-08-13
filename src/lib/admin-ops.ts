import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AdminDeadline = {
  id: string;
  edition_id: string | null;
  show_id: string | null;
  kind: string;
  label: string;
  due_at: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type AdminAuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  edition_id: string | null;
  country_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

export type AdminNotification = {
  id: string;
  recipient_id: string;
  severity: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

function missingSchema(error: unknown) {
  const text = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find");
}

export function useAdminDeadlines(editionId?: string | null) {
  return useQuery({
    queryKey: ["admin-deadlines", editionId ?? "all"],
    queryFn: async () => {
      let query = (supabase.from("admin_deadlines") as any).select("*").order("due_at", { ascending: true });
      if (editionId) query = query.eq("edition_id", editionId);
      const { data, error } = await query;
      if (error) {
        if (missingSchema(error)) return [] as AdminDeadline[];
        throw error;
      }
      return (data ?? []) as AdminDeadline[];
    },
  });
}

export function useAdminAudit(limit = 30) {
  return useQuery({
    queryKey: ["admin-audit", limit],
    queryFn: async () => {
      const { data, error } = await (supabase.from("admin_audit_log") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (missingSchema(error)) return [] as AdminAuditRow[];
        throw error;
      }
      return (data ?? []) as AdminAuditRow[];
    },
  });
}

export function useAdminNotifications() {
  return useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [] as AdminNotification[];
      const { data, error } = await (supabase.from("admin_notifications") as any)
        .select("*")
        .eq("recipient_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if (missingSchema(error)) return [] as AdminNotification[];
        throw error;
      }
      return (data ?? []) as AdminNotification[];
    },
  });
}

export function useCreateAdminDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<AdminDeadline, "id" | "created_at" | "completed_at">) => {
      const { error } = await (supabase.from("admin_deadlines") as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
  });
}

export function useToggleAdminDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, complete }: { id: string; complete: boolean }) => {
      const { error } = await (supabase.from("admin_deadlines") as any)
        .update({ completed_at: complete ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("admin_notifications") as any)
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });
}
