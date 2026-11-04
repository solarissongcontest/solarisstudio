/**
 * TG4 provision draft adapter. The database remains the sole identity/authorization
 * authority. Visual ordering never becomes the provision's durable semantic key.
 */
export const MAX_WORLD_PROVISIONS_IN_EDITOR = 50;
const KEY = /^[a-z0-9]+(?:[.:-][a-z0-9]+)*$/;
const ANCHOR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type WorldDocumentProvision = {
  semanticKey: string;
  parentSemanticKey: string | null;
  displayLabel: string;
  heading: string;
  bodyPlainText: string;
  bodyStructured: Record<string, unknown>;
  anchor: string;
  status: "active" | "repealed" | "omitted";
};

export type WorldProvisionCommandRow = WorldDocumentProvision & { sortOrder: number };

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Reject corrupt canonical projections; never use guessed article identity. */
export function parseWorldDocumentProvisions(input: unknown): WorldDocumentProvision[] {
  if (!Array.isArray(input) || input.length > 1000) {
    throw new Error("Canonical legal provisions could not be read safely.");
  }
  const provisions = input.map((item: unknown) => {
    const row = object(item);
    const structured = object(row?.bodyStructured);
    if (!row || typeof row.semanticKey !== "string" ||
        typeof row.anchor !== "string" || typeof row.bodyPlainText !== "string" ||
        !structured || !Number.isSafeInteger(row.sortOrder) ||
        !["active", "repealed", "omitted"].includes(String(row.status)) ||
        (row.parentSemanticKey != null && typeof row.parentSemanticKey !== "string") ||
        (row.displayLabel != null && typeof row.displayLabel !== "string") ||
        (row.heading != null && typeof row.heading !== "string")) {
      throw new Error("Canonical legal provision identity or content is invalid.");
    }
    return {
      semanticKey: row.semanticKey,
      parentSemanticKey: row.parentSemanticKey ?? null,
      displayLabel: row.displayLabel ?? "",
      heading: row.heading ?? "",
      bodyPlainText: row.bodyPlainText,
      bodyStructured: structured,
      anchor: row.anchor,
      status: row.status,
      sortOrder: row.sortOrder,
    } as WorldDocumentProvision & { sortOrder: number };
  });
  provisions.sort((left, right) => left.sortOrder - right.sortOrder);
  const validation = validateWorldDocumentProvisions(provisions, 1000);
  if (validation) throw new Error("Canonical provisions are inconsistent: " + validation);
  return provisions.map(({ sortOrder: _sortOrder, ...rest }) => rest);
}

export function validateWorldDocumentProvisions(
  rows: readonly WorldDocumentProvision[],
  maxItems = MAX_WORLD_PROVISIONS_IN_EDITOR,
): string | null {
  if (rows.length > maxItems) return `Only ${maxItems} provisions can be edited in this workspace.`;
  const keys = new Set<string>();
  const anchors = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!KEY.test(row.semanticKey) || row.semanticKey.length > 120) {
      return `Provision ${index + 1}: use a stable lowercase key (for example membership.admission).`;
    }
    if (!ANCHOR.test(row.anchor) || row.anchor.length > 120) {
      return `Provision ${index + 1}: the anchor must be lowercase and hyphenated.`;
    }
    if (keys.has(row.semanticKey) || anchors.has(row.anchor)) {
      return "Provision keys and anchors must be unique within this version.";
    }
    keys.add(row.semanticKey);
    anchors.add(row.anchor);
    if (!object(row.bodyStructured) || row.heading.length > 240 ||
        row.displayLabel.length > 80 || row.bodyPlainText.length > 12000 ||
        !["active", "repealed", "omitted"].includes(row.status)) {
      return `Provision ${index + 1}: text, label or status is invalid.`;
    }
    if (row.status === "active" && !row.bodyPlainText.trim() && !row.heading.trim()) {
      return `Provision ${index + 1}: add a heading or article text.`;
    }
    if (row.parentSemanticKey !== null &&
        (!KEY.test(row.parentSemanticKey) || row.parentSemanticKey === row.semanticKey)) {
      return `Provision ${index + 1}: choose a different valid parent.`;
    }
  }
  const parents = new Map(rows.map((row) => [row.semanticKey, row.parentSemanticKey]));
  for (const row of rows) {
    let current = row.parentSemanticKey;
    const ancestors = new Set<string>([row.semanticKey]);
    while (current !== null) {
      if (!parents.has(current)) return `Provision ${row.semanticKey}: parent must exist in this version.`;
      if (ancestors.has(current)) return `Provision ${row.semanticKey}: a parent cycle is not permitted.`;
      ancestors.add(current);
      current = parents.get(current) ?? null;
    }
  }
  // Database caps JSONB at 1 MiB; bound characters below that even for UTF-8
  // multi-byte text (the server performs the authoritative byte-size check).
  if (JSON.stringify(rows).length > 200000) {
    return "The legal provision payload is too large for this editor.";
  }
  return null;
}

export function toWorldProvisionCommandRows(
  rows: readonly WorldDocumentProvision[],
): WorldProvisionCommandRow[] {
  const error = validateWorldDocumentProvisions(rows);
  if (error) throw new Error(error);
  return rows.map((row, sortOrder) => ({
    ...row,
    parentSemanticKey: row.parentSemanticKey || null,
    sortOrder,
  }));
}

export function addWorldDocumentProvision(
  rows: readonly WorldDocumentProvision[],
): WorldDocumentProvision[] {
  if (rows.length >= MAX_WORLD_PROVISIONS_IN_EDITOR) return [...rows];
  let number = 1;
  while (rows.some((row) => row.semanticKey === `article.${number}` ||
                             row.anchor === `article-${number}`)) number++;
  return [...rows, {
    semanticKey: `article.${number}`,
    anchor: `article-${number}`,
    parentSemanticKey: null,
    displayLabel: `Article ${number}`,
    heading: "",
    bodyPlainText: "",
    bodyStructured: {},
    status: "active",
  }];
}
