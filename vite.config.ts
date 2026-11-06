// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

import { shouldOmitDisabledV3Preview } from "./scripts/v3-disabled-preview-build-policy";

// Match Vite's production mode, including ordinary `vite build` invocation
// when the wrapper evaluates this config before NODE_ENV is initialized.
const isProduction = process.env.NODE_ENV === "production" ||
  (process.env.NODE_ENV === undefined && process.argv.includes("build"));
// An explicitly enabled private preview must remain available in production.
// Respect exported variables first, then the repository's production env files.
const previewFlag = process.env.VITE_SOLARIS_V3_PREVIEW ??
  loadEnv(isProduction ? "production" : "development", process.cwd(), "VITE_").VITE_SOLARIS_V3_PREVIEW;
const omitDisabledV3Preview = shouldOmitDisabledV3Preview(isProduction, previewFlag);
if (process.env.GITHUB_ACTIONS === "true") {
  console.info(`[v3-preview-build] production=${isProduction} previewOptIn=${previewFlag === "1"} omit=${omitDisabledV3Preview}`);
}


const browserAudit = process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1";

export default defineConfig({
  vite: {
    // Resolve the private route import before the TS-paths resolver can turn
    // its @/ specifier into an absolute source path. A normal production build
    // never renders this route because its existing beforeLoad redirects.
    plugins: [
      {
        name: "v3-disabled-preview-build-elision",
        enforce: "pre" as const,
        resolveId(source: string) {
          if (!omitDisabledV3Preview) return null;
          // Vite resolves configured aliases before user pre-plugins. Handle
          // both the original @/ request and its exact resolved file identity.
          const originalFile = fileURLToPath(
            new URL("./src/components/v3/V3FoundationPreview.tsx", import.meta.url),
          ).replaceAll("\\\\", "/");
          const normalizedSource = source.replaceAll("\\\\", "/");
          const matches =
            source === "@/components/v3/V3FoundationPreview" ||
            normalizedSource === originalFile ||
            normalizedSource === originalFile.slice(0, -4);
          if (!matches) return null;
          if (process.env.GITHUB_ACTIONS === "true") {
            console.info("[v3-preview-build] substituting inaccessible production preview");
          }
          return fileURLToPath(
            new URL("./src/components/v3/V3FoundationPreview.disabled.tsx", import.meta.url),
          );
        },
      },
    ],
    resolve: {
      // Broadcast uses only canvas-confetti's one-shot default function. Keep
      // that narrow decorative effect local instead of shipping the general
      // purpose dependency into the aggregate production client payload.
      alias: {
        "canvas-confetti": fileURLToPath(
          new URL("./src/lib/lightweight-confetti.ts", import.meta.url),
        ),

      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Production evidence showed repeated gzip framing across hundreds of
          // tiny Lucide chunks and several TanStack Router helper chunks. Keep
          // package behavior unchanged while consolidating only those vendor
          // modules into stable emitted groups.
          codeSplitting: {
            groups: [
              { name: "vendor-icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
              {
                name: "vendor-router",
                test: /[\\/]node_modules[\\/]@tanstack[\\/]react-router[\\/]/,
              },
              // Shared Radix primitives are used across route-local overlays.
              // Consolidate package internals without pulling route modules
              // into the common client bundle.
              {
                name: "vendor-radix",
                test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              },
              // Keep large chart vendors behind their existing lazy screen
              // boundaries, sharing internals instead of emitting fragments.
              {
                name: "vendor-charts",
                test: /[\\/]node_modules[\\/](?:recharts|victory-vendor)[\\/]/,
              },
              // Motion and data-cache internals appear in many route chunks.
              // Group only package implementation, preserving lazy page imports.
              {
                name: "vendor-motion",
                test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
              },
              {
                name: "vendor-query",
                test: /[\\/]node_modules[\\/]@tanstack[\\/](?:react-query|query-core)[\\/]/,
              },
              {
                name: "vendor-floating",
                test: /[\\/]node_modules[\\/]@floating-ui[\\/]/,
              },
              // The public session, database and storage clients already
              // share this SDK. Keep its package internals consolidated
              // instead of repeatedly framing tiny route-local chunks.
              {
                name: "vendor-supabase",
                test: /[\\/]node_modules[\\/]@supabase[\\/]/,
              },
              // Share app-level presentation primitives used by multiple
              // lazy routes without grouping any one-off screens or domain code.
              // This reduces duplicated chunk wrappers while keeping the actual
              // page components behind their existing route import boundaries.
              {
                name: "shared-app-primitives",
                test: /[\\/]src[\\/]components[\\/]app[\\/]/,
                minShareCount: 2,
                minSize: 6000,
                priority: 1,
              },
              // Collapse small, frequently reused UI control adapters instead
              // of repeating module shells and gzip framing across lazy routes.
              // A minimum two-entry share prevents one-off page components
              // from being pulled into the common browser payload. The lower
              // minimum size groups smaller reused controls across directories.
              {
                name: "shared-controls",
                test: /[\\/]src[\\/]components[\\/]ui[\\/]/,
                minShareCount: 2,
                minSize: 5000,
                priority: 1,
              },
            ],
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
