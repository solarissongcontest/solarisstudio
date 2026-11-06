import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { createEditionThroughAuthority } from "./edition-create-command";
const intent = {
  editionNumber: 77,
  name: "Edition",
  year: 2027,
  hostCountryId: null,
  hostCity: null,
  reason: "Create private draft",
};
const receipt = {
  ok: true,
  operationId: "27270000-0000-4000-8000-000000000001",
  replayed: false,
  edition: {
    id: "27270000-0000-4000-8000-000000000002",
    edition_number: 77,
    data_revision: 1,
    published: false,
    status: "draft",
  },
};
beforeEach(() => rpc.mockReset());
describe("governed Edition creation", () => {
  it("submits the reviewed semantic intent and accepts a private draft receipt", async () => {
    rpc.mockResolvedValue({ data: receipt, error: null });
    await expect(createEditionThroughAuthority(intent)).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith("v3_create_edition", {
      p_edition_number: 77,
      p_name: "Edition",
      p_year: 2027,
      p_host_country_id: null,
      p_host_city: null,
      p_reason: "Create private draft",
    });
  });
  it("retains the exact payload on ambiguous retry", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } })
      .mockResolvedValueOnce({ data: { ...receipt, replayed: true }, error: null });
    await expect(createEditionThroughAuthority(intent)).resolves.toMatchObject({ replayed: true });
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
  it.each(["42501", "23505", "22023"])("does not retry a definitive %s failure", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Denied" } });
    await expect(createEditionThroughAuthority(intent)).rejects.toMatchObject({ code });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { operationId: "not-a-receipt" },
    { edition: { ...receipt.edition, edition_number: 78 } },
    { edition: { ...receipt.edition, published: true } },
    { edition: { ...receipt.edition, status: "active" } },
    { edition: { ...receipt.edition, data_revision: 0 } },
  ])("rejects an unconfirmed/wrong creation result: %j", async (change) => {
    rpc.mockResolvedValue({ data: { ...receipt, ...change }, error: null });
    await expect(createEditionThroughAuthority(intent)).rejects.toThrow("no confirmed receipt");
  });
  it("cuts over only creation and retains the merged historical metadata owner", () => {
    const route = readFileSync("src/routes/_authenticated/admin/editions.tsx", "utf8");
    expect(route).toContain("await createEditionThroughAuthority(");
    expect(route).not.toContain('supabase.from("editions").insert(');
    expect(route).toContain("createInFlight.current = true");
    expect(route).toContain("JSON.stringify(latestForm.current)");
    expect(readFileSync("src/lib/edition-authority.ts", "utf8")).toContain(
      '"v3_apply_edition_metadata_change"',
    );
  });
  it("preserves the restrictive Confirmation contract instead of patching an obsolete INSERT", () => {
    const migration = readFileSync("supabase/migrations/20261105201914_v3_edition_creation_authority.sql", "utf8");
    const boundary = migration.split("create or replace function public.admin_confirmation_save_edition")[1].split("$save$;")[0];
    expect(boundary).toContain("Confirmations cannot create canonical editions");
    expect(boundary).toContain("Canonical edition metadata is managed by Organizer edition management");
    expect(boundary).not.toMatch(/insert\s+into|update\s+public\.editions/i);
    expect(migration).not.toContain("position(v_old in v_definition)");
  });

});
