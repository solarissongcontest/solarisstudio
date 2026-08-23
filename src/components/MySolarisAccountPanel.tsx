import { useQuery } from "@tanstack/react-query";
import { AtSign, Mail, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Panel } from "@/components/AppShell";
import {
  getSolarisAccountProfile,
  setSolarisRecoveryEmail,
} from "@/lib/country-auth";

export function MySolarisAccountPanel() {
  const profile = useQuery({
    queryKey: ["mysolaris-account-profile"],
    queryFn: getSolarisAccountProfile,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setEmail(profile.data?.email ?? "");
  }, [profile.data?.email]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const next = email.trim().toLowerCase();
    if (!next) {
      setMessage("Enter an email address first.");
      return;
    }

    const hadRecoveryEmail = Boolean(profile.data?.hasRecoveryEmail);
    setBusy(true);
    try {
      await setSolarisRecoveryEmail(next);
      await profile.refetch();
      setMessage(
        hadRecoveryEmail
          ? "Email changed successfully. You can use it for sign-in and password recovery."
          : "Email added successfully. Password recovery is now available for this account.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Email could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Account details"
      description="Your MySolaris identity and recovery email"
      actions={
        profile.data?.status ? (
          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold capitalize text-muted-foreground">
            {profile.data.status}
          </span>
        ) : undefined
      }
    >
      {profile.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your account…</p>
      ) : profile.isError ? (
        <p className="text-sm text-destructive">Your account details could not be loaded.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-surface/55 p-4">
              <div className="flex items-center gap-2 text-primary">
                <AtSign className="size-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.14em]">Solaris username</p>
              </div>
              <p className="mt-2 text-sm font-semibold">
                {profile.data?.instagramUsername ? `@${profile.data.instagramUsername}` : "Not available"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Your Instagram username is also your Solaris Studio username.
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-surface/55 p-4">
              <div className="flex items-center gap-2 text-primary">
                <UserRound className="size-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.14em]">Name or nickname</p>
              </div>
              <p className="mt-2 text-sm font-semibold">{profile.data?.displayName || "Not available"}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                This is your personal account name, separate from the country name.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="rounded-2xl border border-border/70 bg-background/35 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {profile.data?.hasRecoveryEmail ? "Recovery email" : "Add a recovery email"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {profile.data?.hasRecoveryEmail
                    ? "Change it here whenever you need to. Your Instagram username will still work for sign-in."
                    : "This is optional, but adding one lets you recover your password if you forget it."}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/50 focus:ring-2"
              />
              <button
                type="submit"
                disabled={busy || !email.trim() || email.trim().toLowerCase() === (profile.data?.email ?? "").toLowerCase()}
                className="min-h-11 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Saving…" : profile.data?.hasRecoveryEmail ? "Change email" : "Add email"}
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Your recovery email is account information. Solaris does not show it on your public country or Wiki pages.
            </p>
            {message ? (
              <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
                {message}
              </p>
            ) : null}
          </form>
        </div>
      )}
    </Panel>
  );
}
