import { expect, it } from "vitest";
import { applyReviewedEditionPublication, type ReviewedEditionPublicationCommands } from "./edition-publication-review";
import type { ShowPublicationPreview } from "./show-publication-lifecycle";
const preview = (showId: string): ShowPublicationPreview => ({ showId, editionId: "edition-A", currentState: "public", targetState: "hidden", expectedVersion: 4, alreadyApplied: false, riskClass: "R2", config: {} as ShowPublicationPreview["config"], scheduledFor: null, sourceShowUpdatedAt: null, sourceResultVersion: null, hasOutcomes: false, resultReleaseReady: false, integrityClear: true });
const review = (): ReviewedEditionPublicationCommands => ({ editionId: "edition-A", commands: [{ preview: preview("show-A"), operationId: "operation-A" },{ preview: preview("show-B"), operationId: "operation-B" }] });
it("recovers a lost response midway through a batch using the same receipts and no duplicate canonical mutation", async () => {
 const input = review(); const committed = new Set<string>(); const attempts: string[] = [];
 let loseResponse = true;
 const apply: NonNullable<Parameters<typeof applyReviewedEditionPublication>[1]> = async (command) => {
  attempts.push(command.operationId);
  expect(command.idempotencyKey).toBe(command.operationId);
  expect(command.preview.expectedVersion).toBe(4);
  if (!committed.has(command.operationId)) {
   committed.add(command.operationId);
   if (loseResponse) { loseResponse = false; throw new Error("Committed response lost"); }
  }
  return { state: "hidden" as const, version: 5, scheduledFor: null };
 };
 const read = async () => [];
 await expect(applyReviewedEditionPublication(input,apply,read)).rejects.toThrow("Committed response lost");
 expect([...committed]).toEqual(["operation-A"]);
 await applyReviewedEditionPublication(input,apply,read);
 expect(attempts).toEqual(["operation-A","operation-A","operation-B"]);
 expect([...committed]).toEqual(["operation-A","operation-B"]);
});
it("rejects foreign scope, wrong target and repeated operation identity before any mutation", async () => {
 for (const corrupt of [
  (input: ReviewedEditionPublicationCommands) => { input.commands[1].preview.editionId="edition-B"; },
  (input: ReviewedEditionPublicationCommands) => { input.commands[1].preview.targetState="public"; },
  (input: ReviewedEditionPublicationCommands) => { input.commands[1].operationId=input.commands[0].operationId; },
 ]) {
  const input=review(); corrupt(input); let writes=0;
  const apply=async () => { writes++; return {state:"hidden" as const,version:5,scheduledFor:null}; };
  await expect(applyReviewedEditionPublication(input,apply,async()=>[])).rejects.toThrow("scope or identity is invalid");
  expect(writes).toBe(0);
 }
});
it("does not claim the edition is hidden when another show becomes public after the reviewed batch", async () => {
 const apply=async () => ({state:"hidden" as const,version:5,scheduledFor:null});
 const read=async () => [{editionId:"edition-A",state:"public" as const}];
 await expect(applyReviewedEditionPublication(review(),apply,read)).rejects.toThrow("another publication is active");
});
