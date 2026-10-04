import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261004222500_push_delivery_receipts.sql",
);
const dispatcher = source("supabase/functions/solaris-push-dispatch/index.ts");
const receipt = source("supabase/functions/notification-receipt/index.ts");
const worker = source("public/sw.js");
const diagnostics = source(
  "src/routes/_authenticated/admin/system-operations.tsx",
);
const config = source("supabase/config.toml");

describe("push delivery receipts", () => {
  it("separates provider acceptance from device-visible stages", () => {
    for (const field of [
      "provider_accepted_at",
      "received_at",
      "displayed_at",
      "opened_at",
    ]) {
      expect(migration).toContain(field);
    }
    expect(diagnostics).toContain("Provider accepted · 24h");
    expect(diagnostics).toContain("Displayed · 24h");
  });

  it("sends only a one-time receipt secret to the service worker", () => {
    expect(dispatcher).toContain("randomReceiptToken");
    expect(dispatcher).toContain("receipt_token_hash");
    expect(dispatcher).toContain("notification-receipt");
    expect(dispatcher).toContain("provider_accepted_at");
  });

  it("records receive, display and click independently", () => {
    expect(worker).toContain('reportPushReceipt(options.data, "received")');
    expect(worker).toContain('reportPushReceipt(options.data, "displayed")');
    expect(worker).toContain('reportPushReceipt(event.notification.data, "opened")');
    expect(receipt).toContain('["received", "displayed", "opened"]');
    expect(receipt).toContain("safeEqual");
    expect(config).toContain("[functions.notification-receipt]");
    expect(config).toContain("verify_jwt = false");
  });
});
