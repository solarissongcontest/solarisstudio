import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function deploymentBasepath() {
  if (typeof window === "undefined") return "/";
  const pathname = window.location.pathname;
  return pathname === "/dev" || pathname.startsWith("/dev/") ? "/dev" : "/";
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    basepath: deploymentBasepath(),
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
