import { supabase } from "@/integrations/supabase/client";

/** Fail closed if a pending preference click belongs to another signed-in user. */
export async function assertCurrentFollowingActor(expectedViewerId: string): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== expectedViewerId) {
    throw new Error("Following account changed before the preference update.");
  }
}
