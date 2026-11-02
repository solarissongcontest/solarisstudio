// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath, URL } from "node:url";
import { gzipSync } from "node:zlib";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const browserAudit = process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1";

function bundleCompositionDiagnostics() {
  return {
    name: "solaris-bundle-composition-diagnostics",
    apply: "build" as const,
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string; code?: string; modules?: Record<string, { renderedLength?: number }> }>,
    ) {
      const chunks = Object.values(bundle)
        .filter(
          (entry) =>
            entry.type === "chunk" &&
            entry.fileName.startsWith("assets/") &&
            entry.fileName.endsWith(".js") &&
            typeof entry.code === "string",
        )
        .map((entry) => ({ entry, gzipBytes: gzipSync(entry.code!).byteLength }))
        .sort((a, b) => b.gzipBytes - a.gzipBytes)
        .slice(0, 5);

      for (const { entry, gzipBytes } of chunks) {
        const modules = Object.entries(entry.modules ?? {})
          .map(([id, info]) => ({ id, renderedLength: info.renderedLength ?? 0 }))
          .sort((a, b) => b.renderedLength - a.renderedLength)
          .slice(0, 15);

        console.log(
          `[bundle-composition] ${entry.fileName}: gzip=${gzipBytes} bytes, modules=${Object.keys(entry.modules ?? {}).length}`,
        );
        for (const module of modules) {
          console.log(
            `[bundle-composition]   ${module.renderedLength} bytes ${module.id}`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [bundleCompositionDiagnostics()],
    resolve: {
      // Broadcast uses only canvas-confetti's one-shot default function. Keep
      // that narrow visual contract local instead of shipping the general
      // purpose dependency into the aggregate client budget.
      alias: {
        "canvas-confetti": fileURLToPath(new URL("./src/lib/lightweight-confetti.ts", import.meta.url)),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Consolidate the used icon modules rather than emitting hundreds
          // of independently compressed fragments across route chunks.
          codeSplitting: {
            groups: [{ name: "vendor-icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/ }],
          },
        },
      },
    },
    optimizeDeps: {
      // Browser Audit exercises the complete generated route tree against the
      // dev server. Scan it up front so opening a previously untouched lazy
      // route cannot trigger a mid-audit dependency re-bundle and full-page
      // reload while React is hydrating.
      entries: ["src/router.tsx"],
    },
    server: browserAudit
      ? {
          // The exhaustive installed-app audit intentionally opens the whole
          // route inventory. Pre-transform that frequently used module graph so
          // WebKit does not hit a source-transform waterfall during hydration
          // and cancel the client document while the Vite dev server catches up.
          // This is audit-only; normal local development keeps Vite's lazy
          // transform behavior.
          warmup: {
            clientFiles: [
              "./src/router.tsx",
              "./src/routes/**/*.tsx",
              "./src/components/AppShell.tsx",
              "./src/components/app/**/*.tsx",
              "./src/styles.css",
              "./src/styles/app-shell.css",
            ],
          },
        }
      : undefined,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
