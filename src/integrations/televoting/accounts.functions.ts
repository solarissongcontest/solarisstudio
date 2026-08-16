import { createServerFn } from "@tanstack/react-start";

export const listMergedAdminAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const { listMergedAdminAccountsServer } = await import("@/integrations/televoting/accounts.server");
  return listMergedAdminAccountsServer();
});

export const createMergedAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => {
    const username = String(data?.username ?? "").trim();
    const password = String(data?.password ?? "");
    if (username.length < 2) throw new Error("Username must be at least 2 characters");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    return { username, password };
  })
  .handler(async ({ data }) => {
    const { createMergedAdminAccountServer } = await import("@/integrations/televoting/accounts.server");
    return createMergedAdminAccountServer(data);
  });

export const renameMergedAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; username: string }) => {
    const username = String(data?.username ?? "").trim();
    if (!data?.id) throw new Error("Missing account id");
    if (username.length < 2) throw new Error("Username must be at least 2 characters");
    return { id: data.id, username };
  })
  .handler(async ({ data }) => {
    const { renameMergedAdminAccountServer } = await import("@/integrations/televoting/accounts.server");
    return renameMergedAdminAccountServer(data);
  });

export const resetMergedAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; password: string }) => {
    if (!data?.id) throw new Error("Missing account id");
    if (!data.password || data.password.length < 8) throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data }) => {
    const { resetMergedAdminPasswordServer } = await import("@/integrations/televoting/accounts.server");
    return resetMergedAdminPasswordServer(data);
  });

export const setMergedAdminDisabled = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; disabled: boolean }) => {
    if (!data?.id) throw new Error("Missing account id");
    return { id: data.id, disabled: Boolean(data.disabled) };
  })
  .handler(async ({ data }) => {
    const { setMergedAdminDisabledServer } = await import("@/integrations/televoting/accounts.server");
    return setMergedAdminDisabledServer(data);
  });

export const deleteMergedAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; reason?: string }) => {
    if (!data?.id) throw new Error("Missing account id");
    return { id: data.id, reason: String(data.reason ?? "").trim() || undefined };
  })
  .handler(async ({ data }) => {
    const { deleteMergedAdminAccountServer } = await import("@/integrations/televoting/accounts.server");
    return deleteMergedAdminAccountServer(data);
  });
