import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAdminContext } from "@/components/admin/AdminContext";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
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
  source_key: string | null;
  read_at: string | null;
  resolved_at: string | null;
  requires_action: boolean;
  resolution_mode: "manual" | "domain";
  created_at: string;
};

const ADMIN_DEADLINE_FIELDS =
  "id,edition_id,show_id,kind,label,due_at,completed_at,notes,created_at";
const ADMIN_AUDIT_FIELDS =
  "id,actor_id,action,table_name,record_id,edition_id,country_id,before_data,after_data,created_at";
const ADMIN_NOTIFICATION_FIELDS =
  "id,recipient_id,severity,title,body,href,source_key,read_at,resolved_at,requires_action,resolution_mode,created_at";

const adminDb = supabase as any;

function missingSchema(error: unknown) {
  const text = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("could not find")
  );
}

function normalizeEditionId(editionId?: string | null) {
  return editionId?.trim() || null;
}

async function loadAdminDeadlines(editionId?: string | null) {
  const normalizedEditionId = normalizeEditionId(editionId);
  if (!normalizedEditionId) {
    throw new Error("Admin deadlines require an explicit Organizer edition scope.");
  }

  const { data, error } = await adminDb
    .from("admin_deadlines")
    .select(ADMIN_DEADLINE_FIELDS)
    .eq("edition_id", normalizedEditionId)
    .order("due_at", { ascending: true });

  if (error) {
    if (missingSchema(error)) return [] as AdminDeadline[];
    throw error;
  }

  return (data ?? []) as AdminDeadline[];
}

export function useAdminDeadlines(editionId?: string | null) {
  const { editionId: organizerContextEditionId } = useAdminContext();
  const requestedEditionId = normalizeEditionId(editionId);
  const organizerEditionId = normalizeEditionId(organizerContextEditionId);
  const exactEditionId =
    requestedEditionId && organizerEditionId === requestedEditionId ? requestedEditionId : null;

  return useQuery({
    enabled: Boolean(exactEditionId),
    queryKey: ["admin-deadlines", exactEditionId ?? "unscoped"],
    queryFn: () => {
      if (!exactEditionId) {
        throw new Error(
          "Admin deadlines must match the exact selected Organizer edition scope.",
        );
      }
      return loadAdminDeadlines(exactEditionId);
    },
  });
}

export function useEditionAdminDeadlines(editionId?: string | null) {
  const normalizedEditionId = normalizeEditionId(editionId);
  return useQuery({
    enabled: Boolean(normalizedEditionId),
    queryKey: ["admin-deadlines", normalizedEditionId ?? "unscoped"],
    queryFn: () => {
      if (!normalizedEditionId) {
        throw new Error("Edition deadlines require an explicit Organizer edition scope.");
      }
      return loadAdminDeadlines(normalizedEditionId);
    },
  });
}

export function useAdminAudit(limit = 30) {
  return useQuery({
    queryKey: ["admin-audit", limit],
    queryFn: async () => {
      const { data, error } = await adminDb
        .from("admin_audit_log")
        .select(ADMIN_AUDIT_FIELDS)
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
  const user = useAuthenticatedUser();

  return useQuery({
    // Keep notification cache identity-scoped. This also avoids asking Supabase
    // Auth to resolve session state from inside a query observer while the
    // Organizer tree is still mounting.
    queryKey: ["admin-notifications", user.id],
    queryFn: async () => {
      const { data, error } = await adminDb
        .from("admin_notifications")
        .select(ADMIN_NOTIFICATION_FIELDS)
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        if (missingSchema(error)) return [] as AdminNotification[];
        throw error;
      }

      return (data ?? []) as AdminNotification[];
    },
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export function useCreateAdminDeadline() {
  const qc = useQueryClient();
  const { editionId } = useAdminContext();
  const organizerEditionId = normalizeEditionId(editionId);

  return useMutation({
    mutationFn: async (
      payload: Omit<AdminDeadline, "id" | "created_at" | "completed_at">,
    ) => {
      if (!organizerEditionId || payload.edition_id !== organizerEditionId) {
        throw new Error(
          "Custom reminder creation requires the exact selected Organizer edition.",
        );
      }

      const { data, error } = await adminDb
        .from("admin_deadlines")
        .insert(payload)
        .select("id, edition_id")
        .single();
      if (error) throw error;
      if (!data || data.edition_id !== organizerEditionId) {
        throw new Error("Custom reminder creation returned an unexpected edition scope.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
  });
}

export function useToggleAdminDeadline() {
  const qc = useQueryClient();
  const { editionId } = useAdminContext();
  const organizerEditionId = normalizeEditionId(editionId);

  return useMutation({
    mutationFn: async ({ id, complete }: { id: string; complete: boolean }) => {
      if (!organizerEditionId) {
        throw new Error("Custom reminder changes require an explicit Organizer edition scope.");
      }

      const { data: current, error: currentError } = await adminDb
        .from("admin_deadlines")
        .select("id, edition_id, completed_at")
        .eq("id", id)
        .eq("edition_id", organizerEditionId)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current || current.edition_id !== organizerEditionId) {
        throw new Error("This reminder is not part of the selected Organizer edition.");
      }

      if (Boolean(current.completed_at) === complete) return;

      let update = adminDb
        .from("admin_deadlines")
        .update({ completed_at: complete ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("edition_id", organizerEditionId);

      update = current.completed_at
        ? update.eq("completed_at", current.completed_at)
        : update.is("completed_at", null);

      const { data: updated, error } = await update
        .select("id, edition_id, completed_at")
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        throw new Error(
          "This reminder changed before your action was applied. Refresh and review the current state.",
        );
      }
      if (updated.edition_id !== organizerEditionId || Boolean(updated.completed_at) !== complete) {
        throw new Error("Custom reminder state could not be reconciled after the update.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const user = useAuthenticatedUser();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await adminDb
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_id", user.id)
        .select("id, recipient_id, read_at")
        .maybeSingle();

      if (error) throw error;
      if (!data || data.recipient_id !== user.id || !data.read_at) {
        throw new Error("Notification read state could not be reconciled for this account.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications", user.id] }),
  });
}

export function useResolveAdminNotification() {
  const qc = useQueryClient();
  const user = useAuthenticatedUser();

  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const resolvedAt = resolved ? new Date().toISOString() : null;
      const { data, error } = await adminDb
        .from("admin_notifications")
        .update({ resolved_at: resolvedAt })
        .eq("id", id)
        .eq("recipient_id", user.id)
        .select("id, recipient_id, resolved_at")
        .maybeSingle();

      if (error) throw error;
      if (!data || data.recipient_id !== user.id || Boolean(data.resolved_at) !== resolved) {
        throw new Error("Notification resolution state could not be reconciled for this account.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications", user.id] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const user = useAuthenticatedUser();

  return useMutation({
    mutationFn: async () => {
      const { error } = await adminDb
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user.id)
        .is("read_at", null);

      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications", user.id] }),
  });
}
