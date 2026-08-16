import { createServerFn } from "@tanstack/react-start";

export const getMergedTelevotingAdmin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { loadMergedTelevotingAdminServer } = await import(
      "@/integrations/televoting/admin-session.server"
    );
    const { admin } = await loadMergedTelevotingAdminServer();
    if (!admin) return null;
    return {
      id: admin.id,
      username: admin.username,
      is_super_admin: admin.is_super_admin,
      last_login_at: admin.last_login_at,
    };
  } catch {
    return null;
  }
});

export const loginMergedTelevotingAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => {
    const username = String(data?.username ?? "").trim();
    const password = String(data?.password ?? "");
    if (!username || !password) throw new Error("Missing credentials");
    return { username, password };
  })
  .handler(async ({ data }) => {
    const { loginMergedTelevotingAdminServer } = await import(
      "@/integrations/televoting/admin-session.server"
    );
    return loginMergedTelevotingAdminServer(data);
  });

export const logoutMergedTelevotingAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutMergedTelevotingAdminServer } = await import(
    "@/integrations/televoting/admin-session.server"
  );
  return logoutMergedTelevotingAdminServer();
});
