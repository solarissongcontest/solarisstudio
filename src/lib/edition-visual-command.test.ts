import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, expect, it, vi } from "vitest";
const rpc = vi.fn();
const compiled = ts.transpileModule(readFileSync("src/lib/edition-visual-command.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^import .*;$/gm, "").replace("export async function", "async function");
const applyEditionVisualChange = runInNewContext(`${compiled}; applyEditionVisualChange`, { supabase: { rpc }, Error });
const input = { editionId: "edition-a", expected: { theme_colors: {} }, patch: { theme_colors: { publicRadius: 20 } }, reason: "Reviewed design" };
beforeEach(() => rpc.mockReset());
it("uses only the scoped canonical command and returns confirmed server state", async () => {
  rpc.mockResolvedValue({ data: { ok: true, edition: { id: "edition-a" } }, error: null });
  expect(await applyEditionVisualChange(input)).toEqual({ id: "edition-a" });
  expect(rpc).toHaveBeenCalledWith("v3_apply_edition_visual_change", {
    p_edition_id: input.editionId, p_expected: input.expected, p_patch: input.patch, p_reason: input.reason,
  });
});
it("repeats the exact semantic request after transport ambiguity", async () => {
  rpc.mockResolvedValueOnce({ error: { message: "Failed to fetch" } }).mockResolvedValueOnce({ data: { ok: true, edition: { id: "edition-a" }, replayed: true }, error: null });
  await applyEditionVisualChange(input);
  expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
});
it("does not retry a rejected concurrent edit or invent a success result", async () => {
  rpc.mockResolvedValue({ error: { code: "40001", message: "STATE_CHANGED" } });
  await expect(applyEditionVisualChange(input)).rejects.toMatchObject({ code: "40001" });
  expect(rpc).toHaveBeenCalledTimes(1);
  rpc.mockResolvedValue({ data: { ok: false }, error: null });
  await expect(applyEditionVisualChange(input)).rejects.toThrow("confirmed canonical result");
});
