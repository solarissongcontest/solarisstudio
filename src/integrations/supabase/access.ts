import { supabase } from "@/integrations/supabase/client";

export async function hasSolarisOrganizerAccess(userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("studio2_role_assignments")
    .select("id")
    .eq("user_id", userId)
    .in("role_key", ["organizer", "superadmin"])
    .is("edition_id", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
