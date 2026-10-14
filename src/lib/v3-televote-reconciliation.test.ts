import { describe, expect, it, vi } from "vitest";
import {
  initialTelevoteStage,
  parseTelevoteRecoveryCode,
  recoverTelevoteTransportResponse,
  serializeTelevoteRecoveryCode,
  submitTelevoteWithReconciliation,
  verifiedTelevoteReceipt,
  verifiedTelevoteRecoveryReceipt,
  type TelevoteReceipt,
} from "./v3-televote-reconciliation";

const receipt: TelevoteReceipt = {
  found: true,
  authority: "authoritative_server",
  id: "submission",
  round_id: "round",
  preflight_id: "token",
  status: "active",
  accepted_at: "2026-10-14T00:00:00Z",
};

describe("exact-ballot Televote reconciliation", () => {
  it("returns an existing receipt without writing again", async () => {
    const write = vi.fn();
    expect(await submitTelevoteWithReconciliation(write, async () => receipt)).toEqual(receipt);
    expect(write).not.toHaveBeenCalled();
  });
  it("recovers a committed write whose response was lost", async () => {
    let committed = false;
    const write = vi.fn(async () => {
      committed = true;
      throw new Error("response lost");
    });
    expect(
      await submitTelevoteWithReconciliation(write, async () => (committed ? receipt : null)),
    ).toEqual(receipt);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("preserves duplicate rejection when this token has no receipt", async () => {
    const error = new Error("A vote from this network was already recorded");
    await expect(
      submitTelevoteWithReconciliation(
        async () => {
          throw error;
        },
        async () => null,
      ),
    ).rejects.toBe(error);
  });
  it("preserves successful legacy acknowledgment when receipt RPC is unavailable", async () => {
    const accepted = { id: "submission", preflight_id: "token", status: "active" as const };
    expect(
      await submitTelevoteWithReconciliation(
        async () => accepted,
        async () => {
          throw new Error("missing RPC");
        },
      ),
    ).toBe(accepted);
  });
  it("keeps the original error if reconciliation is unavailable", async () => {
    const error = new Error("uncertain transport");
    await expect(
      submitTelevoteWithReconciliation(
        async () => {
          throw error;
        },
        async () => {
          throw new Error("read failed");
        },
      ),
    ).rejects.toBe(error);
  });
  it("recovers a lost server-function HTTP response without resubmitting", async () => {
    const write = vi.fn(async () => {
      throw new Error("HTTP response lost");
    });
    expect(await recoverTelevoteTransportResponse(write, async () => receipt)).toBe(receipt);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("does not add browser receipt reads to a successful server-function response", async () => {
    const read = vi.fn();
    expect(await recoverTelevoteTransportResponse(async () => receipt, read)).toBe(receipt);
    expect(read).not.toHaveBeenCalled();
  });
  for (const patch of [
    { authority: "local" },
    { round_id: "other" },
    { preflight_id: "other" },
    { id: "" },
    { accepted_at: null },
    { accepted_at: "invalid" },
    { status: "deleted" },
    { found: false },
  ]) {
    it(`rejects unbound receipt evidence ${JSON.stringify(patch)}`, () => {
      expect(verifiedTelevoteReceipt({ ...receipt, ...patch }, "round", "token")).toBeNull();
    });
  }
  it("accepts authoritative active, suspicious and moderator-verified receipts", () => {
    for (const status of ["active", "suspicious", "verified"]) {
      expect(verifiedTelevoteReceipt({ ...receipt, status }, "round", "token")).not.toBeNull();
    }
  });
});

describe("read-only Televote recovery capabilities", () => {
  const roundId = "11111111-1111-4111-8111-111111111111";
  const handle = {
    operationId: "22222222-2222-4222-8222-222222222222",
    recoverySecret: "ab".repeat(32),
  };
  const recoveryReceipt = {
    ...receipt,
    round_id: roundId,
    preflight_id: "33333333-3333-4333-8333-333333333333",
  };

  it("round-trips a portable recovery code without exposing submission authority", () => {
    const code = serializeTelevoteRecoveryCode(handle);
    expect(code).toBe(`${handle.operationId}.${handle.recoverySecret}`);
    expect(parseTelevoteRecoveryCode(code!)).toEqual(handle);
  });

  for (const invalid of [
    "",
    handle.operationId,
    `${handle.operationId}.short`,
    `not-a-uuid.${handle.recoverySecret}`,
    `${handle.operationId}.${handle.recoverySecret}.extra`,
  ]) {
    it(`rejects malformed recovery code ${JSON.stringify(invalid)}`, () => {
      expect(parseTelevoteRecoveryCode(invalid)).toBeNull();
    });
  }

  it("accepts an authoritative receipt without requiring the submission token", () => {
    expect(verifiedTelevoteRecoveryReceipt(recoveryReceipt, roundId)).toEqual(recoveryReceipt);
  });

  for (const patch of [
    { authority: "local" },
    { round_id: "other" },
    { preflight_id: "" },
    { id: "" },
    { accepted_at: null },
    { status: "deleted" },
    { found: false },
  ]) {
    it(`rejects forged recovery receipt ${JSON.stringify(patch)}`, () => {
      expect(verifiedTelevoteRecoveryReceipt({ ...recoveryReceipt, ...patch }, roundId)).toBeNull();
    });
  }
});

describe("browser history is not Televote authority", () => {
  it("does not restore a confirmed state from a local marker", () => {
    expect(initialTelevoteStage(true, "done")).toBe("remembered");
    expect(initialTelevoteStage(false, "done")).toBe("register");
    expect(initialTelevoteStage(false, "vote")).toBe("vote");
  });
});
