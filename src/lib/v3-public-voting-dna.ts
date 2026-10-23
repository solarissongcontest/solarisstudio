import { supabase } from "@/integrations/supabase/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RELATIONSHIPS = 10;
const MAX_RESULT_ROWS = 256;

export type V3PublicVotingDnaRelationship = {
  countryId: string;
  points: number;
  ballots: number;
};

export type V3PublicVotingDnaResult = {
  editionId: string;
  showId: string;
  finalRank: number | null;
  totalPoints: number;
  juryPublished: boolean;
  juryPoints: number | null;
  televotePublished: boolean;
  televotePoints: number | null;
};

export type V3PublicVotingDna = {
  schemaVersion: 1;
  formulaVersion: "v1";
  sample: {
    detailedEditions: number;
    givenPoints: number;
    receivedPoints: number;
    resultEditions: number;
  };
  topGiven: V3PublicVotingDnaRelationship[];
  topReceived: V3PublicVotingDnaRelationship[];
  results: V3PublicVotingDnaResult[];
};

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as RpcClient;

export async function loadV3PublicVotingDna(
  countryId: string,
): Promise<V3PublicVotingDna> {
  if (!UUID_PATTERN.test(countryId)) {
    throw new Error("Invalid Voting DNA country identity");
  }

  const { data, error } = await client.rpc("v3_public_country_voting_dna", {
    p_country_id: countryId,
  });

  if (error) {
    throw new Error("Voting DNA projection unavailable");
  }

  return parseV3PublicVotingDna(data);
}

export function parseV3PublicVotingDna(value: unknown): V3PublicVotingDna {
  const root = asRecord(value, "Voting DNA projection");
  if (root.schemaVersion !== 1) {
    throw new Error("Unsupported Voting DNA schema version");
  }
  if (root.formulaVersion !== "v1") {
    throw new Error("Unsupported Voting DNA formula version");
  }

  const sample = asRecord(root.sample, "Voting DNA sample");
  const topGiven = parseRelationships(root.topGiven, "topGiven");
  const topReceived = parseRelationships(root.topReceived, "topReceived");
  const rawResults = asArray(root.results, "Voting DNA results");

  if (rawResults.length > MAX_RESULT_ROWS) {
    throw new Error("Voting DNA result sample exceeds the bounded contract");
  }

  const results = rawResults.map((row, index) => parseResult(row, index));
  const resultEditions = nonNegativeInteger(sample.resultEditions, "resultEditions");
  const seenEditions = new Set<string>();

  for (const result of results) {
    if (seenEditions.has(result.editionId)) {
      throw new Error("Voting DNA result sample contains duplicate edition identity");
    }
    seenEditions.add(result.editionId);
  }

  if (resultEditions !== results.length) {
    throw new Error("Voting DNA result sample count mismatch");
  }

  return {
    schemaVersion: 1,
    formulaVersion: "v1",
    sample: {
      detailedEditions: nonNegativeInteger(sample.detailedEditions, "detailedEditions"),
      givenPoints: nonNegativeNumber(sample.givenPoints, "givenPoints"),
      receivedPoints: nonNegativeNumber(sample.receivedPoints, "receivedPoints"),
      resultEditions,
    },
    topGiven,
    topReceived,
    results,
  };
}

function parseRelationships(
  value: unknown,
  label: string,
): V3PublicVotingDnaRelationship[] {
  const rows = asArray(value, label);
  if (rows.length > MAX_RELATIONSHIPS) {
    throw new Error(`${label} exceeds the bounded relationship contract`);
  }

  const seen = new Set<string>();
  return rows.map((row, index) => {
    const item = asRecord(row, `${label}[${index}]`);
    const countryId = uuid(item.countryId, `${label}[${index}].countryId`);
    if (seen.has(countryId)) {
      throw new Error(`${label} contains duplicate country identity`);
    }
    seen.add(countryId);

    return {
      countryId,
      points: nonNegativeNumber(item.points, `${label}[${index}].points`),
      ballots: nonNegativeInteger(item.ballots, `${label}[${index}].ballots`),
    };
  });
}

function parseResult(value: unknown, index: number): V3PublicVotingDnaResult {
  const row = asRecord(value, `results[${index}]`);
  const juryPublished = boolean(row.juryPublished, `results[${index}].juryPublished`);
  const televotePublished = boolean(
    row.televotePublished,
    `results[${index}].televotePublished`,
  );
  const juryPoints = publishedPoints(
    row.juryPoints,
    juryPublished,
    `results[${index}].juryPoints`,
  );
  const televotePoints = publishedPoints(
    row.televotePoints,
    televotePublished,
    `results[${index}].televotePoints`,
  );

  return {
    editionId: uuid(row.editionId, `results[${index}].editionId`),
    showId: uuid(row.showId, `results[${index}].showId`),
    finalRank:
      row.finalRank === null
        ? null
        : positiveInteger(row.finalRank, `results[${index}].finalRank`),
    totalPoints: nonNegativeNumber(row.totalPoints, `results[${index}].totalPoints`),
    juryPublished,
    juryPoints,
    televotePublished,
    televotePoints,
  };
}

function publishedPoints(value: unknown, published: boolean, label: string) {
  if (!published) {
    if (value !== null) {
      throw new Error(`${label} must be null while its result layer is hidden`);
    }
    return null;
  }

  return nonNegativeNumber(value, label);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const parsed = nonNegativeNumber(value, label);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed < 1) throw new Error(`${label} must be positive`);
  return parsed;
}
