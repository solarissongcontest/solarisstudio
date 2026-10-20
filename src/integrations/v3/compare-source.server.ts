import { loadV3DelegationBundle } from "@/integrations/v3/delegation-source.server";
import { loadV3RelationshipDetailBundle } from "@/integrations/v3/relationships-source.server";
import { buildV3CompareBundle, type V3CompareBundle } from "@/lib/v3-compare";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/**
 * Publication-safe Compare composition.
 *
 * Compare deliberately does not read participants/results/jury/televote tables
 * itself. It composes the canonical public Delegation projections with the
 * canonical server-derived Relationship detail projection so raw archive rows
 * never cross into the browser just to render a comparison.
 */
export async function loadV3CompareBundle(input: {
  a: string;
  b: string;
}): Promise<V3CompareBundle> {
  const requestedA = normalizeCode(input.a);
  const requestedB = normalizeCode(input.b);
  if (!requestedA || !requestedB || requestedA === requestedB) return null;

  const [aBundle, bBundle] = await Promise.all([
    loadV3DelegationBundle({ code: requestedA }),
    loadV3DelegationBundle({ code: requestedB }),
  ]);
  if (!aBundle || !bBundle) return null;

  const aCode = normalizeCode(aBundle.projection.code);
  const bCode = normalizeCode(bBundle.projection.code);
  if (!aCode || !bCode || aCode === bCode) return null;

  const relationship = await loadV3RelationshipDetailBundle(`${aCode}-VS-${bCode}`);
  if (!relationship) return null;

  return buildV3CompareBundle({
    a: aBundle.projection,
    b: bBundle.projection,
    relationship,
  });
}
