import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";

type OrganizerAccessState = "checking" | "allowed" | "redirecting";

/**
 * Mounted, fail-closed Organizer authorization boundary.
 *
 * Authentication remains in the parent route beforeLoad, but the additional
 * Organizer role lookup must not run as a second asynchronous route loader during
 * the router's pre-mount bootstrap. Children never mount until authoritative V2
 * Organizer access has been confirmed for the current authenticated account.
 */
export function OrganizerAccessGate({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<OrganizerAccessState>("checking");

  useEffect(() => {
    let active = true;

    void (async () => {
      let allowed = false;
      try {
        allowed = await hasSolarisOrganizerAccess(userId);
      } catch {
        allowed = false;
      }

      if (!active) return;
      if (allowed) {
        setState("allowed");
        return;
      }

      setState("redirecting");
      await navigate({
        to: "/my-solaris",
        search: { notice: "organizer-access-required" },
        replace: true,
      });
    })();

    return () => {
      active = false;
    };
  }, [navigate, userId]);

  if (state === "allowed") return <>{children}</>;

  return (
    <main
      id="main-content"
      className="grid min-h-[60vh] place-items-center bg-[#020817] px-4 text-white"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.06] text-sky-100">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {state === "checking" ? "Checking Organizer access…" : "Opening My Solaris…"}
            </p>
            <p className="mt-1 text-xs text-white/60">
              Solaris is verifying the current Organizer session.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
