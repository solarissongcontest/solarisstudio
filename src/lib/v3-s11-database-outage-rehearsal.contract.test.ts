import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { systemErrorCodeFromUnknown } from "@/lib/system-error";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-database-outage-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 real database-dependency outage rehearsal", () => {
  it("is fail-closed to the exact disposable local Supabase database", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("candidate\" == supabase_db_*");
    expect(rehearsal).toContain("Expected exactly one local Supabase database container");
    expect(rehearsal).toContain("Refusing to stop non-Supabase database container");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("uses fresh run-scoped fixture and operation identities on every rehearsal", () => {
    expect(rehearsal).toContain("RUN_ID=\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"");
    expect(rehearsal).toContain("DELIVERY_ID=\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"");
    expect(rehearsal).toContain("OPERATION_ID=\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"");
    expect(rehearsal).toContain('IDEMPOTENCY_KEY="v3-s11-database-outage-retry:$RUN_ID"');
    expect(rehearsal).toContain('RECIPIENT_EMAIL="v3-s11-db-outage-recipient-$RUN_ID@solaris.invalid"');
    expect(rehearsal).toContain('OPERATOR_EMAIL="v3-s11-db-outage-operator-$RUN_ID@solaris.invalid"');
  });

  it("makes a real dependency unavailable instead of injecting an error label", () => {
    const stop = rehearsal.indexOf('docker stop --time 1 "$DB_CONTAINER"');
    const outageAttempt = rehearsal.indexOf(
      'request_allow_transport_failure POST "$API_URL/rest/v1/rpc/$RETRY_RPC"',
    );
    const restore = rehearsal.indexOf('docker start "$DB_CONTAINER"', stop);

    expect(stop).toBeGreaterThan(-1);
    expect(outageAttempt).toBeGreaterThan(stop);
    expect(restore).toBeGreaterThan(outageAttempt);
    expect(rehearsal).toContain("Local PostgreSQL container did not stop");
    expect(rehearsal).not.toContain("INJECTED_DEPENDENCY_FAILURE");
  });

  it("maps the real outage signals to the canonical dependency-failure taxonomy", () => {
    expect(systemErrorCodeFromUnknown({ status: 503 })).toBe("DEPENDENCY_FAILURE");
    expect(systemErrorCodeFromUnknown(new Error("Failed to fetch"))).toBe(
      "DEPENDENCY_FAILURE",
    );
  });

  it("cannot report or persist fake success while PostgreSQL is unavailable", () => {
    expect(rehearsal).toContain("Governed retry fabricated success while PostgreSQL was unavailable");
    expect(rehearsal).toContain("unavailable dependency produced no successful command response");
    expect(rehearsal).toContain("Delivery changed while PostgreSQL was unavailable");
    expect(rehearsal).toContain("Operation receipt was created during the database outage");
  });

  it("restores the dependency even if the rehearsal aborts", () => {
    expect(rehearsal).toContain("restore_database_if_needed");
    expect(rehearsal).toContain("trap restore_database_if_needed EXIT INT TERM");
    expect(rehearsal).toContain("Local PostgreSQL did not recover after restart");
    expect(rehearsal).toContain("Local Data API did not recover after database restart");
  });

  it("recovers through the governed R1 operation and converges exactly once", () => {
    expect(rehearsal).toContain("RETRY_RPC='admin_retry_failed_notification_delivery'");
    expect(rehearsal).toContain("Retry the exact operation identity after dependency recovery");
    expect(rehearsal).toContain("system.push.retry_failed");
    expect(rehearsal).toContain("exactly one succeeded canonical receipt");
    expect(rehearsal).toContain("Replay the same operation identity and prove exactly-once convergence");
    expect(rehearsal).toContain("Replay created a duplicate operation receipt");
    expect(rehearsal).toContain("Replay created a duplicate semantic operation");
  });
});
