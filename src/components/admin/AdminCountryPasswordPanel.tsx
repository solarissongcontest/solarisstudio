import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { AdminConfirmSheet, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { adminSetSolarisPassword } from "@/lib/country-auth";
import { verifyFreshCountryPasswordReview } from "@/lib/v3-organizer-country-password-fresh-review";
import type { AdminCountryAccount } from "@/lib/country-account";

type PendingPasswordReview = {
  actorId: string;
  userId: string;
  countryId: string;
  status: "active" | "suspended";
  suspensionReason: string | null;
  updatedAt: string;
  countryName: string;
  email: string | null;
  password: string;
};

export function AdminCountryPasswordPanel({ account }: { account: AdminCountryAccount }) {
  const { id: actorId } = useAuthenticatedUser();
  const reviewGeneration = useRef(0);
  const mutationInFlight = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingPasswordReview | null>(null);

  useEffect(() => {
    // Immediately revoke the local review when either actor or account truth changes.
    reviewGeneration.current += 1;
    setPassword("");
    setConfirmPassword("");
    setMessage(null);
    setPendingReview(null);
  }, [actorId, account.user_id, account.country_id, account.country_name, account.email, account.status, account.suspension_reason, account.updated_at]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || mutationInFlight.current) return;
    setMessage(null);
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setPendingReview({
      actorId,
      userId: account.user_id,
      countryId: account.country_id,
      status: account.status,
      suspensionReason: account.suspension_reason,
      updatedAt: account.updated_at,
      countryName: account.country_name,
      email: account.email,
      password,
    });
  };

  const confirmPasswordChange = async () => {
    if (!pendingReview || busy || mutationInFlight.current) return;
    const review = pendingReview;
    const generation = reviewGeneration.current;

    if (
      actorId !== review.actorId ||
      account.user_id !== review.userId ||
      account.country_id !== review.countryId ||
      account.country_name !== review.countryName ||
      account.email !== review.email ||
      account.status !== review.status ||
      account.suspension_reason !== review.suspensionReason ||
      account.updated_at !== review.updatedAt
    ) {
      setPendingReview(null);
      setPassword("");
      setConfirmPassword("");
      setMessage("The selected country account changed while the password review was open. Review the current account before retrying.");
      return;
    }

    // A ref prevents double submission before React has committed the busy state.
    mutationInFlight.current = true;
    setBusy(true);
    try {
      await verifyFreshCountryPasswordReview(review, {
        getActorId: async () => {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          return data.user?.id ?? null;
        },
        readAccounts: async () => {
          // Do not fall back to direct country_accounts reads if the Organizer
          // directory RPC is absent, denied, empty, or otherwise unavailable.
          const { data, error } = await (supabase as any).rpc("admin_country_accounts");
          if (error) throw error;
          if (!Array.isArray(data)) throw new Error("Could not verify the current country-account directory.");
          return data as AdminCountryAccount[];
        },
      });

      if (reviewGeneration.current !== generation) {
        throw new Error("Organizer identity or country account changed during verification. Reopen and review this account.");
      }

      const savePromise = adminSetSolarisPassword(review.userId, review.password);
      toast.promise(savePromise, {
        id: `admin-country-password-${review.userId}`,
        loading: `Changing password for ${review.countryName}…`,
        success: `Password changed for ${review.countryName}.`,
        error: (error) => error instanceof Error ? error.message : "Password could not be changed.",
      });

      await savePromise;
      if (reviewGeneration.current === generation) {
        setPassword("");
        setConfirmPassword("");
        setPendingReview(null);
        setMessage(null);
      }
    } catch (error) {
      if (reviewGeneration.current === generation) {
        setPendingReview(null);
        setPassword("");
        setConfirmPassword("");
        setMessage(error instanceof Error ? error.message : "Password could not be changed.");
      }
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-sky-100" />
              <p className="text-sm font-semibold text-foreground">Change account password</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Set a new password for this country account. The owner can use it immediately on the Solaris Studio sign-in page.
            </p>
          </div>
          <AdminStatus tone="neutral">Admin only</AdminStatus>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="admin-section-label">New password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <label className="block">
            <span className="admin-section-label">Confirm new password</span>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Weak or known breached passwords are blocked by the server. Country accounts cannot use this admin override themselves.
          </p>

          <button type="submit" disabled={busy} className="admin-action-primary w-full">
            <KeyRound className="size-4" /> {busy ? "Changing password…" : "Review password change"}
          </button>

          {message ? (
            <div
              aria-live="polite"
              className="rounded-xl border border-rose-200/15 bg-rose-200/[0.045] p-3 text-sm text-rose-50"
            >
              {message}
            </div>
          ) : null}
        </form>
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingReview)}
        onClose={() => {
          if (!busy) setPendingReview(null);
        }}
        onConfirm={confirmPasswordChange}
        title={pendingReview ? `Replace ${pendingReview.countryName} account password?` : "Replace account password?"}
        description={pendingReview ? (
          <div className="space-y-3">
            <p>Review the exact delegation account before replacing its sign-in credential. Organizer identity and the current account revision will be checked again immediately before the request.</p>
            <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3 text-xs leading-5 text-muted-foreground">
              <strong className="text-foreground">Country:</strong> {pendingReview.countryName}<br />
              <strong className="text-foreground">Account:</strong> {pendingReview.email ?? "No account email"}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              The new password is deliberately not shown in this review. Confirming replaces the account password immediately through the existing Organizer-only identity function. This review does not claim to revoke existing sessions or provide a versioned/idempotent credential-change receipt.
            </p>
          </div>
        ) : null}
        confirmLabel="Replace password"
        confirmationText={pendingReview?.countryName}
        confirmationHint={pendingReview ? `Type ${pendingReview.countryName} to confirm the password replacement` : undefined}
        busy={busy}
        danger
      />
    </>
  );
}