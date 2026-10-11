export const V3_REQUEST_MATERIAL_VERSION = 1 as const;
export const V3_REQUEST_HASH_ALGORITHM = "sha256" as const;
export const V3_REQUEST_MATERIAL_ENCODING = "utf-8" as const;

export type V3CanonicalRequestScope = {
  actorId: string;
  action: string;
  contextKey: string;
};

export type V3CanonicalRequestMaterial = {
  version: typeof V3_REQUEST_MATERIAL_VERSION;
  hashAlgorithm: typeof V3_REQUEST_HASH_ALGORITHM;
  encoding: typeof V3_REQUEST_MATERIAL_ENCODING;
  canonical: string;
};

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function encodeString(value: string) {
  return JSON.stringify(value);
}

function encodeNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("canonical JSON does not support non-finite numbers");
  }
  // ECMAScript JSON serialization already normalizes -0 to 0. Keeping that
  // rule explicit prevents different callers from inventing a signed-zero hash.
  return Object.is(value, -0) ? "0" : JSON.stringify(value);
}

function assertPlainObject(value: object) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("canonical JSON supports only plain objects");
  }
}

function encodeArray(value: unknown[], ancestors: WeakSet<object>): string {
  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key === "symbol") {
      throw new Error("canonical JSON does not support symbol keys");
    }
    if (key === "length") continue;

    const numericIndex = Number(key);
    const isRealIndex =
      /^(0|[1-9]\d*)$/.test(key) &&
      Number.isSafeInteger(numericIndex) &&
      numericIndex >= 0 &&
      numericIndex < value.length &&
      String(numericIndex) === key;
    if (!isRealIndex) {
      throw new Error("canonical JSON arrays cannot contain named properties");
    }
  }

  const encoded: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error("canonical JSON does not support sparse arrays");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || "get" in descriptor || "set" in descriptor) {
      throw new Error("canonical JSON does not support accessor properties");
    }
    encoded.push(encodeCanonicalValue(value[index], ancestors));
  }
  return `[${encoded.join(",")}]`;
}

function encodeObject(
  value: Record<string, unknown>,
  ancestors: WeakSet<object>,
): string {
  assertPlainObject(value);

  const allKeys = Reflect.ownKeys(value);
  if (allKeys.some((key) => typeof key === "symbol")) {
    throw new Error("canonical JSON does not support symbol keys");
  }

  const propertyNames = Object.getOwnPropertyNames(value);
  const enumerableKeys = Object.keys(value);
  if (propertyNames.length !== enumerableKeys.length) {
    throw new Error("canonical JSON does not support non-enumerable properties");
  }

  const keys = [...enumerableKeys].sort();
  const encoded: string[] = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || "get" in descriptor || "set" in descriptor) {
      throw new Error("canonical JSON does not support accessor properties");
    }
    encoded.push(`${encodeString(key)}:${encodeCanonicalValue(value[key], ancestors)}`);
  }
  return `{${encoded.join(",")}}`;
}

function encodeCanonicalValue(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return encodeString(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return encodeNumber(value);
    case "undefined":
      throw new Error("canonical JSON does not support undefined");
    case "bigint":
      throw new Error("canonical JSON does not support bigint");
    case "symbol":
      throw new Error("canonical JSON does not support symbols");
    case "function":
      throw new Error("canonical JSON does not support functions");
    case "object": {
      if (ancestors.has(value)) {
        throw new Error("canonical JSON does not support cyclic values");
      }
      ancestors.add(value);
      try {
        return Array.isArray(value)
          ? encodeArray(value, ancestors)
          : encodeObject(value as Record<string, unknown>, ancestors);
      } finally {
        ancestors.delete(value);
      }
    }
  }
}

/**
 * Deterministically serializes JSON-compatible data for critical-operation
 * request hashing. Object keys are sorted recursively; array order is retained.
 *
 * This function deliberately does not normalize Unicode text. User content is
 * hashed exactly as validated by the workflow boundary; silently applying NFC,
 * NFKC or locale transforms here could make distinct submitted titles/URLs look
 * like the same protected request.
 */
export function canonicalizeV3Json(value: unknown): string {
  return encodeCanonicalValue(value, new WeakSet<object>());
}

/**
 * Produces the exact versioned canonical text whose UTF-8 bytes must be hashed.
 *
 * Hashing is intentionally outside this module. Server and client adapters may
 * use their platform's SHA-256 implementation, but both MUST hash these exact
 * UTF-8 bytes. Neither timestamps, retries, device IDs nor random values belong
 * in this material unless they are semantically part of the protected request.
 */
export function buildV3CanonicalRequestMaterial(input: {
  scope: V3CanonicalRequestScope;
  payload: unknown;
}): V3CanonicalRequestMaterial {
  requireNonEmpty(input.scope.actorId, "scope.actorId");
  requireNonEmpty(input.scope.action, "scope.action");
  requireNonEmpty(input.scope.contextKey, "scope.contextKey");

  const canonical = canonicalizeV3Json({
    action: input.scope.action,
    actorId: input.scope.actorId,
    contextKey: input.scope.contextKey,
    payload: input.payload,
    version: V3_REQUEST_MATERIAL_VERSION,
  });

  return {
    version: V3_REQUEST_MATERIAL_VERSION,
    hashAlgorithm: V3_REQUEST_HASH_ALGORITHM,
    encoding: V3_REQUEST_MATERIAL_ENCODING,
    canonical,
  };
}
