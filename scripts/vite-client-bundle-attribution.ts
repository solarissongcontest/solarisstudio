import { mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Plugin } from "vite";

const REPORT_DIR = resolve(process.cwd(), "artifacts/client-bundle");
const REPORT_PATH = resolve(REPORT_DIR, "build-attribution.json");

function normalizeModuleId(moduleId: string) {
  const withoutVirtualPrefix = moduleId.replace(/^\0+/, "");
  const withoutQuery = withoutVirtualPrefix.split("?", 1)[0] ?? withoutVirtualPrefix;
  const projectRelative = relative(process.cwd(), withoutQuery);
  return projectRelative.startsWith("..") ? withoutQuery : projectRelative;
}

function packageNameFor(moduleId: string) {
  const marker = "/node_modules/";
  const normalized = moduleId.replaceAll("\\", "/");
  const index = normalized.lastIndexOf(marker);
  if (index < 0) return null;
  const rest = normalized.slice(index + marker.length);
  const parts = rest.split("/");
  if (parts[0]?.startsWith("@")) return parts.slice(0, 2).join("/") || null;
  return parts[0] || null;
}

function looksServerOnly(moduleId: string) {
  const normalized = moduleId.replaceAll("\\", "/").split("?", 1)[0] ?? moduleId;
  return (
    /(?:^|\/)server(?:\/|\.|$)/.test(normalized) ||
    /\.server\.[cm]?[jt]sx?$/.test(normalized) ||
    /(?:^|\/)integrations\/.*\.server\.[cm]?[jt]sx?$/.test(normalized)
  );
}

/**
 * Emits module-level attribution for the production browser graph without
 * adding another bundle-analysis dependency. The report distinguishes the
 * launch graph (entry chunks + static imports) from dynamic route chunks, so a
 * budget failure can identify why code is present before the user navigates.
 */
export function clientBundleAttributionPlugin(): Plugin {
  return {
    name: "solaris-client-bundle-attribution",
    apply: "build",
    generateBundle(_outputOptions, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
      const assets = Object.values(bundle).filter((item) => item.type === "asset");

      // TanStack Start also builds a server environment. Only the browser
      // output emits the CSS/assets referenced by the root route; never let a
      // later server bundle overwrite the browser attribution report.
      const hasCssAsset = assets.some((asset) => asset.fileName.endsWith(".css"));
      const hasBrowserRoot = chunks.some((chunk) =>
        Object.keys(chunk.modules).some((moduleId) => {
          const normalized = moduleId.replaceAll("\\", "/");
          return (
            normalized.includes("/src/router.tsx") ||
            normalized.includes("/src/routes/__root.tsx") ||
            normalized.includes("tanstack-start-client")
          );
        }),
      );
      if (!hasCssAsset || !hasBrowserRoot) return;

      const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const entryChunks = chunks.filter((chunk) => chunk.isEntry);
      const initialChunkNames = new Set<string>();
      const queue = entryChunks.map((chunk) => chunk.fileName);

      while (queue.length) {
        const fileName = queue.shift();
        if (!fileName || initialChunkNames.has(fileName)) continue;
        initialChunkNames.add(fileName);
        const chunk = chunksByFileName.get(fileName);
        if (!chunk) continue;
        for (const imported of chunk.imports) queue.push(imported);
      }

      const initialChunks = chunks.filter((chunk) => initialChunkNames.has(chunk.fileName));
      const dynamicChunks = chunks.filter((chunk) => !initialChunkNames.has(chunk.fileName));
      const moduleRows = new Map<
        string,
        {
          module: string;
          package: string | null;
          renderedBytes: number;
          chunks: string[];
          serverOnlyCandidate: boolean;
        }
      >();

      for (const chunk of initialChunks) {
        for (const [moduleId, info] of Object.entries(chunk.modules)) {
          const normalized = normalizeModuleId(moduleId);
          const row = moduleRows.get(moduleId) ?? {
            module: normalized,
            package: packageNameFor(moduleId),
            renderedBytes: 0,
            chunks: [],
            serverOnlyCandidate: looksServerOnly(moduleId),
          };
          row.renderedBytes += info.renderedLength;
          row.chunks.push(chunk.fileName);
          moduleRows.set(moduleId, row);
        }
      }

      const initialModules = [...moduleRows.values()].sort(
        (left, right) => right.renderedBytes - left.renderedBytes,
      );
      const initialPackages = new Map<string, number>();
      for (const row of initialModules) {
        if (!row.package) continue;
        initialPackages.set(row.package, (initialPackages.get(row.package) ?? 0) + row.renderedBytes);
      }

      const packageRows = [...initialPackages.entries()]
        .map(([name, renderedBytes]) => ({ name, renderedBytes }))
        .sort((left, right) => right.renderedBytes - left.renderedBytes);

      const chunkRow = (chunk: (typeof chunks)[number]) => ({
        fileName: chunk.fileName,
        isEntry: chunk.isEntry,
        isDynamicEntry: chunk.isDynamicEntry,
        facadeModuleId: chunk.facadeModuleId ? normalizeModuleId(chunk.facadeModuleId) : null,
        renderedBytes: Buffer.byteLength(chunk.code, "utf8"),
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        moduleCount: Object.keys(chunk.modules).length,
      });

      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        entryChunks: entryChunks.map(chunkRow),
        initialChunks: initialChunks.map(chunkRow).sort((a, b) => b.renderedBytes - a.renderedBytes),
        dynamicChunks: dynamicChunks.map(chunkRow).sort((a, b) => b.renderedBytes - a.renderedBytes),
        topInitialModules: initialModules.slice(0, 20),
        topInitialPackages: packageRows.slice(0, 20),
        serverOnlyCandidatesInInitialGraph: initialModules.filter(
          (module) => module.serverOnlyCandidate,
        ),
      };

      mkdirSync(REPORT_DIR, { recursive: true });
      writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    },
  };
}
