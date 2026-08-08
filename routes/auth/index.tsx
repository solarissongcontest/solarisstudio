import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [
      { title: "Organizer sign in — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Sign in to the Solaris Scoreboard Studio organizer area to manage editions, participants and voting results.",
      },
      { property: "og:title", content: "Organizer sign in — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Access the SSC organizer studio." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg("Account created. Check your inbox if confirmation is required, then sign in.");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setMsg(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setMsg("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/admin" });
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer access"
        title={mode === "signin" ? "Sign in to the Studio" : "Create an organizer account"}
        description="Voting entry, edition management and broadcast control are restricted to signed-in organizers."
      />
      <div className="mx-auto max-w-md">
        <Panel title="Credentials">
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@terrasolaris.tv"
              className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl bg-surface px-3 py-2.5 text-sm outline-none ring-primary/50 focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="bg-aurora w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-strong"
          >
            Continue with Google
          </button>

          {msg && <p className="mt-4 text-sm text-destructive">{msg}</p>}

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "No account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
        </Panel>
      </div>
    </AppShell>
  );
}
