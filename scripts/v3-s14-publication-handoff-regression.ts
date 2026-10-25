import { execFileSync } from "node:child_process";
import { localSupabaseEnvironment } from "./lib/v3-release-preflight";

const local = localSupabaseEnvironment();
const email = `s14-handoff-${crypto.randomUUID()}@local.invalid`;
const password = crypto.randomUUID() + "aA1!";
let actor: string | undefined;
async function request(path: string, key: string, method: string, body?: unknown) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Local handoff Auth ${method} failed (${response.status})`);
  return response.status === 204 ? {} : response.json();
}
try {
  const user = await request("/auth/v1/admin/users", local.SERVICE_ROLE_KEY, "POST", { email, password, email_confirm: true });
  actor = user.id;
  const session = await request("/auth/v1/token?grant_type=password", local.ANON_KEY, "POST", { email, password });
  const claims = Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8");
  localSupabaseEnvironment();
  // The transaction rolls back all contest/role fixtures. Auth is real, and its
  // disposable user/session are deleted below even when a canonical guard fails.
  execFileSync("psql", [local.DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-v", `handoff_claims=${claims}`, "-f", ".github/tests/v3-s14-qualification.sql"], { stdio: "inherit" });
} finally {
  if (actor) {
    localSupabaseEnvironment();
    await request(`/auth/v1/admin/users/${actor}`, local.SERVICE_ROLE_KEY, "DELETE");
  }
}
