import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

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
  version: number;
  created_at: string;
  updated_at: string;
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

function operationIdentity(prefix: string) {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `${prefix}:${operationId}`,
  };
}

async function loadAdminDeadlines(editionId?: string | null) {
  const normalizedEditionId = normalizeEditionId(editionId);
  if (!normalizedEditionId) {
    throw new Error("Admin deadlines require an explicit Organizer edition scope.");
  }

  const { data, error } = await adminDb
    .from("admin_deadlines")
    .select("*")
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
  const user = useAuthenticatedUser();

  return useQuery({
    // Keep notification cache identity-scoped. This also avoids asking Supabase
    // Auth to resolve session state from inside a query observer while the
    // Organizer tree is still mounting.
    queryKey: ["admin-notifications", user.id],
    queryFn: async () => {
      const { data, error } = await adminDb
        .from("admin_notifications")
        .select("*")
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
  const pendingOperation = useRef<{
    fingerprint: string;
    operationId: string;
    idempotencyKey: string;
  } | null>(null);

  return useMutation({
    mutationFn: async (
      payload: Omit<AdminDeadline, "id" | "version" | "created_at" | "updated_at" | "completed_at">,
    ) => {
      if (!organizerEditionId || payload.edition_id !== organizerEditionId) {
        throw new Error(
          "Custom reminder creation requires the exact selected Organizer edition.",
        );
      }

      const fingerprint = JSON.stringify({
        editionId: payload.edition_id,
        showId: payload.show_id,
        label: payload.label.trim(),
        dueAt: payload.due_at,
        notes: payload.notes?.trim() || null,
      });
      const identity =
        pendingOperation.current?.fingerprint === fingerprint
          ? pendingOperation.current
          : { fingerprint, ...operationIdentity("custom-reminder-create") };
      pendingOperation.current = identity;

      const { error } = await adminDb.rpc("studio2_create_admin_deadline", {
        p_edition_id: payload.edition_id,
        p_show_id: payload.show_id,
        p_label: payload.label.trim(),
        p_due_at: payload.due_at,
        p_notes: payload.notes?.trim() || null,
        p_operation_id: identity.operationId,
        p_idempotency_key: identity.idempotencyKey,
        p_correlation_id: identity.operationId,
      });
      if (error) throw error;

      pendingOperation.current = null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
  });
}

export function useToggleAdminDeadline() {
  const qc = useQueryClient();
  const { editionId } = useAdminContext();
  const organizerEditionId = normalizeEditionId(editionId);
  const pendingOperations = useRef(
    new Map<
      string,
      { operationId: string; idempotencyKey: string; expectedVersion: number }
    >(),
  );

  return useMutation({
    mutationFn: async ({ id, complete }: { id: string; complete: boolean }) => {
      if (!organizerEditionId) {
        throw new Error("Custom reminder changes require an explicit Organizer edition scope.");
      }

      const operationKey = `${id}:${complete ? "complete" : "reopen"}`;
      let identity = pendingOperations.current.get(operationKey);

      if (!identity) {
        const { data: snapshot, error: snapshotError } = await adminDb.rpc(
          "studio2_admin_deadline_snapshot",
          { p_deadline_id: id },
        );
        if (snapshotError) throw snapshotError;
        if (!snapshot || snapshot.editionId !== organizerEditionId) {
          throw new Error("This reminder is not part of the selected Organizer edition.");
        }
        if (!Number.isInteger(snapshot.version) || snapshot.version < 1) {
          throw new Error("Custom reminder version is missing. Refresh before changing this reminder.");
        }

        identity = {
          ...operationIdentity(
            complete ? "custom-reminder-complete" : "custom-reminder-reopen",
          ),
          expectedVersion: snapshot.version,
        };
        pendingOperations.current.set(operationKey, identity);
      }

      const { error } = await adminDb.rpc("studio2_set_admin_deadline_completed", {
        p_deadline_id: id,
        p_expected_version: identity.expectedVersion,
        p_complete: complete,
        p_operation_id: identity.operationId,
        p_idempotency_key: identity.idempotencyKey,
        p_correlation_id: identity.operationId,
      });
      if (error) throw error;

      pendingOperations.current.delete(operationKey);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await adminDb
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });
}

export function useResolveAdminNotification() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await adminDb
        .from("admin_notifications")
        .update({ resolved_at: resolved ? new Date().toISOString() : null })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { error } = await adminDb
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", auth.user.id)
        .is("read_at", null);

      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });
}