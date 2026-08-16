import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationRound = {
  id: string;
  edition_id: string;
  name: string;
  status: "draft" | "open" | "closed" | "auto_closed";
  editing_enabled: boolean;
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  response_count: number;
  created_at: string;
};

export type ConfirmationEdition = {
  id: string;
  name: string;
  edition_number: number;
  description: string | null;
  status: "draft" | "active" | "finished";
  editing_enabled: boolean;
  created_at: string;
  response_count: number;
  rounds: ConfirmationRound[];
};

export async function requireConfirmationsAdmin() {
  const { data: sessionData, error: sessionError } =
    await confirmationsSupabase.auth.getSession();

  if (sessionError) throw sessionError;

  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: isAdmin, error: roleError } = await confirmationsSupabase.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });

  if (roleError) throw roleError;
  return isAdmin === true ? user : null;
}

export async function loadConfirmationEditions(): Promise<ConfirmationEdition[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_editions");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationEdition[]) : [];
}

export async function saveConfirmationEdition(payload: {
  id?: string;
  name: string;
  edition_number: number;
  description?: string;
  status: ConfirmationEdition["status"];
  editing_enabled: boolean;
}) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_save_edition", {
    _payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteConfirmationEdition(id: string) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_delete_edition", {
    _id: id,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationEditionEditing(id: string, enabled: boolean) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_edition_editing", {
    _id: id,
    _enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}

export async function saveConfirmationRound(payload: {
  id?: string;
  edition_id: string;
  name: string;
  status: ConfirmationRound["status"];
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  editing_enabled: boolean;
}) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_save_round", {
    _payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteConfirmationRound(id: string) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_delete_round", {
    _id: id,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationRoundStatus(
  id: string,
  status: ConfirmationRound["status"],
) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_round_status", {
    _id: id,
    _status: status,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationRoundEditing(id: string, enabled: boolean) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_round_editing", {
    _id: id,
    _enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}
