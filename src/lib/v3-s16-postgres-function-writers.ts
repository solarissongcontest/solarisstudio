function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Inspect executable PL/pgSQL tokens, not command labels such as 'show.execute'.
 * pg_get_functiondef wraps the actual body in an AS dollar quote; unwrap that
 * one layer while retaining nested dollar-quoted SQL as data. Target discovery
 * remains conservative across the entire definition when EXECUTE is present.
 */
export function containsPostgresExecute(definition: string): boolean {
  const outer = /\bAS\s+(\$[a-zA-Z_0-9]*\$)/i.exec(definition);
  const start = outer ? outer.index + outer[0].length : 0;
  const finish = outer ? definition.lastIndexOf(outer[1]) : definition.length;
  const body = definition.slice(start, finish < start ? undefined : finish);
  const scan = (legacyBackslash: boolean): boolean => {
  for (let i = 0; i < body.length;) {
    if (body.startsWith("--", i)) {
      const end = body.indexOf("\n", i + 2);
      i = end < 0 ? body.length : end + 1;
    } else if (body.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < body.length && depth) {
        if (body.startsWith("/*", i)) { depth++; i += 2; }
        else if (body.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
    } else if (body[i] === "'" || body[i] === '"') {
      const escaped = legacyBackslash || (i > 0 && /[eE]/.test(body[i - 1]) && (i < 2 || !/[a-zA-Z_0-9$]/.test(body[i - 2])));
      const quote = body[i++];
      while (i < body.length) {
        if (quote === "'" && escaped && body[i] === "\\") i += 2;
        else if (body[i] !== quote) i++;
        else if (body[i + 1] === quote) i += 2;
        else { i++; break; }
      }
    } else if (body[i] === "$" && /^\$[a-zA-Z_0-9]*\$/.test(body.slice(i))) {
      const delimiter = /^\$[a-zA-Z_0-9]*\$/.exec(body.slice(i))![0];
      const end = body.indexOf(delimiter, i + delimiter.length);
      i = end < 0 ? body.length : end + delimiter.length;
    } else if (/[a-zA-Z_]/.test(body[i])) {
      const word = /^[a-zA-Z_0-9$]+/.exec(body.slice(i))![0];
      if (word.toLowerCase() === "execute") return true;
      i += word.length;
    } else i++;
  }
  return false;
  };
  // Be conservative if a caller changes standard_conforming_strings: detect
  // executable SQL in either legal string-escape mode rather than miss a writer.
  return scan(false) || scan(true);
}

export function definitionWritesTable(definition: string, table: string): boolean {
  const [schema, name] = table.includes(".") ? table.split(".", 2) : ["public", table];
  const schemaPattern = `(?:["']?${regexEscape(schema)}["']?\\s*\\.\\s*)?`;
  const tablePattern = `["']?${regexEscape(name)}["']?`;
  const direct = new RegExp(`\\b(?:insert\\s+into|update|delete\\s+from|merge\\s+into)\\s+${schemaPattern}${tablePattern}\\b`, "i");
  if (direct.test(definition)) return true;
  return containsPostgresExecute(definition) && new RegExp(`\\b${regexEscape(name)}\\b`, "i").test(definition);
}
