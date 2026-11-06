const ALLOWED_EXCEPTION_CATEGORIES = new Set([
  "architecture",
  "security",
  "migration",
  "ci",
  "release",
]);

const EXCEPTION_TOKEN = "test-integrity: allow-static-source-contract";
const EXCEPTION_RE =
  /test-integrity:\s*allow-static-source-contract\s*\[([a-z-]+)\]\s*--\s*([^\n]+)/i;
const PRODUCTION_ROOTS = new Set(["src", "scripts", "supabase", ".github", "public"]);
const ROOT_FILES = new Set([
  "vite.config.ts",
  "package.json",
  "bun.lock",
  "tsconfig.json",
]);
const SOURCE_EXTENSION_RE =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|css|sql|ya?ml|json|sh|py|html)$/i;
const TEST_PATH_RE = /(?:\.test\.|\.spec\.|\/__tests__\/)/i;

function parseException(source) {
  if (!source.includes(EXCEPTION_TOKEN)) return null;
  const match = source.match(EXCEPTION_RE);
  if (!match) {
    return {
      valid: false,
      reason:
        "allow marker must include [architecture|security|migration|ci|release] and a reason after --",
    };
  }

  const category = match[1].toLowerCase();
  const reason = match[2].trim();
  if (!ALLOWED_EXCEPTION_CATEGORIES.has(category)) {
    return { valid: false, reason: `unknown static-contract category [${category}]` };
  }
  if (reason.length < 16) {
    return { valid: false, reason: "static-contract exception reason is too short" };
  }
  return { valid: true, category, reason };
}

function quotedTokens(text) {
  const tokens = [];
  const expression = /["'`]([^"'`\n]+)["'`]/g;
  for (const match of text.matchAll(expression)) tokens.push(match[1]);
  return tokens;
}

function looksLikeProductionTarget(target) {
  if (TEST_PATH_RE.test(target)) return false;
  if (ROOT_FILES.has(target)) return true;
  const [root] = target.replace(/^\.\//, "").split("/");
  return PRODUCTION_ROOTS.has(root) && SOURCE_EXTENSION_RE.test(target);
}

export function extractProductionReadTargets(source) {
  const targets = new Set();
  const directPath =
    /["'`]((?:src|scripts|supabase|\.github|public)\/[^"'`\n]+\.(?:ts|tsx|js|jsx|mjs|cjs|css|sql|ya?ml|json|sh|py|html)|(?:vite\.config\.ts|package\.json|bun\.lock|tsconfig\.json))["'`]/gi;

  for (const match of source.matchAll(directPath)) {
    if (looksLikeProductionTarget(match[1])) targets.add(match[1]);
  }

  const readCall = /\breadFile(?:Sync)?\s*\(/g;
  for (const match of source.matchAll(readCall)) {
    const window = source.slice(match.index, match.index + 500);
    const tokens = quotedTokens(window).filter(
      (token) => !["utf8", "utf-8", "base64"].includes(token.toLowerCase()),
    );
    const rootIndex = tokens.findIndex(
      (token) => PRODUCTION_ROOTS.has(token) || ROOT_FILES.has(token),
    );
    if (rootIndex < 0) continue;

    if (ROOT_FILES.has(tokens[rootIndex])) {
      targets.add(tokens[rootIndex]);
      continue;
    }

    const pieces = [];
    for (const token of tokens.slice(rootIndex)) {
      if (/^(?:utf-?8|base64)$/i.test(token)) break;
      if (/^[A-Za-z0-9_.@$/-]+$/.test(token)) pieces.push(token);
      if (SOURCE_EXTENSION_RE.test(token)) break;
    }
    const target = pieces.join("/").replace(/\/+/g, "/");
    if (looksLikeProductionTarget(target)) targets.add(target);
  }

  return [...targets].sort();
}

function extractLiteralAssertions(source) {
  const literals = [];
  const expressions = [
    /\.(?:toContain|toMatch)\(\s*"((?:\\.|[^"\\]){1,400})"\s*\)/g,
    /\.(?:toContain|toMatch)\(\s*'((?:\\.|[^'\\]){1,400})'\s*\)/g,
    /\.(?:toContain|toMatch)\(\s*`((?:\\.|[^`\\]){1,400})`\s*\)/g,
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) literals.push(match[1]);
  }
  return literals;
}

function signalCounts(literals) {
  const counts = {
    uiProse: 0,
    cssImplementation: 0,
    assetFilename: 0,
    historicalDate: 0,
    shellOutput: 0,
  };

  for (const literal of literals) {
    const words = literal.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
    if (
      words.length >= 4 &&
      /\s/.test(literal) &&
      !/[<>{}=;]/.test(literal)
    ) {
      counts.uiProse += 1;
    }
    if (
      /(?:transform\s*:|translate[XYZ]?\(|scale\(|padding(?:-[a-z]+)?\s*:|margin(?:-[a-z]+)?\s*:|grid-template|--[a-z0-9-]+\s*:)/i.test(
        literal,
      )
    ) {
      counts.cssImplementation += 1;
    }
    if (/\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?)\b/i.test(literal)) {
      counts.assetFilename += 1;
    }
    if (
      /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i.test(
        literal,
      )
    ) {
      counts.historicalDate += 1;
    }
    if (/::(?:error|warning)::|\[(?:PASS|FAIL|INFO|WARN)\]|\becho\s+/i.test(literal)) {
      counts.shellOutput += 1;
    }
  }

  return counts;
}

export function analyzeTestIntegrity(filePath, source) {
  const exception = parseException(source);
  const productionReads = extractProductionReadTargets(source);
  const rawAssertions = extractLiteralAssertions(source);
  const signals = signalCounts(rawAssertions);
  const semanticSignals = Object.entries(signals).filter(([, count]) => count > 0);
  const reasons = [];

  if (exception?.valid) {
    return {
      filePath,
      flagged: false,
      allowed: true,
      exception,
      productionReads,
      rawAssertionCount: rawAssertions.length,
      signals,
      reasons,
    };
  }

  if (exception && !exception.valid) reasons.push(`invalid exception: ${exception.reason}`);

  if (productionReads.length > 0 && rawAssertions.length >= 5) {
    reasons.push(`${rawAssertions.length} raw source substring assertions`);
  }

  if (productionReads.length > 0 && semanticSignals.length >= 2) {
    reasons.push(
      `implementation-lock signals: ${semanticSignals
        .map(([name, count]) => `${name}=${count}`)
        .join(", ")}`,
    );
  }

  return {
    filePath,
    flagged: Boolean((exception && !exception.valid) || reasons.length > 0),
    allowed: false,
    exception,
    productionReads,
    rawAssertionCount: rawAssertions.length,
    signals,
    reasons,
  };
}

export const TEST_INTEGRITY_EXCEPTION_HELP =
  "// test-integrity: allow-static-source-contract [security] -- explain why static source inspection is required";
