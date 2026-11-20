#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import http from "node:http";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[v3-drop-response-proxy] ${name} is required`);
    process.exit(2);
  }
  return value;
}

const upstream = new URL(required("V3_DROP_PROXY_UPSTREAM"));
if (!["127.0.0.1", "localhost", "::1"].includes(upstream.hostname)) {
  console.error(`[v3-drop-response-proxy] refusing non-loopback upstream ${upstream.hostname}`);
  process.exit(2);
}
if (upstream.protocol !== "http:") {
  console.error("[v3-drop-response-proxy] only local http upstreams are supported");
  process.exit(2);
}

const listenPort = Number(required("V3_DROP_PROXY_PORT"));
if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  console.error("[v3-drop-response-proxy] V3_DROP_PROXY_PORT must be a valid TCP port");
  process.exit(2);
}
const readyPath = required("V3_DROP_PROXY_READY");
const resultPath = required("V3_DROP_PROXY_RESULT");
let handled = false;

function record(payload) {
  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const server = http.createServer((clientRequest, clientResponse) => {
  if (handled) {
    clientResponse.statusCode = 503;
    clientResponse.end();
    return;
  }
  handled = true;

  const chunks = [];
  clientRequest.on("data", (chunk) => chunks.push(chunk));
  clientRequest.on("end", () => {
    const requestBody = Buffer.concat(chunks);
    const headers = { ...clientRequest.headers, host: upstream.host };
    delete headers.connection;
    headers.connection = "close";

    const upstreamRequest = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: clientRequest.method,
        path: clientRequest.url,
        headers,
      },
      (upstreamResponse) => {
        let responseBytes = 0;
        const responseChunks = [];
        upstreamResponse.on("data", (chunk) => {
          responseBytes += chunk.length;
          responseChunks.push(chunk);
        });
        upstreamResponse.on("end", () => {
          const responseBody = Buffer.concat(responseChunks).toString("utf8");
          record({
            ok: true,
            upstreamStatus: upstreamResponse.statusCode ?? null,
            responseBytes,
            responseBody,
            observedAt: new Date().toISOString(),
          });

          // Deliberately do not forward the committed upstream response. The
          // caller sees a transport failure even though the upstream request has
          // completed and its response has been fully consumed by this proxy.
          clientResponse.socket?.destroy();
          server.close();
        });
      },
    );

    upstreamRequest.on("error", (error) => {
      record({ ok: false, error: error.message, observedAt: new Date().toISOString() });
      clientResponse.socket?.destroy();
      server.close();
    });
    upstreamRequest.end(requestBody);
  });
});

server.on("error", (error) => {
  record({ ok: false, error: error.message, observedAt: new Date().toISOString() });
  process.exitCode = 1;
});

server.listen(listenPort, "127.0.0.1", () => {
  writeFileSync(
    readyPath,
    `${JSON.stringify({ ready: true, port: listenPort, upstream: `${upstream.protocol}//${upstream.host}` })}\n`,
    "utf8",
  );
});

setTimeout(() => {
  if (!handled) {
    record({ ok: false, error: "proxy timed out without receiving a request", observedAt: new Date().toISOString() });
    server.close(() => process.exit(3));
  }
}, 30_000).unref();
