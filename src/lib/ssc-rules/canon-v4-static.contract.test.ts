import { describe, expect, it } from "vitest";

import {
  CANONICAL_LEGACY_RULE_ALIASES,
  CANONICAL_RULE_CHAPTERS,
} from "@/lib/ssc-rules/canon-v4.generated";
import {
  LEGACY_RULE_ALIASES as SOURCE_LEGACY_RULE_ALIASES,
  SSC_RULE_CHAPTERS as SOURCE_RULE_CHAPTERS,
  SSC_RULEBOOK as SOURCE_RULEBOOK,
  SSC_RULES as SOURCE_RULES,
} from "@/lib/ssc-rules/canon-v4-source";
import {
  LEGACY_RULE_ALIASES,
  SSC_RULE_CHAPTERS,
  SSC_RULEBOOK,
  SSC_RULES,
} from "@/lib/ssc-rules/canon-v4";

describe("SSC V4 static canon runtime", () => {
  it("keeps the generated chapters and legacy aliases identical to the compiler oracle", () => {
    expect(CANONICAL_RULE_CHAPTERS).toEqual(SOURCE_RULE_CHAPTERS);
    expect(CANONICAL_LEGACY_RULE_ALIASES).toEqual(SOURCE_LEGACY_RULE_ALIASES);
  });

  it("serves the generated chapters without shipping the source compiler into production", () => {
    expect(SSC_RULE_CHAPTERS).toBe(CANONICAL_RULE_CHAPTERS);
    expect(LEGACY_RULE_ALIASES).toBe(CANONICAL_LEGACY_RULE_ALIASES);
  });

  it("preserves the compiler's flattened public rules and rulebook metadata exactly", () => {
    expect(SSC_RULES).toEqual(SOURCE_RULES);
    expect(SSC_RULEBOOK).toEqual(SOURCE_RULEBOOK);
  });
});
