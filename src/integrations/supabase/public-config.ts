/**
 * Public Solaris database coordinates.
 *
 * Supabase publishable keys are intentionally safe to ship to browsers; RLS is
 * the authorization boundary. Keeping a checked-in fallback prevents a
 * Cloudflare build that lacks Vite build-time variables from silently turning
 * every public route into an empty state. Deployment variables still take
 * precedence so rotation does not require an application release.
 */
export const SOLARIS_SUPABASE_URL = "https://oxtbskojiexkaspputvo.supabase.co";
export const SOLARIS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HlFRpOFUHzotkO609JPXgQ_ZWi8DSCj";

export function getSolarisSupabaseUrl() {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    SOLARIS_SUPABASE_URL
  );
}

export function getSolarisSupabasePublishableKey() {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    SOLARIS_SUPABASE_PUBLISHABLE_KEY
  );
}
