import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

export const Route = createFileRoute("/confirmations/admin/sign-in")({
  head: () => ({
    meta: [
      { title: "Confirmations Admin — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationsAdminSignIn,
});

function ConfirmationsAdminSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void confirmationsSupabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void navigate({ to: "/confirmations/admin" });
      }
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const { data, error: signInError } = await confirmationsSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setError("Sign-in succeeded, but no user session was returned.");
        return;
      }

      const { data: isAdmin, error: roleError } = await confirmationsSupabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      if (roleError || isAdmin !== true) {
        await confirmationsSupabase.auth.signOut();
        setError("This account does not have Confirmations admin access.");
        return;
      }

      await navigate({ to: "/confirmations/admin" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
        <section className="confirmations-surface w-full p-6 sm:p-8">
          <Link
            to="/confirmations"
            className="mb-6 inline-flex items-center gap-2 text-xs text-white/55 transition hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Back to confirmations
          </Link>

          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">
            Organiser access
          </p>
          <h1 className="confirmations-display mt-3 text-4xl font-normal uppercase leading-none sm:text-5xl">
            Control centre
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            Sign in with the same organiser account used on the existing Confirmations site.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirmations-admin-email">Email</Label>
              <Input
                id="confirmations-admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmations-admin-password">Password</Label>
              <Input
                id="confirmations-admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2.5 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn className="size-4" /> {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
