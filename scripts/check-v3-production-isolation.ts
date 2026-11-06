import { URL } from "node:url";

const SUPABASE_URL_KEYS = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "E2E_SUPABASE_URL",
  "VITE_CONFIRMATIONS_SUPABASE_URL",
  "CONFIRMATIONS_SUPABASE_URL",
  "API_URL",
] as const;

const DATABASE_URL_KEYS = ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL", "DB_URL"] as const;
const PROJECT_ID_KEYS = [
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
  "E2E_SUPABASE_PROJECT_ID",
  "E2E_SUPABASE_PROJECT_REF",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_REF",
] as const;
const SERVICE_ROLE_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_SUPABASE_SERVICE_ROLE_KEY",
  "CONFIRMATIONS_SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
] as const;
const TARGET_KEYS = ["V3_VERIFICATION_TARGET", "V3_SEED_TARGET", "V3_CLEANUP_TARGET", "E2E_TARGET"] as const;
const DESTRUCTIVE_MODE_KEYS = ["V3_DESTRUCTIVE_VERIFICATION", "V3_REHEARSAL_DESTRUCTIVE", "E2E_DESTRUCTIVE"] as const;
const KNOWN_HOSTED_PROJECT_REFS = new Set(["dkxmnvekiopyesuzggeu"]);
const LOCAL_TARGET_MARKERS = new Set([
  "local",
  "localhost",
  "local-test",
  "test-local",
  "supabase-local",
  "127.0.0.1",
  "::1",
]);

function loopbackHost(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function normalizedMarker(value: string) {
  return value.trim().toLowerCase();
}

function truthy(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(normalizedMarker(value));
}

function assertLocalUrl(key: string, rawValue: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${key} is set but is not a valid URL; refusing automated V3 verification`);
  }

  // Checking a hostname alone would classify e.g. ftp://localhost as a
  // safe Supabase/database target. Require the protocol appropriate to the
  // connection class before certifying any configured target as loopback.
  const databaseUrl = DATABASE_URL_KEYS.some((name) => name === key);
  const expectedProtocols = databaseUrl ? ["postgres:", "postgresql:"] : ["http:", "https:"];
  if (!expectedProtocols.includes(parsed.protocol.toLowerCase())) {
    throw new Error(
      `${key} uses an unsupported URL protocol; refusing ambiguous Supabase/database routing in automated V3 verification`,
    );
  }

  // A libpq URI's query parameters can redirect a loopback-looking DB URL.
  // Deny all explicit connection-authority overrides before any test traffic.
  const overrideKeys = new Set(["host", "hostaddr", "service"]);
  for (const [parameter] of parsed.searchParams) {
    if (overrideKeys.has(parameter.toLowerCase())) {
      throw new Error(
        `${key} contains a ${parameter} authority override; refusing ambiguous Supabase connection routing in automated V3 verification`,
      );
    }
  }

  if (!loopbackHost(parsed.hostname)) {
    throw new Error(
      `${key} points at non-local host ${parsed.hostname}; automated Solaris V3 verification must fail closed instead of using hosted Supabase`,
    );
  }

  if (parsed.hostname.endsWith(".supabase.co")) {
    throw new Error(`${key} points at hosted Supabase; production/test-project traffic is forbidden in automated V3 verification`);
  }
}

function assertLocalProjectIdentity(key: string, rawValue: string) {
  const value = normalizedMarker(rawValue);
  if (KNOWN_HOSTED_PROJECT_REFS.has(value)) {
    throw new Error(`${key} identifies the Solaris Studio hosted production project; automated V3 verification must never target it`);
  }
  if (!LOCAL_TARGET_MARKERS.has(value)) {
    throw new Error(`${key}=${rawValue} is not an explicit local project identity; automated V3 verification must fail closed`);
  }
}

function assertLocalTarget(key: string, rawValue: string) {
  if (!LOCAL_TARGET_MARKERS.has(normalizedMarker(rawValue))) {
    throw new Error(`${key}=${rawValue} is not an explicit local seed/cleanup/test target; refusing automated V3 verification`);
  }
}

export function assertV3ProductionIsolation(environment: NodeJS.ProcessEnv = process.env) {
  const errors: string[] = [];
  const inspected: string[] = [];

  const dynamicSupabaseUrlKeys = Object.keys(environment).filter(
    (key) => /(?:^|_)SUPABASE(?:_[A-Z0-9]+)*_URL$/i.test(key) || /SUPABASE_URL$/i.test(key),
  );
  const urlKeys = [...new Set([...SUPABASE_URL_KEYS, ...DATABASE_URL_KEYS, ...dynamicSupabaseUrlKeys])];
  let configuredLocalUrls = 0;

  for (const key of urlKeys) {
    const value = environment[key]?.trim();
    if (!value) continue;
    inspected.push(key);
    try {
      assertLocalUrl(key, value);
      configuredLocalUrls += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Libpq environment variables can route a separate psql invocation even when
  // the Supabase CLI URLs above are local. Treat these as connection authorities,
  // not harmless configuration, and fail closed on service-file indirection.
  for (const key of ["PGHOST", "PGHOSTADDR"] as const) {
    const value = environment[key]?.trim();
    if (!value) continue;
    inspected.push(key);
    // Comma-separated libpq hosts allow fallback to a remote target.
    // Unix sockets and hostname aliases are deliberately not accepted here:
    // the automated rehearsal contract requires an explicit loopback target.
    if (value.includes(",") || !loopbackHost(value)) {
      errors.push(`${key} is not an explicit loopback PostgreSQL host; refusing indirect database routing in automated V3 verification`);
    }
  }

  for (const key of ["PGSERVICE", "PGSERVICEFILE"] as const) {
    if (!environment[key]?.trim()) continue;
    inspected.push(key);
    errors.push(`${key} configures indirect PostgreSQL service routing; refusing automated V3 verification`);
  }

  const pgDatabase = environment.PGDATABASE?.trim();
  if (pgDatabase) {
    inspected.push("PGDATABASE");
    // PostgreSQL accepts connection-string forms in database contexts. Only
    // ordinary database names are appropriate as ambient CI configuration.
    if (pgDatabase.includes("://") || pgDatabase.includes("=")) {
      errors.push("PGDATABASE is a connection string rather than a database name; refusing indirect database routing");
    }
  }

  const dynamicProjectKeys = Object.keys(environment).filter((key) => /SUPABASE.*(?:PROJECT_ID|PROJECT_REF)$/i.test(key));
  const projectKeys = [...new Set([...PROJECT_ID_KEYS, ...dynamicProjectKeys])];
  for (const key of projectKeys) {
    const value = environment[key]?.trim();
    if (!value) continue;
    inspected.push(key);
    try {
      assertLocalProjectIdentity(key, value);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const dynamicServiceRoleKeys = Object.keys(environment).filter((key) => /SUPABASE.*SERVICE_ROLE.*KEY$/i.test(key));
  const serviceRoleKeys = [...new Set([...SERVICE_ROLE_KEYS, ...dynamicServiceRoleKeys])];
  const configuredServiceRoleKeys = serviceRoleKeys.filter((key) => Boolean(environment[key]?.trim()));
  if (configuredServiceRoleKeys.length) {
    inspected.push(...configuredServiceRoleKeys);
    if (configuredLocalUrls === 0) {
      errors.push("a Supabase service-role credential is configured without any verified loopback Supabase/database URL");
    }
    const scope = environment.V3_SERVICE_ROLE_SCOPE?.trim();
    if (!scope || !LOCAL_TARGET_MARKERS.has(normalizedMarker(scope))) {
      errors.push("a Supabase service-role credential is configured without V3_SERVICE_ROLE_SCOPE=local (or another explicit local marker)");
    } else {
      inspected.push("V3_SERVICE_ROLE_SCOPE");
    }
  }

  for (const key of TARGET_KEYS) {
    const value = environment[key]?.trim();
    if (!value) continue;
    inspected.push(key);
    try {
      assertLocalTarget(key, value);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const destructiveMode = DESTRUCTIVE_MODE_KEYS.some((key) => truthy(environment[key]));
  if (destructiveMode) {
    inspected.push(...DESTRUCTIVE_MODE_KEYS.filter((key) => truthy(environment[key])));
    if (configuredLocalUrls === 0) {
      errors.push("destructive V3 verification is enabled without any verified loopback Supabase/database URL");
    }
    for (const key of ["V3_SEED_TARGET", "V3_CLEANUP_TARGET"] as const) {
      const value = environment[key]?.trim();
      if (!value) {
        errors.push(`${key} must be set to an explicit local marker when destructive V3 verification is enabled`);
      } else {
        try {
          assertLocalTarget(key, value);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  if (errors.length) {
    throw new Error(`V3 production-isolation guard failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    inspected: [...new Set(inspected)],
    loopbackOnly: true,
    destructiveMode,
  };
}

if (import.meta.main) {
  try {
    const result = assertV3ProductionIsolation();
    const inspected = result.inspected.length ? result.inspected.join(", ") : "no configured database/Supabase target variables";
    process.stdout.write(
      `V3 production isolation: PASS (loopback-only; destructive=${result.destructiveMode ? "yes" : "no"}; inspected ${inspected})\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
