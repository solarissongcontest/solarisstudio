import { buildV42GovernedDraftChanges } from "@/lib/ssc-rules/v42-governed-draft";
import type { RulebookRelease } from "@/lib/rules-governance";

type RulebookRpc = (name: string, args: Record<string, unknown>) => Promise<any>;

export type V42DraftImportProgress = {
  imported: number;
  total: number;
};

export type V42DraftImportResult = {
  id: string;
  imported: number;
  unchanged: number;
  total: number;
};

/**
 * One canonical, human-triggered rulebook import shared between Organizer
 * Rules Manager and the authenticated emergency recovery page.
 *
 * No SQL privileges are elevated here: the existing admin RPCs enforce
 * rules.edit and the operational-mode gate. This function never publishes.
 * It resumes a partial draft without overwriting existing organizer edits.
 */
export async function prepareGovernedV42Draft(input: {
  releases: RulebookRelease[];
  rpc: RulebookRpc;
  onProgress?: (state: V42DraftImportProgress) => void;
  assertActor?: () => Promise<void>;
}): Promise<V42DraftImportResult> {
  const { releases, rpc, onProgress, assertActor } = input;
  const current = releases.find((release) => release.is_current);
  if (current?.version !== "4.1") {
    throw new Error("The current published rulebook changed. Review its newer text before importing v4.2.");
  }

  const existingDraft = releases.find(
    (release) => release.version === "4.2" && release.status === "draft",
  );
  if (existingDraft && existingDraft.title !== "Plain-English SSC General Regulations") {
    throw new Error("Another v4.2 draft already exists. Review it instead of overwriting its changes.");
  }
  if (releases.some((release) => release.version === "4.2" && release.status === "published")) {
    throw new Error("v4.2 was already published.");
  }

  const changes = buildV42GovernedDraftChanges();
  if (changes.length !== 113) throw new Error("The v4.2 import is incomplete.");
  await assertActor?.();

  const created = existingDraft ?? await rpc("admin_create_rulebook_release", {
    _version: "4.2",
    _title: "Plain-English SSC General Regulations",
    _summary:
      "Clarity revision of 113 regulations across 22 chapters. Policy edge cases require TSBC approval before publication.",
    _base_version: current.version,
  });
  if (typeof created?.id !== "string" || !created.id) {
    throw new Error("Rules Manager did not return a draft release ID.");
  }

  const existingIds = new Set((existingDraft?.changes ?? []).map((change) => change.rule_id));
  const total = changes.length;
  let imported = 0;
  onProgress?.({ imported, total });

  for (const change of changes) {
    if (existingIds.has(change.rule_id)) continue;
    await assertActor?.();
    await rpc("admin_upsert_rulebook_change", {
      _release_id: created.id,
      _rule_id: change.rule_id,
      _change_kind: change.change_kind,
      _before_snapshot: change.before_snapshot,
      _after_snapshot: change.after_snapshot,
      _rationale: change.rationale,
    });
    imported += 1;
    onProgress?.({ imported, total });
  }

  return {
    id: created.id,
    imported,
    unchanged: existingIds.size,
    total,
  };
}
