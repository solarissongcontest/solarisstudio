import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  SUPABASE_SERVICE_RESTRICTION_EVENT,
  clearSupabaseServiceRestriction,
  readSupabaseServiceRestriction,
  type SupabaseServiceRestriction,
} from "@/lib/supabase-service-restriction";

export function SupabaseRestrictionBanner() {
  const [restriction, setRestriction] = useState<SupabaseServiceRestriction | null>(null);

  useEffect(() => {
    setRestriction(readSupabaseServiceRestriction());

    const handleRestriction = (event: Event) => {
      const detail = (event as CustomEvent<SupabaseServiceRestriction>).detail;
      setRestriction(detail ?? readSupabaseServiceRestriction());
    };

    window.addEventListener(SUPABASE_SERVICE_RESTRICTION_EVENT, handleRestriction);
    return () =>
      window.removeEventListener(SUPABASE_SERVICE_RESTRICTION_EVENT, handleRestriction);
  }, []);

  if (!restriction) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[1000] mx-auto max-w-3xl rounded-2xl border border-amber-300/35 bg-background/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Solaris data service is temporarily restricted
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Supabase returned a service-restriction response. Some pages may be incomplete or
            read-only, and saves can fail. Do not repeat a submission unless Solaris confirms that
            the previous attempt failed.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          onClick={() => {
            clearSupabaseServiceRestriction();
            window.location.reload();
          }}
        >
          Retry data
        </button>
      </div>
    </div>
  );
}
