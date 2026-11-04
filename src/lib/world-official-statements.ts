/**
 * TG9 official statements: deliberately public-only projections. No private
 * draft records, auth-user identities, raw table rows, or client-owned canon.
 */
export const WORLD_STATEMENT_PAGE_SIZE = 12;
export type OfficialStatementType = "organization" | "officeholder";

export type WorldStatementSummary = {
  id: string;
  title: string;
  publishedAt: string;
  statementType: OfficialStatementType;
  revision: number;
  organizationSlug: string;
  organizationName: string;
  officeTitle: string | null;
  issuerName: string | null;
};
export type WorldStatementFeed = {
  items: WorldStatementSummary[];
  hasMore: boolean;
  offset: number;
};
export type WorldStatementDetail = WorldStatementSummary & {
  updatedAt: string;
  currentVersion: number;
  shownVersion: number;
  body: string;
  correctionReason: string | null;
  versionPublishedAt: string;
};
export type WorldStatementVersion = {
  version: number;
  publishedAt: string;
  correctionReason: string | null;
};
export type WorldStatementHistory = {
  items: WorldStatementVersion[];
  hasMore: boolean;
  offset: number;
};
export type WorldStatementManageContext = {
  organizationId: string;
  organizationSlug: string;
  canPublishAsOrganization: boolean;
  offices: Array<{ id: string; title: string }>;
};
export type WorldStatementReceipt = {
  ok: true;
  statementId: string;
  revision: number;
  operationId: string;
  replayed: boolean;
};

export class WorldStatementProjectionError extends Error {
  constructor(reason: string) {
    super("Invalid official statement " + reason + " projection");
    this.name = "WorldStatementProjectionError";
  }
}

type Row = Record<string, unknown>;
const object = (x: unknown): x is Row => !!x && typeof x === "object" && !Array.isArray(x);
const string = (x: unknown): x is string => typeof x === "string";
const nonempty = (x: unknown): x is string => string(x) && x.trim().length > 0;
const uuid = (x: unknown): x is string => string(x) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const positive = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;
const nonnegative = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;
const date = (x: unknown): x is string => nonempty(x) && Number.isFinite(Date.parse(x));
const nullable = (x: unknown): x is string | null => x === null || nonempty(x);
const slug = (x: unknown): x is string => string(x) &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x) && x.length <= 80;
const type = (x: unknown): x is OfficialStatementType =>
  x === "organization" || x === "officeholder";
const invalid = (label: string): never => { throw new WorldStatementProjectionError(label); };

export function normalizeWorldStatementSlug(value: unknown): string {
  if (!slug(value)) throw new Error("Invalid public organization path");
  return value;
}
export function normalizeWorldStatementId(value: unknown): string {
  if (!uuid(value)) throw new Error("Invalid public statement path");
  return value.toLowerCase();
}
export function normalizeWorldStatementVersion(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && !/^[1-9][0-9]{0,8}$/.test(value)) {
    throw new Error("Invalid statement version");
  }
  const n = Number(value);
  if (!positive(n) || n > 1_000_000) throw new Error("Invalid statement version");
  return n;
}

export function parseWorldStatementSummary(value: unknown): WorldStatementSummary {
  if (object(value) && ((value.visibility !== undefined && value.visibility !== "public") ||
    (value.organizationVisibility !== undefined && value.organizationVisibility !== "public"))) {
    return invalid("publication boundary");
  }
  if (!object(value) || !uuid(value.id) || !nonempty(value.title) ||
    !date(value.publishedAt) || !type(value.statementType) || !positive(value.revision) ||
    !slug(value.organizationSlug) || !nonempty(value.organizationName) ||
    !nullable(value.officeTitle) || !nullable(value.issuerName)) return invalid("summary");
  if (value.statementType === "organization" &&
    (value.officeTitle !== null || value.issuerName !== null)) return invalid("organization issuer");
  if (value.statementType === "officeholder" &&
    (!nonempty(value.officeTitle) || !nonempty(value.issuerName))) return invalid("officeholder issuer");
  return {
    id: value.id.toLowerCase(), title: value.title, publishedAt: value.publishedAt,
    statementType: value.statementType, revision: value.revision,
    organizationSlug: value.organizationSlug, organizationName: value.organizationName,
    officeTitle: value.officeTitle, issuerName: value.issuerName,
  };
}

export function parseWorldStatementFeed(value: unknown, expectedOffset: number,
  expectedSlug?: string): WorldStatementFeed {
  if (!object(value) || !Array.isArray(value.items) ||
    typeof value.hasMore !== "boolean" || value.offset !== expectedOffset ||
    !nonnegative(value.offset) || value.items.length > WORLD_STATEMENT_PAGE_SIZE) {
    return invalid("feed");
  }
  const items = value.items.map(parseWorldStatementSummary);
  if (expectedSlug && items.some(item => item.organizationSlug !== expectedSlug)) return invalid("scope");
  if (new Set(items.map(item => item.id)).size !== items.length) return invalid("duplicate identity");
  for (let i = 1; i < items.length; i++) {
    const previous = items[i - 1], current = items[i];
    if (Date.parse(previous.publishedAt) < Date.parse(current.publishedAt)) return invalid("ordering");
    if (previous.publishedAt === current.publishedAt && previous.id < current.id) return invalid("ordering");
  }
  if (value.hasMore && items.length !== WORLD_STATEMENT_PAGE_SIZE) return invalid("pagination");
  return { items, hasMore: value.hasMore, offset: value.offset };
}

export function parseWorldStatementDetail(value: unknown,
  expectedId: string, expectedSlug: string, expectedVersion: number | null): WorldStatementDetail | null {
  if (value === null) return null;
  if (!object(value) || !date(value.updatedAt) || !positive(value.currentVersion) ||
    !positive(value.shownVersion) || value.shownVersion > value.currentVersion ||
    !string(value.body) || !nonempty(value.body) || !nullable(value.correctionReason) ||
    !date(value.versionPublishedAt)) return invalid("detail");
  const summary = parseWorldStatementSummary(value);
  if (summary.id !== expectedId || summary.organizationSlug !== expectedSlug ||
    (expectedVersion !== null && value.shownVersion !== expectedVersion) ||
    summary.revision !== value.currentVersion) return invalid("detail identity");
  if (value.shownVersion === 1 && value.correctionReason !== null) return invalid("initial correction");
  if (value.shownVersion > 1 && !nonempty(value.correctionReason)) return invalid("correction reason");
  return {
    ...summary, updatedAt: value.updatedAt, currentVersion: value.currentVersion,
    shownVersion: value.shownVersion, body: value.body,
    correctionReason: value.correctionReason, versionPublishedAt: value.versionPublishedAt,
  };
}

export function parseWorldStatementHistory(value: unknown,
  expectedOffset: number): WorldStatementHistory | null {
  if (value === null) return null;
  if (!object(value) || !Array.isArray(value.items) || value.items.length > WORLD_STATEMENT_PAGE_SIZE ||
    typeof value.hasMore !== "boolean" || value.offset !== expectedOffset) return invalid("history");
  const seen = new Set<number>();
  const items = value.items.map((entry: unknown): WorldStatementVersion => {
    if (!object(entry) || !positive(entry.version) || !date(entry.publishedAt) ||
      !nullable(entry.correctionReason) || (entry.version === 1 && entry.correctionReason !== null) ||
      (entry.version > 1 && !nonempty(entry.correctionReason)) || seen.has(entry.version)) {
      return invalid("history entry");
    }
    seen.add(entry.version);
    return { version: entry.version, publishedAt: entry.publishedAt, correctionReason: entry.correctionReason };
  });
  for (let i = 1; i < items.length; i++) {
    if (items[i].version >= items[i-1].version) return invalid("history order");
  }
  if (value.hasMore && items.length !== WORLD_STATEMENT_PAGE_SIZE) return invalid("history pagination");
  return { items, hasMore: value.hasMore, offset: value.offset };
}

export function parseWorldStatementManageContext(value: unknown, expectedSlug: string): WorldStatementManageContext {
  if (!object(value) || !uuid(value.organizationId) ||
    value.organizationSlug !== expectedSlug || typeof value.canPublishAsOrganization !== "boolean" ||
    !Array.isArray(value.offices) || value.offices.length > 40) return invalid("management context");
  const offices = value.offices.map((entry: unknown) => {
    if (!object(entry) || !uuid(entry.id) || !nonempty(entry.title)) return invalid("office");
    return { id: entry.id, title: entry.title };
  });
  if (!value.canPublishAsOrganization && offices.length === 0) return invalid("empty management");
  if (new Set(offices.map(entry => entry.id)).size !== offices.length) return invalid("duplicate office");
  return { organizationId: value.organizationId, organizationSlug: expectedSlug,
    canPublishAsOrganization: value.canPublishAsOrganization, offices };
}

export function parseWorldStatementReceipt(value: unknown): WorldStatementReceipt {
  if (!object(value) || value.ok !== true || !uuid(value.statementId) ||
    !uuid(value.operationId) || !positive(value.revision) ||
    typeof value.replayed !== "boolean") return invalid("receipt");
  return { ok: true, statementId: value.statementId, operationId: value.operationId,
    revision: value.revision, replayed: value.replayed };
}

/** The same operation identifier AND payload must be reused after uncertain delivery. */
export type WorldStatementOperation = { operationId: string; idempotencyKey: string };
export function createWorldStatementOperation(): WorldStatementOperation {
  const id = crypto.randomUUID();
  return { operationId: id, idempotencyKey: id };
}
