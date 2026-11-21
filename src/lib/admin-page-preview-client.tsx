import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_PAGE_PREVIEW_SESSION_PATH } from "@/lib/admin-page-preview";

/** Establishes a short-lived HttpOnly preview cookie from a fresh, server-
 * verified Organizer session. Never stores a preview grant in localStorage. */
export async function ensureAdminPagePreviewSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in to preview Solaris pages.");
  const response = await fetch(ADMIN_PAGE_PREVIEW_SESSION_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { authorization: `Bearer ${data.session.access_token}` },
  });
  if (!response.ok) throw new Error("Organizer preview permission could not be verified.");
}

export async function clearAdminPagePreviewSession(): Promise<void> {
  await fetch(ADMIN_PAGE_PREVIEW_SESSION_PATH, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
}

/** Mounted only beneath OrganizerAccessGate after its actual role check. */
export function AdminPagePreviewSessionSync() {
  useEffect(() => {
    void ensureAdminPagePreviewSession().catch(() => undefined);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void clearAdminPagePreviewSession().catch(() => undefined);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}
