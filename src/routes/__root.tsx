import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import unifiedCss from "../unified-design.css?url";
import accessibilityCss from "../accessibility.css?url";
import anniversaryCss from "../anniversary.css?url";
import cardTypographyCss from "../card-typography.css?url";
import { UnifiedServiceAdminGate } from "../components/admin/UnifiedServiceAdminGate";
import { reportLovableError } from "../lib/lovable-error-reporting";

const SITE_DESCRIPTION =
  "Solaris Studio is the home of Solaris Song Contest editions, results, voting analytics, predictions, records and interactive archive tools.";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
          <Link
            to="/wiki"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Open Wiki
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Solaris Studio" },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "Solaris Studio" },
      { name: "application-name", content: "Solaris Studio" },
      { name: "theme-color", content: "#020817" },
      { property: "og:title", content: "Solaris Studio" },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Solaris Studio" },
      { name: "twitter:description", content: SITE_DESCRIPTION },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: unifiedCss },
      { rel: "stylesheet", href: accessibilityCss },
      { rel: "stylesheet", href: anniversaryCss },
      { rel: "stylesheet", href: cardTypographyCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const serviceAdmin =
    pathname.startsWith("/confirmations/admin") || pathname.startsWith("/televoting/admin");

  const content = serviceAdmin ? (
    <UnifiedServiceAdminGate>
      <Outlet />
    </UnifiedServiceAdminGate>
  ) : (
    <Outlet />
  );

  return (
    <QueryClientProvider client={queryClient}>
      {content}
      <ToolQuickGuide pathname={pathname} />
    </QueryClientProvider>
  );
}

function ToolQuickGuide({ pathname }: { pathname: string }) {
  const guide = pathname.startsWith("/result-lab")
    ? {
        title: "How Result Lab works",
        steps: [
          "Pick a published edition and show.",
          "Change the jury/televote balance, jury scoring or included juries.",
          "Watch the simulated ranking update immediately. There is no Apply button.",
          "Nothing here changes the official SSC result.",
        ],
      }
    : pathname.startsWith("/taste-dna")
      ? {
          title: "What to do in Taste DNA",
          steps: [
            "Choose a published show.",
            "Reorder the entries into your personal ranking with the arrows.",
            "Solaris compares your ranking with the jury, televote, overall result and available juries.",
            "The Official/Jury/Televote buttons are starting presets. Saving is optional.",
          ],
        }
      : null;

  if (!guide) return null;

  return (
    <details
      open
      className="fixed bottom-[5.6rem] right-3 z-[80] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-primary/25 bg-popover/95 shadow-2xl backdrop-blur-xl lg:bottom-5 lg:right-5"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-foreground [&::-webkit-details-marker]:hidden">
        {guide.title} <span className="float-right text-muted-foreground">▾</span>
      </summary>
      <ol className="space-y-2 border-t border-border/70 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        {guide.steps.map((step, index) => (
          <li key={step} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
            <span className="numeric font-bold text-primary">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
