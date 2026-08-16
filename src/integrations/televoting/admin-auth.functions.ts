import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP, useSession } from "@tanstack/react-start/server";

import { televotingAdmin } from "@/integrations/televoting/client.server";

type SessionData = { token?: string };
type AdminRow = {
  id: string;
  username: string;
  is_super_admin: boolean;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sha256(input: string) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function sessionConfig() {
  const password = process.env.TELEVOTING_ADMIN_SESSION_SECRET;
  if (!password) throw new Error("Televoting admin session secret is not configured.");
  return {
    password,
    name: "solaris-televoting-admin",
    maxAge: SESSION_TTL_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
    },
  };
}

async function loadAdminFromCookie() {
  const session = await useSession<SessionData>(sessionConfig());
  const token = session.data.token;
  if (!token) return { session, admin: null as AdminRow | null };

  const tokenHash = sha256(token);
  const { data: storedSession, error: sessionError } = await televotingAdmin
    .from("admin_sessions")
    .select("id,admin_id,expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError || !storedSession) return { session, admin: null as AdminRow | null };

  const { data: admin, error: adminError } = await televotingAdmin
    .from("admin_accounts")
    .select("id,username,is_super_admin,disabled,last_login_at,created_at")
    .eq("id", storedSession.admin_id)
    .maybeSingle();

  if (adminError || !admin || admin.disabled) return { session, admin: null as AdminRow | null };
  return { session, admin: admin as AdminRow };
}

export async function requireMergedTelevotingAdmin() {
  const { admin } = await loadAdminFromCookie();
  if (!admin) throw new Error("Not authenticated");
  return admin;
}

export const getMergedTelevotingAdmin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { admin } = await loadAdminFromCookie();
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
    const { data: rows, error } = await televotingAdmin.rpc("admin_verify_credentials", {
      _username: data.username,
      _password: data.password,
    });
    if (error) throw new Error("Login failed");

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Invalid username or password");

    const token = randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

    const userAgent = getRequestHeader("user-agent") ?? null;
    let ipHash: string | null = null;
    try {
      const ip = getRequestIP({ xForwardedFor: true });
      if (ip) ipHash = sha256(ip);
    } catch {
      // Optional audit metadata only.
    }

    const { error: insertError } = await televotingAdmin.from("admin_sessions").insert({
      admin_id: row.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      user_agent: userAgent,
      ip_hash: ipHash,
    });
    if (insertError) throw new Error(insertError.message);

    await televotingAdmin
      .from("admin_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", row.id);

    const session = await useSession<SessionData>(sessionConfig());
    await session.update({ token });

    await televotingAdmin.from("admin_audit_log").insert({
      actor_admin_id: row.id,
      actor_username: row.username,
      action: "login",
      target_type: "admin_account",
      target_id: row.id,
    });

    return {
      id: row.id as string,
      username: row.username as string,
      is_super_admin: Boolean(row.is_super_admin),
    };
  });

export const logoutMergedTelevotingAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<SessionData>(sessionConfig());
  const token = session.data.token;
  if (token) {
    await televotingAdmin.from("admin_sessions").delete().eq("token_hash", sha256(token));
  }
  await session.clear();
  return { ok: true };
});
