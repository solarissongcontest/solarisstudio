import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMergedTelevotingAdmin,
  loginMergedTelevotingAdmin,
} from "@/integrations/televoting/admin-auth.functions";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";

export const Route = createFileRoute("/televoting/admin/sign-in")({
  head: () => ({ meta: [{ title: "Televoting Admin — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingAdminSignIn,
});

function TelevotingAdminSignIn() {
  const navigate = useNavigate();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const login = useServerFn(loginMergedTelevotingAdmin);
  const getStatus = useServerFn(getMergedTelevotingServerStatus);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: serverStatus } = useQuery({
    queryKey: ["merged-televoting-server-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!serverStatus?.adminReady) return;
    void getAdmin().then((admin) => {
      if (admin) void navigate({ to: "/televoting/admin" });
    });
  }, [getAdmin, navigate, serverStatus?.adminReady]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await login({ data: { username, password } });
      toast.success("Signed in");
      await navigate({ to: "/televoting/admin" });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message.replace(/^Error:\s*/, "") : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center py-10">
      <section className="glass-strong w-full p-6 sm:p-8">
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl border border-sky-200/15 bg-sky-200/10 text-sky-100"><ShieldCheck className="size-6" /></div>
          <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-sky-100/65">Televoting organiser</p>
          <h1 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">Admin sign in</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Uses the same custom administrator accounts as the existing Televoting system.</p>
        </div>

        {serverStatus && !serverStatus.adminReady ? (
          <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100/85">
            The merged admin server is prepared but not enabled on this Cloudflare deployment yet. Its existing Televoting server credentials still need to be added as encrypted Worker secrets.
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2"><Label htmlFor="televoting-admin-user">Username</Label><Input id="televoting-admin-user" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="televoting-admin-password">Password</Label><Input id="televoting-admin-password" type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={busy || serverStatus?.adminReady === false}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Sign in</Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground"><Link to="/televoting" className="hover:text-foreground">← Back to Televoting</Link></p>
      </section>
    </div>
  );
}
