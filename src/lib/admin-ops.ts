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
  updated_at?: string;
  version?: number;
  archived_at?: string | null;
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

type AdminDeadlineCommandResult = {
  ok: boolean;
  action: "create" | "update" | "complete" | "reopen" | "archive";
  operationId: string;
  deadlineId: string;
  editionId: string;
  showId?: string | null;
  version: number;
  state: "open" | "completed" | "archived";
};

type OperationReceipt = {
  operationId?: string;
  status?: "processing" | "succeeded" | "failed" | "uncertain";
  result?: AdminDeadlineCommandResult | null;
  error?: unknown;
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

async function loadAdminDeadlines(editionId?: string | null) {
  const normalizedEditionId = normalizeEditionId(editionId);
  if (!normalizedEditionId) {
    throw new Error("Admin deadlines require an explicit Organizer edition scope.");
  }

  const { data, error } = await adminDb
    .from("admin_deadlines")
    .select("*")
    .eq("edition_id", normalizedEditionId)
    .is("archived_at", null)
    .order("due_at", { ascending: true });

  if (error) {
    if (missingSchema(error)) return [] as AdminDeadline[];
    throw error;
  }

  return (data ?? []) as AdminDeadline[];
}

async function reconcileAdminDeadlineOperation(operationId: string) {
  const { data, error } = await adminDb.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (error) return null;

  const receipt = (data ?? null) as OperationReceipt | null;
  if (receipt?.status === "succeeded" && receipt.result?.ok) {
    return receipt.result;
  }

  return null;
}

async function applyAdminDeadlineCommand(
  args: Record<string, unknown> & {
    p_operation_id: string;
    p_edition_id: string;
  },
): Promise<AdminDeadlineCommandResult> {
  const { data, error } = await adminDb.rpc("studio2_apply_admin_deadline", args);

  if (!error && data) {
    return data as AdminDeadlineCommandResult;
  }

  // A transport failure after the database committed is an uncertain outcome,
  // not permission to blindly retry the mutation. Reconcile the stable operation
  // identity first; semantic retry with the same idempotency key remains safe.
  const reconciled = await reconcileAdminDeadlineOperation(args.p_operation_id);
  if (reconciled) return reconciled;

  throw error ?? new Error("Custom reminder operation did not return an authoritative result.");
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

  return useMutation({
    mutationFn: async (
      payload: Pick<
        AdminDeadline,
        "edition_id" | "show_id" | "kind" | "label" | "due_at" | "notes"
      >,
    ) => {
      if (!organizerEditionId || payload.edition_id !== organizerEditionId) {
        throw new Error(
          "Custom reminder creation requires the exact selected Organizer edition.",
        );
      }

      const operationId = crypto.randomUUID();
      const result = await applyAdminDeadlineCommand({
        p_action: "create",
        p_edition_id: organizerEditionId,
        p_operation_id: operationId,
        p_idempotency_key: operationId,
        p_deadline_id: null,
        p_expected_version: 0,
        p_show_id: payload.show_id,
        p_kind: payload.kind,
        p_label: payload.label,
        p_due_at: payload.due_at,
        p_notes: payload.notes,
        p_correlation_id: operationId,
      });

      if (!result.ok || result.editionId !== organizerEditionId || result.state === "archived") {
        throw new Error("Custom reminder creation returned an unexpected authoritative result.");
      }

      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
        qc.invalidateQueries({ queryKey: ["organizer-v3-projection"] }),
        qc.invalidateQueries({ queryKey: ["admin-audit"] }),
      ]);
    },
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

      const { data: preview, error: previewError } = await adminDb.rpc(
        "studio2_admin_deadline_preview",
        {
          p_edition_id: organizerEditionId,
          p_deadline_id: id,
        },
      );
      if (previewError) throw previewError;
      if (!preview || preview.editionId !== organizerEditionId || preview.state === "archived") {
        throw new Error("This reminder is not part of the selected Organizer edition.");
      }

      if ((preview.state === "completed") === complete) return preview;

      const operationId = crypto.randomUUID();
      const result = await applyAdminDeadlineCommand({
        p_action: complete ? "complete" : "reopen",
        p_edition_id: organizerEditionId,
        p_operation_id: operationId,
        p_idempotency_key: operationId,
        p_deadline_id: id,
        p_expected_version: preview.version,
        p_show_id: null,
        p_kind: null,
        p_label: null,
        p_due_at: null,
        p_notes: null,
        p_correlation_id: operationId,
      });

      if (
        !result.ok ||
        result.editionId !== organizerEditionId ||
        (result.state === "completed") !== complete
      ) {
        throw new Error("Custom reminder state could not be reconciled after the operation.");
      }

      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-deadlines"] }),
        qc.invalidateQueries({ queryKey: ["organizer-v3-projection"] }),
        qc.invalidateQueries({ queryKey: ["admin-audit"] }),
      ]);
    },
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
