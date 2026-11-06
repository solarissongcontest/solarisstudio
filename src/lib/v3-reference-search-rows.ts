/** Normalize only the bounded, publication-safe Solaris search projection.
 * Country Wiki search hits are legacy aliases, not second canonical entities.
 */
export type ReferenceResultKind = "edition" | "country" | "entry" | "show";

export type ReferenceSearchItem = {
  id: string;
  kind: ReferenceResultKind;
  title: string;
  subtitle: string;
  href: string;
};

const VISIBLE_KINDS = new Set<ReferenceResultKind>(["edition", "country", "entry", "show"]);
const SAFE_RESULT_HREF: Record<ReferenceResultKind | "wiki", RegExp> = {
  country: /^\/countries\/[A-Za-z0-9_-]+$/,
  wiki: /^\/wiki\/[A-Za-z0-9_-]+$/,
  edition: /^\/editions\/[A-Za-z0-9_-]+$/,
  show: /^\/shows\/[A-Za-z0-9_-]+$/,
  // Published entry searches deliberately drill into their Country profile.
  entry: /^\/countries\/[A-Za-z0-9_-]+$/,
};

export function parseReferenceSearchRows(value: unknown): ReferenceSearchItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid public search projection");

  const seen = new Set<string>();
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid public search row");
    const row = raw as Record<string, unknown>;
    const legacyWiki = row.result_type === "wiki";
    if (!legacyWiki && !VISIBLE_KINDS.has(row.result_type as ReferenceResultKind)) return [];

    const id = typeof row.result_id === "string" ? row.result_id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const href = typeof row.href === "string" ? row.href.trim() : "";
    const sourceKind = legacyWiki ? "wiki" : row.result_type as ReferenceResultKind;
    if (!id || !title || !SAFE_RESULT_HREF[sourceKind].test(href)) {
      throw new Error("Invalid public Reference result");
    }

    // /wiki/$code is preserved for bookmarks, but rolled-out Reference links
    // directly to the same canonical country identity as /countries/$code.
    const canonicalHref = legacyWiki ? href.replace(/^\/wiki\//, "/countries/") : href;
    const kind: ReferenceResultKind = legacyWiki ? "country" : row.result_type as ReferenceResultKind;
    const key = kind === "country" ? `country:${canonicalHref}` : id;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      id,
      kind,
      title: legacyWiki ? title.replace(/ in the Wiki$/, "") : title,
      subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
      href: canonicalHref,
    }];
  });
}
