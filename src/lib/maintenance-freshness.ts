export const MAINTENANCE_FRESHNESS_PATH = "/__maintenance-admin/version";
export const MAINTENANCE_FRESHNESS_POLL_MS = 15_000;

function safeJavaScriptString(value: string) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function renderMaintenanceFreshnessClient(version: string) {
  const currentVersion = safeJavaScriptString(version);
  const endpoint = safeJavaScriptString(MAINTENANCE_FRESHNESS_PATH);

  return `<script data-solaris-maintenance-freshness>
(() => {
  const currentVersion = ${currentVersion};
  const endpoint = ${endpoint};
  const pollMs = ${MAINTENANCE_FRESHNESS_POLL_MS};
  let checking = false;

  const checkForFreshDeployment = async () => {
    if (checking || document.hidden) return;
    checking = true;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        window.location.reload();
        return;
      }
      if (!response.ok) return;

      const payload = await response.json();
      if (
        typeof payload?.version === "string" &&
        payload.version &&
        payload.version !== currentVersion
      ) {
        window.location.reload();
      }
    } catch {
      // A transient network failure should not interrupt the current app. The
      // next bounded check will try again without touching Solaris data APIs.
    } finally {
      checking = false;
    }
  };

  window.setInterval(checkForFreshDeployment, pollMs);
  window.addEventListener("focus", checkForFreshDeployment, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkForFreshDeployment();
  });
})();
</script>`;
}

export async function attachMaintenanceFreshness(
  response: Response,
  version: string,
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const source = await response.text();
  const client = renderMaintenanceFreshnessClient(version);
  const html = source.includes("</body>")
    ? source.replace("</body>", `${client}\n</body>`)
    : `${source}\n${client}`;
  const headers = new Headers(response.headers);

  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.delete("content-length");
  headers.delete("etag");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function maintenanceFreshnessResponse(method: string, version: string) {
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "cache-control": "no-store, max-age=0",
      },
    });
  }

  return new Response(
    method === "HEAD" ? null : JSON.stringify({ version }),
    {
      status: 200,
      headers: {
        "cache-control": "no-store, max-age=0",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
