import { describe, expect, it } from "vitest";

import {
  V3_REQUEST_HASH_ALGORITHM,
  V3_REQUEST_MATERIAL_ENCODING,
  V3_REQUEST_MATERIAL_VERSION,
  buildV3CanonicalRequestMaterial,
  canonicalizeV3Json,
} from "./v3-canonical-request-material";

const SCOPE = {
  actorId: "oland",
  action: "confirmation.submit",
  contextKey: "ssc22:round-1",
};

describe("Solaris Studio V3 canonical request material", () => {
  it("produces identical canonical JSON regardless of object insertion order", () => {
    expect(canonicalizeV3Json({ b: 2, a: 1 })).toBe(
      canonicalizeV3Json({ a: 1, b: 2 }),
    );
    expect(
      canonicalizeV3Json({ z: { d: 4, c: 3 }, a: [{ y: 2, x: 1 }] }),
    ).toBe(
      canonicalizeV3Json({ a: [{ x: 1, y: 2 }], z: { c: 3, d: 4 } }),
    );
  });

  it("retains array order because ballot/entry order can be semantically meaningful", () => {
    expect(canonicalizeV3Json(["a", "b"])).not.toBe(
      canonicalizeV3Json(["b", "a"]),
    );
  });

  it("normalizes negative zero to the same representation as zero", () => {
    expect(canonicalizeV3Json(-0)).toBe("0");
    expect(canonicalizeV3Json(-0)).toBe(canonicalizeV3Json(0));
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite number %s", (value) => {
    expect(() => canonicalizeV3Json(value)).toThrow(
      "canonical JSON does not support non-finite numbers",
    );
  });

  it("rejects unsupported JSON values instead of silently dropping them", () => {
    expect(() => canonicalizeV3Json({ x: undefined })).toThrow(
      "canonical JSON does not support undefined",
    );
    expect(() => canonicalizeV3Json({ x: 1n })).toThrow(
      "canonical JSON does not support bigint",
    );
    expect(() => canonicalizeV3Json({ x: Symbol("x") })).toThrow(
      "canonical JSON does not support symbols",
    );
    expect(() => canonicalizeV3Json({ x: () => 1 })).toThrow(
      "canonical JSON does not support functions",
    );
  });

  it("rejects sparse arrays and named array properties", () => {
    const sparse = ["a", , "c"];
    expect(() => canonicalizeV3Json(sparse)).toThrow(
      "canonical JSON does not support sparse arrays",
    );

    const named = ["a"] as unknown[] & Record<string, unknown>;
    named.extra = true;
    expect(() => canonicalizeV3Json(named)).toThrow(
      "canonical JSON arrays cannot contain named properties",
    );

    const maxIndexLike = ["a"] as unknown[] & Record<string, unknown>;
    maxIndexLike["4294967295"] = "not-an-array-index";
    expect(() => canonicalizeV3Json(maxIndexLike)).toThrow(
      "canonical JSON arrays cannot contain named properties",
    );
  });

  it("rejects custom prototypes such as Date instead of depending on toJSON behavior", () => {
    expect(() => canonicalizeV3Json(new Date(0))).toThrow(
      "canonical JSON supports only plain objects",
    );
  });

  it("rejects cyclic structures but permits repeated non-cyclic object references", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeV3Json(cyclic)).toThrow(
      "canonical JSON does not support cyclic values",
    );

    const shared = { a: 1 };
    expect(canonicalizeV3Json({ left: shared, right: shared })).toBe(
      '{"left":{"a":1},"right":{"a":1}}',
    );
  });

  it("rejects accessor and hidden object properties rather than hashing side effects or invisible state", () => {
    let getterCalls = 0;
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 42;
      },
    });
    expect(() => canonicalizeV3Json(accessor)).toThrow(
      "canonical JSON does not support accessor properties",
    );
    expect(getterCalls).toBe(0);

    const hidden = { visible: true } as Record<string, unknown>;
    Object.defineProperty(hidden, "hidden", { value: 1, enumerable: false });
    expect(() => canonicalizeV3Json(hidden)).toThrow(
      "canonical JSON does not support non-enumerable properties",
    );
  });

  it("preserves Unicode exactly rather than silently normalizing user content", () => {
    const composed = "é";
    const decomposed = "e\u0301";
    expect(composed.normalize("NFC")).toBe(decomposed.normalize("NFC"));
    expect(canonicalizeV3Json(composed)).not.toBe(canonicalizeV3Json(decomposed));
  });

  it("builds versioned UTF-8 SHA-256 request material with scope inside the hash input", () => {
    const first = buildV3CanonicalRequestMaterial({
      scope: SCOPE,
      payload: { song: "Example", artist: "Artist" },
    });
    const reordered = buildV3CanonicalRequestMaterial({
      scope: SCOPE,
      payload: { artist: "Artist", song: "Example" },
    });

    expect(first).toEqual(reordered);
    expect(first.version).toBe(V3_REQUEST_MATERIAL_VERSION);
    expect(first.hashAlgorithm).toBe(V3_REQUEST_HASH_ALGORITHM);
    expect(first.encoding).toBe(V3_REQUEST_MATERIAL_ENCODING);
    expect(first.canonical).toContain('"version":1');
    expect(first.canonical).toContain('"actorId":"oland"');
    expect(first.canonical).toContain('"action":"confirmation.submit"');
    expect(first.canonical).toContain('"contextKey":"ssc22:round-1"');
  });

  it("changes canonical request material when any operation scope dimension changes", () => {
    const base = buildV3CanonicalRequestMaterial({ scope: SCOPE, payload: { x: 1 } });
    for (const scope of [
      { ...SCOPE, actorId: "vendia" },
      { ...SCOPE, action: "jury.submit" },
      { ...SCOPE, contextKey: "ssc22:round-2" },
    ]) {
      expect(buildV3CanonicalRequestMaterial({ scope, payload: { x: 1 } }).canonical).not.toBe(
        base.canonical,
      );
    }
  });

  it("rejects empty operation scope identifiers", () => {
    expect(() =>
      buildV3CanonicalRequestMaterial({
        scope: { ...SCOPE, actorId: "   " },
        payload: {},
      }),
    ).toThrow("scope.actorId must not be empty");
  });
});
