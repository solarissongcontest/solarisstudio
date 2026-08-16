import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Crown, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  createMergedAdminAccount,
  deleteMergedAdminAccount,
  listMergedAdminAccounts,
  renameMergedAdminAccount,
  resetMergedAdminPassword,
  setMergedAdminDisabled,
} from "@/integrations/televoting/accounts.functions";
import type { MergedAdminAccount } from "@/integrations/televoting/accounts.server";

export const Route = createFileRoute("/televoting/admin/accounts")({
  head: () => ({ meta: [{ title: "Televoting Admin Accounts — Solaris Operations" }, { name: "robots", content: "noindex" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const list = useServerFn(listMergedAdminAccounts);
  const create = useServerFn(createMergedAdminAccount);
  const rename = useServerFn(renameMergedAdminAccount);
  const reset = useServerFn(resetMergedAdminPassword);
  const disable = useServerFn(setMergedAdminDisabled);
  const remove = useServerFn(deleteMergedAdminAccount);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: accounts = [], isLoading, error } = useQuery({
    queryKey: ["merged-televoting-admin-accounts"],
    queryFn: () => list() as Promise<MergedAdminAccount[]>,
    enabled: Boolean(admin?.is_super_admin),
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["merged-televoting-admin-accounts"] });
    await qc.invalidateQueries({ queryKey: ["merged-televoting-audit"] });
  };

  const createMutation = useMutation({
    mutationFn: () => create({ data: { username, password } }),
    onSuccess: async () => {
      setUsername("");
      setPassword("");
      toast.success("Admin account created");
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (adminLoading) return <div className="glass p-8 text-sm text-muted-foreground">Checking organizer access…</div>;
  if (!admin) return null;

  if (!admin.is_super_admin) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <section className="glass-strong p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-sky-100" />
            <div>
              <h1 className="font-display text-3xl uppercase">Admin accounts</h1>
              <p className="mt-2 text-sm text-muted-foreground">Only the Televoting Super Admin can manage administrator accounts.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-2">
      <header className="glass-strong p-5 sm:p-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/65">Televoting · Security</p>
        <h1 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">Admin accounts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Create and maintain Televoting organizer identities. Password resets revoke existing sessions automatically.
        </p>
      </header>

      <section className="glass p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-sky-100" />
          <h2 className="text-sm font-semibold">Create administrator</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" type="password" />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || username.trim().length < 2 || password.length < 8}
          >
            Create account
          </Button>
        </div>
      </section>

      <section className="glass p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Administrator directory</h2>
            <p className="mt-1 text-xs text-muted-foreground">{accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
          </div>
          <Crown className="h-4 w-4 text-amber-200/70" />
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading accounts…</p> : null}
        {error ? <p className="text-sm text-red-200">{(error as Error).message}</p> : null}

        <div className="space-y-2">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              currentAdminId={admin.id}
              onRename={async (next) => {
                try {
                  await rename({ data: { id: account.id, username: next } });
                  toast.success("Username updated");
                  await refresh();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              onReset={async (next) => {
                try {
                  await reset({ data: { id: account.id, password: next } });
                  toast.success("Password reset and sessions revoked");
                  await refresh();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              onDisable={async () => {
                try {
                  await disable({ data: { id: account.id, disabled: !account.disabled } });
                  toast.success(account.disabled ? "Account enabled" : "Account disabled");
                  await refresh();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              onDelete={async () => {
                if (!window.confirm(`Delete admin account “${account.username}”?`)) return;
                try {
                  await remove({ data: { id: account.id, reason: "Deleted from unified Solaris Operations" } });
                  toast.success("Admin account deleted");
                  await refresh();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AccountRow({
  account,
  currentAdminId,
  onRename,
  onReset,
  onDisable,
  onDelete,
}: {
  account: MergedAdminAccount;
  currentAdminId: string;
  onRename: (username: string) => Promise<void>;
  onReset: (password: string) => Promise<void>;
  onDisable: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.username);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const protectedAccount = account.is_super_admin || account.id === currentAdminId;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 max-w-52" />
                <Button size="sm" onClick={async () => { await onRename(name); setEditing(false); }}>Save</Button>
              </div>
            ) : (
              <p className="font-semibold">{account.username}</p>
            )}
            {account.is_super_admin ? <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] text-amber-100">SUPER ADMIN</span> : null}
            {account.disabled ? <span className="rounded-full bg-red-300/10 px-2 py-1 text-[10px] text-red-100">DISABLED</span> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Created {new Date(account.created_at).toLocaleDateString()} · Last login {account.last_login_at ? new Date(account.last_login_at).toLocaleString() : "never"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing((value) => !value)} disabled={account.is_super_admin}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Rename
          </Button>
          <Button variant="outline" size="sm" onClick={() => setResetting((value) => !value)}>
            <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Reset password
          </Button>
          <Button variant="outline" size="sm" onClick={onDisable} disabled={protectedAccount}>
            <Ban className="mr-1.5 h-3.5 w-3.5" /> {account.disabled ? "Enable" : "Disable"}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={protectedAccount}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      {resetting ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="New password (8+ characters)" />
          <Button
            onClick={async () => {
              await onReset(newPassword);
              setNewPassword("");
              setResetting(false);
            }}
            disabled={newPassword.length < 8}
          >
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}
